"""Regenerate images/activity_panel.gif from a screen recording.

Usage:
    python scripts/make_activity_gif.py <source.mp4|.mov|.webm> [--width 480] [--fps 15]

Why a script: the README GIF goes stale whenever the Activity UI changes, and the
ffmpeg settings that keep it small (palette generation, dither, loop) are easy to
forget. One command keeps every refresh identical.
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# Output lives next to the README's other images; the README embeds this exact path.
OUTPUT = Path(__file__).resolve().parent.parent / "images" / "activity_panel.gif"

# Fallback for machines where ffmpeg is not on PATH (author's install location).
FALLBACK_FFMPEG = Path(r"D:\tools\ffmpeg-7.1.1-essentials_build\bin\ffmpeg.exe")

# Size budget: the GIF loads in the README and ships in the VSIX, so warn above this.
MAX_BYTES = 1_500_000


def find_ffmpeg() -> str:
    """Return the ffmpeg executable path, or exit with a clear message."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    if FALLBACK_FFMPEG.exists():
        return str(FALLBACK_FFMPEG)
    sys.exit("ffmpeg not found on PATH or at " + str(FALLBACK_FFMPEG))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="screen recording to convert")
    parser.add_argument("--width", type=int, default=480, help="output width in px")
    parser.add_argument("--fps", type=int, default=15, help="output frame rate")
    args = parser.parse_args()

    if not args.source.is_file():
        sys.exit(f"source not found: {args.source}")

    # Two-pass palette: a per-clip 96-colour palette keeps the dark UI crisp while
    # holding the file near 900 KB; Bayer dither avoids banding on the glows.
    filters = (
        f"fps={args.fps},scale={args.width}:-1:flags=lanczos,split[a][b];"
        "[a]palettegen=max_colors=96[p];"
        "[b][p]paletteuse=dither=bayer:bayer_scale=4"
    )
    cmd = [
        find_ffmpeg(), "-v", "error", "-y", "-i", str(args.source),
        "-vf", filters, "-loop", "0", str(OUTPUT),
    ]
    result = subprocess.run(cmd)
    if result.returncode != 0:
        return result.returncode

    size = OUTPUT.stat().st_size
    print(f"wrote {OUTPUT} ({size / 1024:.0f} KB)")
    # Visible outcome for the size budget, not a silent pass.
    if size > MAX_BYTES:
        print(f"WARNING: over the {MAX_BYTES // 1024} KB budget; lower --width or --fps")
    return 0


if __name__ == "__main__":
    sys.exit(main())
