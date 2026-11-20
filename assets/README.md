# Release artwork

Original terminal-and-lens artwork, licensed with Terminal Lens under MIT.

| File | Purpose | Size |
| --- | --- | --- |
| `icon.png` | Orca plugin icon | 512 × 512 |
| `cover.png` | Orca plugin page and README | 1600 × 1000 |
| `social.png` | GitHub repository social preview | 1280 × 640 |

Editable SVGs and the demo panel capture are in `assets/source/` in the source repository. The icon combines a terminal prompt and magnifying glass. The dark cover and social preview derive their background shades and violet/mint highlights from the panel's approved semantic fallback tokens. No generated bitmap illustration, external logo, or remote font is used.

The cover explains process discovery across projects and worktrees with process agnostic copy and a concise search feature label. Its supporting copy and feature treatment take inspiration from the Assets Library and Feeds covers. The embedded panel preview uses one uniform dark background derived from the approved foreground token, with a violet/mint glow; these are artwork treatments only.

The panel capture is created by `scripts/preview-release.mjs`, rendering the current panel with a mock bridge. It uses three terminal rows at 480 × 820, displayed larger in a shorter cover preview. Projects, worktrees, PIDs, and resource samples are fictional. That bridge is used only by the preview server and is excluded from the plugin archive. The cover provides the panel preview without a separate screenshot gallery.

See [the release guide](../docs/RELEASING.md) to regenerate screenshots and artwork. Upload `social.png` in the GitHub repository's Settings → General → Social preview; it is separate from Orca's cover field.
