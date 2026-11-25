# README Activity panel GIF

The README described the Activity diagram's live behavior (nodes lighting up as Claude works) but showed only a still image. This change adds an animated GIF of the diagram to the README.

## Finish Report (2026-11-25)

**Scope:** docs and assets only.

**Changes**
- `images/activity_panel.gif` added: converted from a 584x502, 11 s, 60 fps screen recording with ffmpeg (480 px wide, 15 fps, 96-color palette, Bayer dither, looping). Size 887 KB.
- `README.md` embeds the GIF below the sidebar still, using the same `raw.githubusercontent` URL style as the existing image.
- `CHANGELOG.md` has an "Added" line under 1.0.0.
- `bugs/docs_readme_screenshot_old_name.md` Changes Made updated: GIF step done, screenshot step open.

**Hardening**
- Output GIF frame 60 inspected: Activity diagram, Web node lit, "Running: tests" caption, no browser chrome; quality at 96 colors is legible.
- `scripts/make_activity_gif.py` added: regenerates the GIF from a recording with the same ffmpeg settings and warns above 1.5 MB. Re-running it on the source recording reproduces the committed file byte for byte (git reports no change).
- `.vscodeignore` does not exclude `images/`, so the GIF ships inside the VSIX (887 KB). The README uses raw GitHub URLs, so the bundled copy is not needed at runtime. Left unchanged.
- Constraint: the GIF goes stale when the Activity UI changes; refresh with the script.

**Still open:** the sidebar still image shows the old name "Saropa Chat Explorer" and the old layout. The bug stays Open until it is retaken from the renamed build.

**Verification:** the GIF's frames were inspected for content (Activity diagram, Web node lit, "Running: tests" caption). GitHub rendering of the embedded URL is unverified until the push is live on main.
