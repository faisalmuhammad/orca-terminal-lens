# Access and data

Terminal Lens uses Orca's `trusted-worker` execution profile: its worker runs as a separate Node process with your user account's access on the Orca host. Install it only if you trust its code.

| Grant | Used for |
| --- | --- |
| `workspace:read` | Read workspace context and respond to workspace changes. |
| `workspace:write` | Focus an existing terminal pane when you press a row or Open. |
| `terminal:read` | Query terminal metadata through Orca's CLI. Its response may include an output preview; the plugin discards that preview. |

The worker executes fixed argument arrays for the local Orca CLI, `/bin/ps`, and optionally `/usr/bin/sqlite3`. The trusted-worker profile also permits machine access outside the listed host API grants.

The process query reads PID, parent PID, process groups, TTY, state, and executable name. It does not request command arguments or environment variables. The navigation adapter opens the active Orca profile database in read-only mode and selects only workspace visits, tab order, and selection metadata. Both supported database formats filter tab records inside SQLite, returning only tab IDs and creation times, plus group IDs, active tab IDs, and recent tab IDs. It never writes to that database or queries chat messages.

Displayed data stays on your machine. The plugin has no telemetry, analytics, or network requests. It does not start, stop, or send input to processes. Terminal output and previews are neither displayed nor retained in scan results.

Scan results and access observations live in worker memory. CPU history and expanded/collapsed groups live in the panel's memory and reset on reload. Only the selected view is saved in the panel's local storage, under the existing `running-terminals:view` key.

Only visible panels schedule scans. Hiding the panel pauses polling; scans are shared and cached briefly between panels.

Release images use fictional workspaces and sample resource data. They contain no terminal output or private project information.
