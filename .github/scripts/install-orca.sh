#!/usr/bin/env bash
set -euo pipefail

# Official Orca 1.4.266 archives and their GitHub SHA-256 digests.
# Keep the version, filenames and digests together when updating the CLI.
case "$(uname -m)" in
  arm64)
    orca_asset=Orca-1.4.266-arm64-mac.zip
    orca_sha=4c8604ef0967140de4dfcba34169dfe339c3fa59166f031a65aae6e3f70027d9
    ;;
  x86_64)
    orca_asset=Orca-1.4.266-mac.zip
    orca_sha=a1c593999b7977fea94db1055e6814d65f7ca5e215849fe1c9f181feb0344acd
    ;;
  *)
    echo 'The pinned Orca CLI installer requires a macOS arm64 or x86_64 runner.' >&2
    exit 1
    ;;
esac

orca_dir="${RUNNER_TEMP:?}/terminal-lens-orca-cli"
mkdir -p "$orca_dir"
orca_archive="$orca_dir/$orca_asset"
curl --fail --location --retry 3 \
  --output "$orca_archive" \
  "https://github.com/stablyai/orca/releases/download/v1.4.266/$orca_asset"
printf '%s  %s\n' "$orca_sha" "$orca_archive" | shasum -a 256 --check
ditto -x -k "$orca_archive" "$orca_dir"
orca_bin="$orca_dir/Orca.app/Contents/Resources/bin"
test -x "$orca_bin/orca"
printf '%s\n' "$orca_bin" >> "${GITHUB_PATH:?}"
