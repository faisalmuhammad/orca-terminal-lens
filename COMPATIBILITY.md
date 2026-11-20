# Compatibility

Terminal Lens 0.1.0 requires Orca desktop 1.4.260 or newer and its compatible CLI on a macOS or Linux host. The runtime ships as JavaScript and requires no separate dependency installation or build step. Windows process inspection is outside this release.

## Terminal ownership

Processes are discovered from the host's process table and matched to their owning terminal sessions. Foreground and background descendants are supported without a runtime allowlist. Remote/SSH terminals can appear as Unknown with Show all enabled; their PIDs are never matched to the local process table.

Detached processes that leave a terminal's descendant tree cannot be reliably attributed. Missing, conflicting, stale, or ambiguous ownership remains Unknown. Terminal titles and output activity do not prove that a process is running. A shell-only script without non-shell descendants is treated as an idle shell.

## Navigation and recency

The plugin opens an exact Orca terminal pane. Closed or stale handles require another scan. Initial ordering uses saved worktree visits and tab order because Orca does not expose historical access times for every split pane. Observed pane selection and Open actions refine ordering during the session.

On Linux, /usr/bin/sqlite3 is optional for reading saved navigation metadata. Without it, the plugin uses access observed during the current session. Native navigation metadata and resource ownership may change between Orca releases.

## Validation

Behavior tests use controlled process, workspace, and navigation fixtures. The GitHub workflow runs checks on macOS and Linux and validates the manifest with the pinned official Orca 1.4.266 CLI on macOS. A scan is a point-in-time snapshot; process state can change before navigation.

See [usage](docs/usage.md) for search, refresh, resources, and troubleshooting, and [privacy](docs/PRIVACY.md) for machine access.
