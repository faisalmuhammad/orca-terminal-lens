# Using Terminal Lens

Start a command in a local Orca terminal. Terminal Lens finds processes attached to its shell, including foreground and background children. Click a result or its bordered Open button to focus the exact terminal pane.

## Find and organize

Search by process name, terminal title, project, worktree, or branch. The scope menu limits results to the current worktree. Show all includes idle shells and terminals whose running state is unknown.

The view buttons beside search are ordered Project → Worktree → Flat List. Project groups combine a project's worktrees, worktree groups show their terminals, and flat rows include project/worktree labels. Group headers collapse independently. The selected view survives reloads. Recent terminal access moves rows and groups toward the top.

Orca's worktree icon and color are inherited when available. Process icons help distinguish rows, with a neutral fallback for unknown executables. Expand process details independently of opening the terminal.

## Refresh and resource context

Live scans run every 10 seconds while the panel is visible. Manual refresh requests a scan immediately. The footer shows the latest successful scan and plugin version. A failed scan preserves previous results with an error message.

CPU at 100% represents one core. Memory meters compare with the largest visible terminal. The CPU chart contains measured samples from the latest 30 successful scans and resets on reload. Missing measurements appear as gaps. Resource context helps identify a terminal; unavailable ownership or statistics remain unknown.

## Keyboard and layout

Press / to search, Escape to clear search, and Enter or Space to open a focused row. Headers, chart, filters, and footer stay fixed while only the list scrolls. Entry animations respect reduced-motion settings.

## Troubleshooting

If a terminal is missing, enable Show all, check that it is local, then refresh. A stale terminal handle requires another refresh. If scans fail, confirm the minimum Orca version, then inspect logs with **orca plugin logs** using the installed key from **orca plugin list --json**.

See [compatibility](../COMPATIBILITY.md) for remote terminals, detached processes, recency limits, and Linux navigation metadata. See [privacy](PRIVACY.md) for the worker's access and data handling.
