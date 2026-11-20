# Contributing

Use Node.js 22 or newer. The plugin has no runtime dependencies or build step; Sharp is development tooling for release images.

```sh
npm ci
npm run check
```

For live development, use Orca 1.4.260 or newer on macOS or Linux:

```sh
orca plugin dev load . --json
orca plugin validate . --json
```

Review the exact grants Orca returns before approving a new install. An already approved development folder reloads on file changes unless its access changes.

The existing Node tests use fixtures and mocked command runners; they do not inspect or focus your terminals. Add behavior tests when changing process ownership, recency, filtering, or grouping. Release tooling tests exercise version mismatches, missing assets, and archive contents in temporary directories.

The panel's `styles.css` contains the shared semantic palette and spacing. `theme.css` binds it to Orca's active theme. Keep the fixed toolbar/footer, exact pane navigation, recent-first sorting, keyboard support, and reduced-motion behavior intact. See [design review notes](docs/DESIGN.md).

Use [RELEASE.md](RELEASE.md) for manifest versions, preparation, validation, and automatic publication from main. [The GitHub upload guide](docs/github-upload.md) describes the clean source ZIP; [local artwork and packaging](docs/RELEASING.md) covers development-only assets. Report bugs through the repository's Issues page; include your Orca version, host OS, and whether the terminal is local or remote.
