# Releasing Terminal Lens

Release version: **0.1.1**, tag **v0.1.1**.

## Repository content

Commit the manifest, panel/, src/, assets/, tests, release tooling, package files, documentation, licenses, and .github/ workflow. Orca installs the runtime files from the Git tag; users need no npm install or build step. Publisher is derived from the repository owner.

Dependencies, runtime state, caches, environment files, logs, and .release/ are excluded from the clean export. GitHub releases use tagged repository content without attached archives. The cover is the listing preview; there is no separate screenshot gallery.

## Verify

Use Node.js 22+ and Orca 1.4.260+ on macOS or Linux:

```sh
npm ci
npm run check
orca plugin validate . --json
```

Checks validate package, lockfile, manifest and footer versions; changelog notes; file and image budgets; entry points; runtime imports; and the exact publishing file allowlist. The audit rejects machine-specific paths, image text metadata, private dependency sources, symlinks, Finder metadata, executables, native modules, archives, bytecode, and unsupported binaries. In Git repositories it inspects every tracked file, including ignored files already in the index. Process behavior and release automation use controlled fixtures.

## GitHub setup

Create the public **faisalmuhammad/orca-terminal-lens** repository with its default branch named **main**. Enable Actions, add the **orca-plugin** topic, and select **assets/social.png** in Settings → General → Social preview. For the first upload, use [the clean repository export](docs/github-upload.md).

The workflow validates main, pull requests, and tags on macOS and Linux. The macOS job additionally validates the manifest using the official Orca 1.4.266 CLI, downloaded with pinned SHA-256 checksums.

After a successful push to main, GitHub Actions reads the manifest version, creates **v<version>** on the exact checked commit, and publishes that version's changelog notes. No archives are attached. Only the release job has **contents: write**, using GitHub's built-in token; a personal access token is unnecessary.

Pull requests and manual workflow runs only validate. Main pushes with an existing release leave it unchanged. Manual tag pushes can finish a release when the tag matches the manifest and its commit is in main. Publishing jobs are serialized, existing tags are never moved, and retries reuse matching tags. Authentication and network errors stop publication.

For each release:

1. Set the new stable major.minor.patch version in **orca-plugin.json**.
2. Add a matching **## <version>** entry to **CHANGELOG.md**.
3. Prepare and validate, then commit the resulting files and push or merge to main:

```sh
npm run release:prepare
npm run check
orca plugin validate . --json
# Commit the prepared files.
git push origin main
```

**release:prepare** synchronizes package.json, both lockfile version fields, the panel footer, and README/release installation references from the manifest. It does not increment versions, invent notes, create commits, or publish. Protected tag rules must allow the release token to create version tags.

The versioned install reference is:

```text
https://github.com/faisalmuhammad/orca-terminal-lens#v0.1.1
```

After publication, generate the Orca catalog entry from the published commit with **orca plugin release-entry . --json**. Catalog submission is separate from GitHub release automation. Published tags must remain unchanged. Check the listing at https://www.onorca.dev/plugins/faisalmuhammad/orca-terminal-lens.

See [local artwork and packaging](docs/RELEASING.md) for development-only preparation.
