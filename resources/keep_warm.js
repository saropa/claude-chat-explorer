#!/usr/bin/env node
/*
 * Keep-warm Stop hook (asyncRewake) for Claude Code.
 *
 * Why: the prompt cache here has a 1-hour lifetime. Returning to an idle session
 * after that re-writes the whole conversation at the 2x write rate. A ~15-token
 * reply every 50 idle minutes re-reads the cache (0.05x) and resets the timer.
 *
 * How it works:
 *   * Registered as a Stop hook with asyncRewake=true. Every turn end starts one
 *     watcher process (this script) that runs in the background.
 *   * A newer Stop supersedes the older watcher via a token in a per-session
 *     state file; the older one exits 0 (silent) on its next poll.
 *   * After IDLE_MINUTES with no transcript activity the watcher exits 2 with an
 *     instruction on stderr; asyncRewake wakes the session and Claude replies
 *     "warm - <time>". That turn's Stop starts the next watcher.
 *   * A reply starting with the warm marker is a ping turn; any other reply is a
 *     real turn and resets the consecutive-ping counter. MAX_PINGS caps a
 *     forgotten session.
 *
 * Off switches (either file disables pings):
 *   * Global:      ~/.claude/keepwarm.off
 *   * Per project: <session cwd>/.claude/keepwarm.off
 *
 * Port of keep_warm.py to dependency-free Node.js. The Saropa Chats extension
 * copies this file to ~/.claude/saropa-chats/keep_warm.js and registers it as
 * the Stop hook when the setting saropaChats.keepWarm.enabled is on.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// --- Single source of truth for every tunable -------------------------------
const IDLE_MINUTES = 50; // Ping this long after last activity; cache lives 60.
const POLL_SECONDS = 60; // Watcher wake interval.
const MAX_PINGS = 20; // Consecutive pings before waiting for a real message.
const MAX_RUNTIME_MINUTES = 62; // Watcher self-terminates; must stay under hook timeout.
const WARM_MARKER = 'warm ·'; // Prefix the ping reply must start with ("warm · ").
const TAIL_BYTES = 65536; // Transcript tail window searched for the last assistant entry.
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const STATE_DIR = path.join(CLAUDE_DIR, 'keepwarm');
const GLOBAL_OFF = path.join(CLAUDE_DIR, 'keepwarm.off');
const LOG_FILE = path.join(STATE_DIR, 'log.jsonl');

/** Promise-based sleep so the watcher does not block the event loop. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Seconds since the epoch as a float, matching Python's time.time() used in the log. */
const nowSec = () => Date.now() / 1000;

/** True when the path exists; fs.existsSync never throws, which keeps callers simple. */
const exists = (p) => fs.existsSync(p);

/** Per-project switch: lets one noisy or throwaway project opt out. */
function projectOff(cwd) {
  return Boolean(cwd) && exists(path.join(cwd, '.claude', 'keepwarm.off'));
}

/** True when either the global or the project off-switch file exists. */
function disabled(cwd) {
  return exists(GLOBAL_OFF) || projectOff(cwd);
}

/** Load the session state; a missing/corrupt file is treated as fresh. */
function readState(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    // A non-object (array, number) is as good as corrupt.
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) {
    return {};
  }
}

/**
 * Return usage of the last assistant entry (tail read only).
 *
 * Reading the whole transcript would be wasteful on multi-MB files; the last
 * 64 KB always contains the most recent assistant entry.
 */
function lastUsage(transcript) {
  let tail;
  try {
    const fd = fs.openSync(transcript, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const start = Math.max(0, size - TAIL_BYTES);
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      tail = buf.toString('utf8'); // invalid bytes become U+FFFD, like errors="replace"
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    return {};
  }
  const lines = tail.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch (e) {
      continue; // first line of the tail window may be cut mid-JSON
    }
    if (entry && entry.type === 'assistant') {
      return (entry.message && entry.message.usage) || {};
    }
  }
  return {};
}

/** Append one JSON line; logging must never break the hook. */
function log(event) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(event) + '\n', 'utf8');
  } catch (e) {
    /* ignored on purpose: a full disk or locked file must not fail the session */
  }
}

/** Read all of stdin as text (the hook payload is one JSON document). */
function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

/** 12-hour clock without a leading zero ("9:05 AM"), like strftime("%I:%M %p").lstrip("0"). */
function stamp() {
  const d = new Date();
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Returns the process exit code: 0 silent, 2 wake the session with stderr. */
async function main() {
  let data;
  try {
    data = JSON.parse(await readStdin());
  } catch (e) {
    return 0; // No usable input: stay silent rather than error the session.
  }
  if (!data || typeof data !== 'object') {
    return 0; // Valid JSON but not an object: nothing to read a session from.
  }
  const session = data.session_id || '';
  const cwd = data.cwd || '';
  const transcript = data.transcript_path || '';
  // Session ids become file names; reject path separators so a hostile id cannot escape STATE_DIR.
  if (!session || /[\\/]/.test(session) || process.env.CLAUDE_CODE_REMOTE) {
    return 0; // Remote sessions are not ours to keep warm.
  }

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const statePath = path.join(STATE_DIR, `${session}.json`);
  const state = readState(statePath);

  // Classify the turn that just ended: ping turn keeps the count, real turn resets.
  const reply = String(data.last_assistant_message || '').trimStart();
  const isPingTurn = reply.startsWith(WARM_MARKER);
  const stored = parseInt(state.pings, 10);
  const pings = isPingTurn && Number.isFinite(stored) ? stored : 0;

  if (isPingTurn) {
    // Record whether the ping hit the cache (big read, tiny write expected).
    const u = lastUsage(transcript);
    log({
      t: nowSec(), session, cwd, pings,
      cache_read: u.cache_read_input_tokens ?? null,
      cache_creation: u.cache_creation_input_tokens ?? null,
    });
  }

  // Publish a fresh token FIRST so any older watcher retires even when this
  // session is capped/disabled below.
  const token = `${BigInt(Date.now()) * 1000000n + (process.hrtime.bigint() % 1000000n)}-${process.pid}`;
  fs.writeFileSync(statePath, JSON.stringify({ token, pings }), 'utf8');

  if (pings >= MAX_PINGS || disabled(cwd)) {
    return 0; // Capped or switched off: no watcher until a real message.
  }

  const started = nowSec();
  const deadline = started + MAX_RUNTIME_MINUTES * 60;
  while (nowSec() < deadline) {
    await sleep(POLL_SECONDS * 1000);
    if (readState(statePath).token !== token) {
      return 0; // Superseded by a newer turn; that watcher owns the timer.
    }
    if (disabled(cwd)) {
      return 0; // Switch flipped while waiting.
    }
    // Idle = time since the later of watcher start and transcript write.
    // The transcript mtime guards against a single turn running past 50 min.
    let lastActive;
    try {
      lastActive = Math.max(started, fs.statSync(transcript).mtimeMs / 1000);
    } catch (e) {
      lastActive = started;
    }
    if (nowSec() - lastActive >= IDLE_MINUTES * 60) {
      // Count the ping before waking so a crash cannot cause unbounded pings.
      fs.writeFileSync(statePath, JSON.stringify({ token, pings: pings + 1 }), 'utf8');
      // Model has no clock, so the script supplies the timestamp.
      const msg = `Keep-warm ping. Reply with exactly "${WARM_MARKER} ${stamp()}" and nothing `
        + 'else. No tools, no file changes, no other text.';
      // UTF-8 explicitly: the marker has a middle dot.
      await new Promise((resolve) => process.stderr.write(Buffer.from(msg, 'utf8'), resolve));
      return 2; // asyncRewake: exit 2 wakes the idle session with stderr.
    }
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  () => process.exit(0), // Any unexpected failure must never surface as a wake-up (exit 2).
);
