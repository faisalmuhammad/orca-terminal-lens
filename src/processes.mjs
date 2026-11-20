// Only executable names and process topology are read, never argv or environment variables.
const shells = new Set(['sh', 'zsh', 'bash', 'fish', 'dash', 'ksh', 'tcsh', 'csh', 'nu', 'login']);
const helpers = /^(?:gitstatusd(?:-|$)|starship$|powerline(?:-|$)|p10k$)/;

export function parseProcesses(text) {
  const processes = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (!match) continue;
    const [, pid, ppid, pgid, tpgid, tty, stat, executable] = match;
    // A program can change its own comm; keep the first name, never its argument string.
    const name = executable.trim().replace(/^-/, '').split(/\s/)[0].split(/[\/\\]/).pop();
    processes.set(Number(pid), { pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid),
      tpgid: Number(tpgid), tty, stat, name });
  }
  return processes;
}

export function terminalProcesses(rootPid, processes) {
  const root = processes.get(rootPid);
  if (!root) return { state: 'unknown', processes: [], reason: 'Terminal process is no longer in the process snapshot.' };
  const children = new Map();
  for (const process of processes.values()) {
    if (!children.has(process.ppid)) children.set(process.ppid, []);
    children.get(process.ppid).push(process);
  }
  const pending = [root], seen = new Set(), jobs = [];
  while (pending.length) {
    const process = pending.pop();
    if (seen.has(process.pid)) continue;
    seen.add(process.pid);
    if (/^[ZX]/.test(process.stat) || helpers.test(process.name)) continue;
    pending.push(...(children.get(process.pid) ?? []));
    if (shells.has(process.name)) continue;
    const foreground = root.tpgid > 0 && process.pgid === root.tpgid;
    jobs.push({ pid: process.pid, name: process.name, foreground, stopped: /^T/.test(process.stat) });
  }
  jobs.sort((a, b) => Number(b.foreground) - Number(a.foreground) || a.pid - b.pid);
  return { state: jobs.some(p => !p.stopped) ? 'running' : jobs.length ? 'stopped' : 'idle', processes: jobs };
}

export function buildSnapshot(terminalList, resources, processes, now = Date.now()) {
  const groups = new Map(), notes = [];
  const fresh = Number.isFinite(resources?.collectedAt) && Math.abs(now - resources.collectedAt) < 30000;
  if (!fresh) notes.push('Process ownership snapshot is unavailable or stale. Refresh to try again.');
  if (terminalList.truncated) notes.push('Orca returned a partial terminal list.');
  if (terminalList.hostScope?.omittedHostIds?.length) notes.push('Some hosts were omitted from the terminal list.');
  const owners = new Map();
  for (const workspace of resources?.worktrees ?? []) {
    for (const session of workspace.sessions ?? []) {
      if (!Number.isInteger(session.pid) || session.pid <= 0 || typeof session.sessionId !== 'string') continue;
      const key = workspace.worktreeId + '\0' + session.sessionId;
      // Reject duplicate ownership instead of assigning the wrong process.
      owners.set(key, owners.has(key) ? null : { ...session, workspace });
    }
  }
  for (const terminal of terminalList.terminals ?? []) {
    if (typeof terminal.handle !== 'string' || typeof terminal.worktreeId !== 'string') continue;
    const owner = owners.get(terminal.worktreeId + '\0' + terminal.ptyId);
    const local = terminal.executionHostId === 'local';
    const paneMatches = owner?.paneKey === terminal.tabId + ':' + terminal.leafId;
    const verified = local && fresh && paneMatches && !terminal.orphaned && terminal.connected === true;
    const result = verified ? terminalProcesses(owner.pid, processes) : { state: 'unknown', processes: [],
      reason: !local ? 'Process inspection is available for local terminals only.' : 'Terminal process ownership could not be verified.' };
    if (!groups.has(terminal.worktreeId)) {
      groups.set(terminal.worktreeId, { id: terminal.worktreeId, name: owner?.workspace.worktreeName || terminal.worktreePath?.split(/[\/\\]/).pop() || 'Workspace',
        project: owner?.workspace.repoName || '', path: terminal.worktreePath || '',
        branch: (terminal.branch || '').replace(/^refs\/heads\//, ''), host: terminal.executionHostId || 'unknown', terminals: [] });
    }
    groups.get(terminal.worktreeId).terminals.push({ handle: terminal.handle, terminalId: terminal.ptyId, title: terminal.paneTitle || terminal.title || 'Terminal',
      tabId: terminal.tabId, leafId: terminal.leafId, agentIdentity: typeof terminal.agentIdentity === 'string' ? terminal.agentIdentity : null,
      ...result, cpu: verified && Number.isFinite(owner.cpu) ? owner.cpu : null,
      memory: verified && Number.isFinite(owner.memory) ? owner.memory : null });
  }
  return { scannedAt: now, groups: [...groups.values()].sort((a, b) => a.project.localeCompare(b.project) || a.name.localeCompare(b.name)), notes };
}
