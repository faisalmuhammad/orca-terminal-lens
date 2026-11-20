# Local release preparation

The GitHub release workflow, version preparation, install references, and publishing rules are documented in [RELEASE.md](../RELEASE.md). Follow that process for public releases; a validated push to main automatically creates the manifest tag and changelog release without archive attachments.

## Clean GitHub export

Run **npm run release:export** after **npm run check**. The clean source snapshot is **.release/repository/**; **.release/github-upload-v<version>.zip** contains the same files, including .github/, with a SHA-256 checksum. The export audits the exact copied files and preserves existing Git checkouts. See [the upload guide](github-upload.md).

## Optional local package

**npm run pack:release** prepares a folder-install archive, checksum, notes, and file inventory in .release/. This archive is for local testing and manual folder installs; it is not attached by the GitHub release workflow. Tests, workflows, dependencies, local state, and design proposals are excluded. Validate **.release/staging/** with **orca plugin validate .release/staging --json** before installing it.

## Regenerate assets

Use **npm run assets:capture** with the Orca desktop app running. This starts a loopback-only fixture server, creates one browser tab, waits for sample charts, and captures the project panel for the cover. It changes the backdrop to one uniform dark shade only in that preview page. It generates the SVG/PNG artwork, then closes its tab and stops the server. It never requests real terminal data.

The script reuses **ORCA_CLI_COMMAND** when set, otherwise the standard Orca executable for the host. For manual preview, run **npm run preview:release** and open **http://127.0.0.1:43192/panel/index.html?theme=dark&view=project** in Orca. Capture at 480 × 820 after **window.__captureReady** resolves; the source capture is **assets/source/panel-demo-dark.png**. The sample uses three terminal rows so the shorter panel can appear larger on the cover.

Run **npm run assets:generate** after changing the panel capture or vector artwork. This produces the icon, cover, and social image. The cover brightens the sample panel and adds a violet/mint glow; the installed panel keeps Orca’s theme. Sharp is a pinned development dependency. Stop manual preview servers and close their tabs when done.
