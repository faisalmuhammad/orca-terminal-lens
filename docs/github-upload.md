# GitHub upload contents

Run **npm run check**, then **npm run release:export**. The export audits an explicit file list and copies it to **.release/repository/**. **.release/github-upload-v<version>.zip** contains those same files, including hidden GitHub configuration, and has a SHA-256 checksum alongside it.

Use the exported contents as the root of **faisalmuhammad/orca-terminal-lens**. Extract the ZIP before uploading or committing; the archive itself is not a release attachment. The manifest and .github/ must sit at the repository root. Keep the repository public for community discovery.

The export includes:

- The manifest, panel/, and src/ runtime files.
- Original icon, cover, social preview, and editable sample artwork.
- Package metadata, lockfile, documentation, MIT license, and third-party notices.
- Behavior tests, preparation/export tooling, and the GitHub release workflow.

It excludes local Orca state, SDK types, design proposals, environment files, dependencies, private paths, caches, logs, archives, and workspace instructions. The snapshot refuses to replace an existing Git checkout. Move the exported files into your repository before regenerating an export.

Remove any previously tracked **assets/.DS_Store** and other Finder metadata from your GitHub repository before committing the new release. Git ignores apply to local Git operations; GitHub's browser upload does not apply .gitignore. The release check now audits every tracked file and rejects metadata, native binaries, archives, bytecode, symlinks, and TTF/OTF fonts. Supported image files and WOFF/WOFF2 fonts are permitted.

## After upload

Enable Actions and allow the workflow to create version tags. A successful push to **main** automatically publishes the manifest version with changelog notes and no attached archives. Add the **orca-plugin** repository topic and choose **assets/social.png** for GitHub's Social preview setting.

See [RELEASE.md](../RELEASE.md) for subsequent versions, retry behavior, and catalog submission.
