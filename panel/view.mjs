export function filterGroups(snapshot, { query = '', scope = 'all', context = null, includeIdle = false } = {}) {
  const needle = query.trim().toLowerCase();
  return snapshot.groups.flatMap(group => {
    const inCurrent = group.id === context?.workspaceId || group.terminals.some(t => context?.terminals?.some(c => c.id === t.terminalId));
    if (scope === 'current' && !inCurrent) return [];
    const terminals = group.terminals.filter(terminal => {
      if (!includeIdle && terminal.state !== 'running') return false;
      return !needle || [group.name, group.project, group.branch, group.path, terminal.title, terminal.agentIdentity, ...terminal.processes.map(p => p.name)]
        .some(value => String(value || '').toLowerCase().includes(needle));
    });
    return terminals.length ? [{ ...group, terminals: terminals.sort(compareTerminals) }] : [];
  }).sort((a, b) => (b.lastAccessAt || 0) - (a.lastAccessAt || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

// Within a worktree, saved tab MRU precedes creation time; observed pane access is exact.
// Across worktrees the saved visit time supplies the initial global order.
export function compareTerminals(a, b) {
  return Math.max(b.accessAt || 0, b.worktreeVisitedAt || 0, b.createdAt || 0) - Math.max(a.accessAt || 0, a.worktreeVisitedAt || 0, a.createdAt || 0)
    || (b.tabRank || 0) - (a.tabRank || 0) || (b.createdAt || 0) - (a.createdAt || 0) || a.handle.localeCompare(b.handle);
}

export function flatTerminals(groups) {
  return groups.flatMap(group => group.terminals.map(terminal => ({ ...terminal, worktreeId: group.id, group }))).sort(compareTerminals);
}

export function groupByProject(groups) {
  const projects = new Map();
  for (const group of groups) {
    // Names can collide. Without native project metadata, use the known repository
    // or keep an unverified workspace separate rather than merging by its label.
    const identity = group.projectId ? ['project', group.projectId] : group.repoId ? ['repo', group.repoId] : ['workspace', group.id];
    const id = 'project:' + JSON.stringify([group.host || 'unknown', ...identity]);
    if (!projects.has(id)) projects.set(id, { id, name: group.project || 'Workspace', appearance: group.appearance, worktrees: [], lastAccessAt: 0 });
    const project = projects.get(id);
    project.worktrees.push(group);
    project.appearance ||= group.appearance;
    project.lastAccessAt = Math.max(project.lastAccessAt, group.lastAccessAt || 0,
      ...group.terminals.map(t => Math.max(t.accessAt || 0, t.worktreeVisitedAt || 0, t.createdAt || 0)));
  }
  return [...projects.values()].map(project => ({ ...project, terminals: flatTerminals(project.worktrees) }))
    .sort((a, b) => b.lastAccessAt - a.lastAccessAt || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

const agents = new Set(['codex', 'claude', 'gemini', 'copilot', 'aider', 'opencode', 'goose', 'amp', 'pi', 'omp', 'grok']);
export function processAppearance(name = '', agentIdentity = null) {
  const normalized = name.toLowerCase().replace(/\.exe$/, '');
  const agent = agentIdentity?.toLowerCase();
  if (agents.has(normalized) || agents.has(agent)) return { icon: 'agent', tone: 'agent', label: agent || normalized };
  if (/^(node(?:js)?|npm|npx|pnpm|yarn|bun)(?:$|[ -])/.test(normalized)) return { icon: 'terminal', tone: 'node', label: 'JavaScript runtime' };
  if (/^(python(?:\d+(?:\.\d+)*)?|uv|pip(?:\d+)?)$/.test(normalized)) return { icon: 'python', tone: 'runtime', label: 'Python' };
  if (/^(ruby|irb|bundle|rails)$/.test(normalized)) return { icon: 'gem', tone: 'runtime', label: 'Ruby' };
  if (/^(docker|podman|containerd)$/.test(normalized)) return { icon: 'container', tone: 'node', label: 'Container' };
  if (/^(go|java|deno|rustc|cargo|dotnet|php)$/.test(normalized)) return { icon: 'code', tone: 'runtime', label: normalized };
  return { icon: 'terminal', tone: 'neutral', label: agentIdentity || name || 'Shell' };
}

export function terminalAppearance(terminal) {
  if (terminal.agentIdentity) return processAppearance('', terminal.agentIdentity);
  const active = terminal.processes.filter(p => !p.stopped);
  const agent = active.find(p => agents.has(p.name.toLowerCase()));
  if (agent) return processAppearance(agent.name);
  return processAppearance((active.find(p => processAppearance(p.name).tone !== 'neutral') || active[0])?.name);
}

const worktreeIcons = {
  box: 'box', package: 'box', sparkles: 'sparkles', code: 'code', code2: 'code2', codexml: 'code2',
  folder: 'folder', folderopen: 'folder', gitbranch: 'branch', branch: 'branch',
  layers: 'layers', terminal: 'terminal', terminalsquare: 'terminal', squareterminal: 'terminal',
  blocks: 'blocks', book: 'book', bookopen: 'book', globe: 'globe', server: 'server',
  database: 'database', rocket: 'rocket', workflow: 'workflow', bot: 'agent', robot: 'agent'
};
export function worktreeAppearance(group) {
  const appearance = group?.appearance;
  const name = typeof appearance?.iconName === 'string' ? appearance.iconName.replace(/[-_]/g, '').toLowerCase() : '';
  return {
    icon: Object.hasOwn(worktreeIcons, name) ? worktreeIcons[name] : 'branch',
    color: typeof appearance?.color === 'string' && /^#[a-f0-9]{6}$/i.test(appearance.color) ? appearance.color : null
  };
}
export function memoryLabel(bytes) {
  return bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(1) + ' GB' : Math.round(bytes / 1024 ** 2) + ' MB';
}
