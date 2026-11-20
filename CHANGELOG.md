# Changelog

## 0.1.2

- Filter tab records to navigation fields inside SQLite in both supported profile formats.
- Preserve valid recency records when other saved navigation entries are malformed.
- Build the process parent/child index once per scan for faster discovery across many terminals.
- Add tests for shared scans, recovery, preview exclusion, and terminal navigation validation.

## 0.1.1

- Remove macOS Finder metadata from publication files.
- Reject executables, native modules, archives, bytecode, unsupported binary content, and symlinks in publishing checks.
- Audit all Git-tracked files before release, including files outside the export allowlist or matching ignore rules.

## 0.1.0

First public release of Terminal Lens: find processes running in Orca terminals and jump directly to their panes.

- Find foreground and background processes in local Orca terminals.
- Switch between collapsible project groups, worktree groups, and a flat list.
- Search processes, projects, worktrees, branches, and terminal titles.
- Show CPU, memory, and the recent CPU trend; inspect individual process PIDs.
- Recognize processes by their icons and colors, and inherit worktree appearance.
- Open the exact terminal pane from its row or Open button.
- Keep recently accessed terminals and groups at the top.
- Follow Orca's theme with a fixed toolbar and footer, a scrolling list, and entry animations.

Requires Orca 1.4.260 or newer on macOS or Linux. Remote process inspection and Windows hosts are not supported.
