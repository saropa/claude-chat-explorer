#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Saropa Chats: build the extension and install it into local VS Code for testing.

Usage:
  python scripts/install_local.py                 # npm run package, then install
  python scripts/install_local.py --skip-package  # install the existing .vsix
  python scripts/install_local.py --code <path>   # use a specific VS Code CLI

Environment: VSCODE_CLI overrides the CLI lookup (the --code flag wins over it).

Exit codes:
  0 success            3 VSIX_MISSING
  1 PREREQUISITE       4 INSTALL_FAILED
  2 PACKAGE_FAILED     5 VERIFY_FAILED

A failed `npm run package` always exits 2; npm's own exit code is printed in the message.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Resolved from the script's own location so the cwd of the caller (VS Code task,
# shell, CI) never matters.
ROOT = Path(__file__).resolve().parent.parent

# Environment variable that overrides the CLI lookup; named once, used in help and code.
CLI_ENV_VAR = "VSCODE_CLI"

EXIT = dict(PREREQUISITE=1, PACKAGE_FAILED=2, VSIX_MISSING=3, INSTALL_FAILED=4, VERIFY_FAILED=5)


def fail_exit(code: str, reason: str) -> None:
    """Print a one-line reason and exit with the named code."""
    print(f"  [FAIL] {reason}")
    print(f"\n  Exit {EXIT[code]} ({code})")
    sys.exit(EXIT[code])


def run(cmd: list[str], capture: bool = False) -> subprocess.CompletedProcess:
    """Run a command in the repo root; stream its output unless `capture` is set."""
    # On Windows CreateProcess only auto-appends ".exe", so npm.cmd / code.cmd shims
    # raise FileNotFoundError when given as bare names. shutil.which honors PATHEXT
    # and returns the full shim path; an unresolvable name falls through unchanged
    # and hits the FileNotFoundError branch below.
    resolved = shutil.which(cmd[0])
    if resolved:
        cmd = [resolved] + cmd[1:]
    try:
        if capture:
            return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, stdin=subprocess.DEVNULL)
        # No capture: the child inherits our stdout/stderr, so the long package
        # step shows progress live instead of appearing hung.
        return subprocess.run(cmd, cwd=ROOT, stdin=subprocess.DEVNULL)
    except FileNotFoundError:
        return subprocess.CompletedProcess(cmd, 127, "", f"{cmd[0]}: not found")


def read_pkg() -> dict:
    """Read package.json next to the script's repo root (never hardcode its values)."""
    return json.loads((ROOT / "package.json").read_text(encoding="utf-8"))


def find_code_cli(override: str | None) -> str:
    """Return the VS Code CLI path, honoring --code, then VSCODE_CLI, then PATH.

    Plain `code` is deliberately never resolved: on Windows it can resolve to
    Code.exe (the GUI binary), which silently ignores --install-extension and
    exits 0, making a failed install look like a success. The code.cmd shim is
    the real CLI entry point on Windows."""
    explicit = override or os.environ.get(CLI_ENV_VAR, "").strip()
    if explicit:
        # An explicit path is trusted but must exist, so a typo fails here and
        # not as an obscure error from the install step.
        resolved = shutil.which(explicit) or (explicit if Path(explicit).is_file() else None)
        if not resolved:
            fail_exit("PREREQUISITE", f"VS Code CLI not found at '{explicit}' (from --code or {CLI_ENV_VAR})")
        return resolved
    name = "code.cmd" if sys.platform == "win32" else "code"
    found = shutil.which(name)
    if not found:
        fail_exit("PREREQUISITE", f"'{name}' not found on PATH; pass --code <path> or set {CLI_ENV_VAR}")
    return found


def package() -> None:
    """Build the .vsix via `npm run package` and confirm it exists."""
    print("\n== Package ==")
    res = run(["npm", "run", "package"])
    if res.returncode != 0:
        # Bug fix: the script used to exit with npm's own code, which could be 0-adjacent or
        # collide with this script's other codes (1 PREREQUISITE, 3, 4, 5). Always exit with
        # the documented PACKAGE_FAILED code and print npm's code in the message instead.
        fail_exit("PACKAGE_FAILED", f"'npm run package' failed with exit code {res.returncode}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the extension and install it into local VS Code.")
    ap.add_argument("--skip-package", action="store_true", help="Install the existing .vsix without rebuilding.")
    ap.add_argument("--code", metavar="PATH", help=f"VS Code CLI to use (default: code.cmd/code on PATH, or ${CLI_ENV_VAR}).")
    args = ap.parse_args()

    pkg = read_pkg()
    name, version, publisher = pkg["name"], pkg["version"], pkg["publisher"]
    # `vsce package` names its output <name>-<version>.vsix in the cwd (repo root).
    vsix = ROOT / f"{name}-{version}.vsix"
    ext_id = f"{publisher}.{name}@{version}"

    cli = find_code_cli(args.code)
    print(f"  [INFO] VS Code CLI: {cli}")

    if args.skip_package:
        print("  [INFO] --skip-package: using the existing .vsix")
    else:
        package()

    # Checked even after a successful package: npm can exit 0 without writing the
    # file if the script's output name drifts from package.json.
    if not vsix.is_file():
        fail_exit("VSIX_MISSING", f"expected .vsix not found: {vsix}")
    print(f"  [OK]   {vsix.name} ({vsix.stat().st_size / 1024:.0f} KB)")

    print("\n== Install ==")
    # --force reinstalls over the same version, which is the normal local-test loop.
    res = run([cli, "--install-extension", str(vsix), "--force"])
    if res.returncode != 0:
        fail_exit("INSTALL_FAILED", f"'--install-extension' failed with exit code {res.returncode}")

    print("\n== Verify ==")
    listing = run([cli, "--list-extensions", "--show-versions"], capture=True)
    # Compare whole lines, case-insensitively: extension ids are case-insensitive
    # and a substring match would accept a longer version such as 1.0.01.
    installed = [ln.strip().lower() for ln in listing.stdout.splitlines()]
    if listing.returncode != 0 or ext_id.lower() not in installed:
        fail_exit("VERIFY_FAILED", f"{ext_id} not found in '--list-extensions --show-versions'")
    print(f"  [OK]   installed {ext_id}")
    print('\n  Next: run "Developer: Reload Window" in VS Code to load the new build.')


if __name__ == "__main__":
    main()
