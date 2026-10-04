#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Saropa Chat Search: publish pipeline (VS Code Marketplace + Open VSX).

Mirrors the Saropa publish scripts (same step order, flag style, exit codes).
SAFE BY DEFAULT: with no flags it runs preflight, build and package only.
Stores, tag push and GitHub release run only with --publish.

Usage:
  python3 scripts/publish.py                  # dry run: preflight + build + package
  python3 scripts/publish.py --publish        # real publish (needs tokens)
  python3 scripts/publish.py --publish --skip-openvsx --skip-release
  python3 scripts/publish.py --allow-dirty    # dry run on a dirty tree (never with --publish)

Flags: --publish, --skip-marketplace, --skip-openvsx, --skip-tag, --skip-release,
       --allow-dirty, --no-color.
Environment: VSCE_PAT (Marketplace), OVSX_PAT (Open VSX). Values are never printed.

Exit codes:
  0 success            6 STORE_CHECK_FAILED   11 GIT_FAILED
  1 PREREQUISITE       7 PACKAGE_FAILED       12 PUBLISH_FAILED
  2 TREE_DIRTY         8 CONTENT_FAILED       13 RELEASE_FAILED
  3 REMOTE_SYNC        9 TOKEN_MISSING
  4 VERSION_MISMATCH  10 TAG_EXISTS
  5 BUILD_FAILED
"""

import argparse
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRANCH = "main"
ALLOWED_URL = "github.com/saropa/claude-chat-search"
REQUIRED_IN_VSIX = {
    "extension/package.json": "package.json",
    "extension/images/icon.png": "images/icon.png",
    "extension/out/extension.js": "out/extension.js",
    "extension/out/worker.js": "out/worker.js",
    "extension/readme.md": "README.md",
    "extension/license.txt": "LICENSE",
    "extension/changelog.md": "CHANGELOG.md",
}
FORBIDDEN_IN_VSIX = ("extension/plans/", "extension/scripts/", "extension/src/")

EXIT = dict(
    PREREQUISITE=1, TREE_DIRTY=2, REMOTE_SYNC=3, VERSION_MISMATCH=4, BUILD_FAILED=5,
    STORE_CHECK_FAILED=6, PACKAGE_FAILED=7, CONTENT_FAILED=8, TOKEN_MISSING=9,
    TAG_EXISTS=10, GIT_FAILED=11, PUBLISH_FAILED=12, RELEASE_FAILED=13,
)

_color = sys.stdout.isatty()


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _color else text


def heading(text: str) -> None:
    print(f"\n{_c('36', '=' * 60)}\n  {_c('1', text)}\n{_c('36', '=' * 60)}")


def ok(text: str) -> None:
    print(f"  {_c('32', '[OK]')}   {text}")


def fail(text: str) -> None:
    print(f"  {_c('31', '[FAIL]')} {text}")


def warn(text: str) -> None:
    print(f"  {_c('33', '[WARN]')} {text}")


def info(text: str) -> None:
    print(f"  {_c('34', '[INFO]')} {text}")


def die(code: str, reason: str) -> None:
    """Print a one-line reason and exit non-zero."""
    fail(reason)
    print(f"\n  Exit {EXIT[code]} ({code}): {reason}")
    sys.exit(EXIT[code])


def run(cmd: list[str], env: dict | None = None) -> subprocess.CompletedProcess:
    """Run a command in the repo root, capturing text output."""
    try:
        return subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True)
    except FileNotFoundError:
        return subprocess.CompletedProcess(cmd, 127, "", f"{cmd[0]}: not found")


def tail(proc: subprocess.CompletedProcess, lines: int = 12) -> str:
    out = (proc.stdout + "\n" + proc.stderr).strip().splitlines()
    return "\n".join("         " + ln for ln in out[-lines:])


# ── Steps ────────────────────────────────────────────────────


def step_prereqs(args) -> None:
    heading("Step 1: Prerequisites")
    needs = ["git", "node", "npm", "npx"] + (["gh"] if args.publish and not args.skip_release else [])
    for tool in needs:
        res = run([tool, "--version"])
        if res.returncode != 0:
            die("PREREQUISITE", f"{tool} not found on PATH")
        ok(f"{tool} {res.stdout.strip().splitlines()[0]}")
    if args.publish and not args.skip_release:
        if run(["gh", "auth", "status"]).returncode != 0:
            die("PREREQUISITE", "gh is not logged in (run: gh auth login)")
        ok("gh authenticated")


def step_tokens(args) -> dict:
    """Return which stores will run. Missing token: skip (dry run) or fail (--publish)."""
    heading("Step 2: Store tokens")
    plan = {}
    for key, var, skipped in (
        ("marketplace", "VSCE_PAT", args.skip_marketplace),
        ("openvsx", "OVSX_PAT", args.skip_openvsx),
    ):
        if skipped:
            info(f"{key}: skipped by flag")
            plan[key] = False
        elif os.environ.get(var, "").strip():
            ok(f"{var} is set ({key})")
            plan[key] = True
        elif args.publish:
            die("TOKEN_MISSING", f"{var} is not set; cannot publish to {key} (or pass --skip-{key})")
        else:
            warn(f"{var} is not set; {key} would be skipped (a --publish run would fail)")
            plan[key] = False
    return plan


def step_tree(args) -> None:
    heading("Step 3: Working tree, branch, remote sync")
    dirty = run(["git", "status", "--porcelain"]).stdout.strip()
    if dirty and not args.allow_dirty:
        die("TREE_DIRTY", f"working tree is not clean ({len(dirty.splitlines())} changed paths)")
    if dirty:
        warn("tree is dirty; allowed for this dry run (--allow-dirty)")
    else:
        ok("working tree clean")
    branch = run(["git", "branch", "--show-current"]).stdout.strip()
    if branch != BRANCH:
        die("REMOTE_SYNC", f"on branch '{branch}', expected '{BRANCH}'")
    ok(f"on {BRANCH}")
    if run(["git", "fetch", "origin"]).returncode != 0:
        die("REMOTE_SYNC", "git fetch origin failed")
    counts = run(["git", "rev-list", "--left-right", "--count", f"HEAD...origin/{BRANCH}"]).stdout.split()
    if len(counts) != 2:
        die("REMOTE_SYNC", f"cannot compare HEAD with origin/{BRANCH}")
    ahead, behind = int(counts[0]), int(counts[1])
    if ahead or behind:
        msg = f"not in sync with origin/{BRANCH} (ahead {ahead}, behind {behind})"
        if args.allow_dirty and not args.publish:
            warn(msg + "; allowed for this dry run")
        else:
            die("REMOTE_SYNC", msg)
    else:
        ok(f"in sync with origin/{BRANCH}")


def read_pkg() -> dict:
    return json.loads((ROOT / "package.json").read_text(encoding="utf-8"))


def changelog_version() -> str:
    for line in (ROOT / "CHANGELOG.md").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^##\s+\[?(\d+\.\d+\.\d+[^\]\s]*)\]?", line)
        if m:
            return m.group(1)
    return ""


def step_version(args) -> str:
    heading("Step 4: Version, CHANGELOG, tag")
    version = read_pkg().get("version", "")
    top = changelog_version()
    if not version or version != top:
        die("VERSION_MISMATCH", f"package.json version '{version}' != top CHANGELOG heading '{top}'")
    ok(f"package.json and CHANGELOG agree on {version}")
    tag = f"v{version}"
    if run(["git", "tag", "-l", tag]).stdout.strip():
        die("TAG_EXISTS", f"git tag {tag} already exists locally")
    remote = run(["git", "ls-remote", "--tags", "origin", tag])
    if remote.returncode == 0 and remote.stdout.strip():
        die("TAG_EXISTS", f"git tag {tag} already exists on origin")
    ok(f"tag {tag} does not exist")
    return version


def png_size(path: Path) -> tuple[int, int]:
    head = path.read_bytes()[:24]
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return (0, 0)
    return struct.unpack(">II", head[16:24])


def step_store_checks() -> None:
    heading("Step 5: Store metadata checks")
    pkg = read_pkg()
    errors = []
    pub = pkg.get("publisher", "")
    if not pub or pub == "local":
        errors.append(f"publisher is '{pub}'")
    repo = pkg.get("repository")
    if not (isinstance(repo, dict) and repo.get("url")) and not isinstance(repo, str):
        errors.append("repository missing")
    for key in ("license", "description"):
        if not pkg.get(key):
            errors.append(f"{key} missing")
    for key in ("keywords", "categories"):
        if not pkg.get(key):
            errors.append(f"{key} missing or empty")
    icon = pkg.get("icon", "")
    if not icon.lower().endswith(".png") or not (ROOT / icon).is_file():
        errors.append(f"icon is not an existing PNG ({icon})")
    else:
        w, h = png_size(ROOT / icon)
        if w < 128 or h < 128:
            errors.append(f"icon is {w}x{h}, needs at least 128x128")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for target in re.findall(r"!\[[^\]]*\]\(([^)\s]+)", readme) + re.findall(r"<img[^>]+src=[\"']([^\"']+)", readme):
        if not re.match(r"(https?:|data:)", target):
            errors.append(f"README has a relative image: {target}")
    url_re = re.compile(r"https?://[^\s\"')>\]]+")
    for name in ("package.json", "README.md", "CHANGELOG.md"):
        for url in url_re.findall((ROOT / name).read_text(encoding="utf-8")):
            if ALLOWED_URL not in url:
                errors.append(f"{name} has a non-Saropa URL: {url}")
    if errors:
        for e in errors:
            fail(e)
        die("STORE_CHECK_FAILED", f"{len(errors)} store check(s) failed; first: {errors[0]}")
    ok(f"publisher {pub}, license, description, keywords, categories, icon {w}x{h}")
    ok("README has no relative images; no non-Saropa URLs")


def step_build() -> None:
    heading("Step 6: Manifest check and compile")
    for label, cmd in (
        ("manifest check", ["node", "scripts/check_manifest.js"]),
        ("npm run compile", ["npm", "run", "compile"]),
    ):
        res = run(cmd)
        if res.returncode != 0:
            print(tail(res))
            die("BUILD_FAILED", f"{label} failed")
        ok(f"{label} passed")


def step_package(version: str) -> Path:
    heading("Step 7: Package .vsix")
    res = run(["npm", "run", "package"])
    vsix = ROOT / f"claude-chat-search-{version}.vsix"
    if res.returncode != 0 or not vsix.is_file():
        print(tail(res))
        die("PACKAGE_FAILED", "npm run package did not produce the .vsix")
    ok(f"created {vsix.name} ({vsix.stat().st_size / 1024:.0f} KB)")
    names = [n.lower() for n in zipfile.ZipFile(vsix).namelist()]
    missing = [src for inner, src in REQUIRED_IN_VSIX.items() if inner not in names]
    bad = [n for n in names if n.startswith(FORBIDDEN_IN_VSIX)]
    if missing:
        die("CONTENT_FAILED", f".vsix is missing: {', '.join(missing)}")
    if bad:
        die("CONTENT_FAILED", f".vsix contains forbidden paths, e.g. {bad[0]}")
    ok(f"{len(names)} files; required files present; plans/, scripts/, src/ absent")
    return vsix


def extract_notes(version: str) -> str:
    out, on = [], False
    for line in (ROOT / "CHANGELOG.md").read_text(encoding="utf-8").splitlines():
        if re.match(rf"^##\s+\[?{re.escape(version)}\]?", line):
            on = True
        elif on and line.startswith("## "):
            break
        elif on:
            out.append(line)
    return "\n".join(out).strip() or f"Release {version}"


def store_publish(label: str, cmd: list[str]) -> None:
    info(f"Publishing to {label}...")
    res = run(cmd)
    if res.returncode != 0:
        print(tail(res))
        die("PUBLISH_FAILED", f"{label} publish failed")
    ok(f"published to {label}")


def step_publish(args, plan: dict, version: str, vsix: Path) -> None:
    tag = f"v{version}"
    heading("Step 8: Publish" if args.publish else "Step 8: Publish (dry run, nothing sent)")
    cmds = []
    if plan["marketplace"] or not args.publish:
        cmds.append(("VS Code Marketplace", not args.skip_marketplace, ["npx", "@vscode/vsce", "publish", "--packagePath", str(vsix)], plan["marketplace"]))
    if plan["openvsx"] or not args.publish:
        cmds.append(("Open VSX", not args.skip_openvsx, ["npx", "ovsx", "publish", str(vsix)], plan["openvsx"]))
    for label, wanted, cmd, has_token in cmds:
        if not args.publish:
            note = "" if has_token else " (token not set: would be skipped)"
            if wanted:
                info(f"would run: {' '.join(cmd)}{note}")
            continue
        store_publish(label, cmd)  # tokens are read from VSCE_PAT / OVSX_PAT by the tools
    if not args.skip_tag:
        steps = [["git", "tag", "-a", tag, "-m", f"Release {version}"], ["git", "push", "origin", tag]]
        for cmd in steps:
            if not args.publish:
                info(f"would run: {' '.join(cmd)}")
            elif run(cmd).returncode != 0:
                die("GIT_FAILED", f"'{' '.join(cmd)}' failed")
        if args.publish:
            ok(f"tag {tag} created and pushed")
    if args.skip_release or args.skip_tag:
        info("GitHub release: skipped" + (" (needs the tag)" if args.skip_tag and not args.skip_release else ""))
        return
    release = ["gh", "release", "create", tag, str(vsix), "--title", tag, "--notes-file", "<changelog entry>"]
    if not args.publish:
        info(f"would run: {' '.join(release)}")
        info(f"release notes: {len(extract_notes(version).splitlines())} lines from the {version} CHANGELOG entry")
        return
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
        f.write(extract_notes(version))
    release[-1] = f.name
    try:
        res = run(release)
    finally:
        os.unlink(f.name)
    if res.returncode != 0:
        print(tail(res))
        die("RELEASE_FAILED", "gh release create failed")
    ok(f"GitHub release {tag} created")


def main() -> None:
    global _color
    ap = argparse.ArgumentParser(description="Preflight, build, package and (with --publish) publish.")
    ap.add_argument("--publish", action="store_true", help="Really publish, push the tag and create the release.")
    ap.add_argument("--skip-marketplace", action="store_true", help="Skip the VS Code Marketplace.")
    ap.add_argument("--skip-openvsx", action="store_true", help="Skip Open VSX.")
    ap.add_argument("--skip-tag", action="store_true", help="Do not create or push the git tag (also skips the release).")
    ap.add_argument("--skip-release", action="store_true", help="Do not create the GitHub release.")
    ap.add_argument("--allow-dirty", action="store_true", help="Dry run only: tolerate a dirty or unsynced tree.")
    ap.add_argument("--no-color", action="store_true", help="Plain output.")
    args = ap.parse_args()
    if args.no_color:
        _color = False
    if args.publish and args.allow_dirty:
        die("PREREQUISITE", "--allow-dirty cannot be combined with --publish")
    print(f"Saropa Chat Search publish: {'PUBLISH' if args.publish else 'DRY RUN (nothing will be published)'}")
    step_prereqs(args)
    plan = step_tokens(args)
    step_tree(args)
    version = step_version(args)
    step_store_checks()
    step_build()
    vsix = step_package(version)
    step_publish(args, plan, version, vsix)
    heading("Done")
    ok("published" if args.publish else "dry run complete; nothing was published, tagged or released")


if __name__ == "__main__":
    main()
