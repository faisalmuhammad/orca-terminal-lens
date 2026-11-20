// Use native visible names; worktrees inherit their repository's project appearance.
// Match immutable IDs, never display names or paths shared by different hosts.
export function applyWorktreeAppearances(snapshot, inventory, projectList) {
  const repositories = new Map(), worktrees = new Map();
  for (const project of (Array.isArray(projectList?.projects) ? projectList.projects : []).slice(0, 1000)) {
    if (!project || typeof project !== 'object') continue;
    const appearance = {};
    if (typeof project.badgeColor === 'string' && /^#[a-f0-9]{6}$/i.test(project.badgeColor)) appearance.color = project.badgeColor;
    if (project.repoIcon?.type === 'lucide' && typeof project.repoIcon.name === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(project.repoIcon.name)) appearance.iconName = project.repoIcon.name;
    for (const id of new Set((Array.isArray(project.sourceRepoIds) ? project.sourceRepoIds : []).slice(0, 100))) {
      if (typeof id === 'string') repositories.set(id, repositories.has(id) ? null : { appearance, name: project.displayName, projectId: project.id });
    }
  }
  for (const worktree of (Array.isArray(inventory?.worktrees) ? inventory.worktrees : []).slice(0, 1000)) {
    if (!worktree || typeof worktree !== 'object') continue;
    if (worktree.hostId !== 'local' || typeof worktree.worktreeId !== 'string' || typeof worktree.repoId !== 'string') continue;
    worktrees.set(worktree.worktreeId, worktrees.has(worktree.worktreeId) ? null : { repoId: worktree.repoId, name: worktree.displayName });
  }
  for (const group of snapshot.groups) {
    delete group.appearance;
    delete group.projectId;
    delete group.repoId;
    if (group.host !== 'local') continue;
    const worktree = worktrees.get(group.id);
    if (worktree) group.repoId = worktree.repoId;
    if (typeof worktree?.name === 'string' && worktree.name.trim()) group.name = worktree.name.trim();
    const project = repositories.get(worktree?.repoId);
    if (typeof project?.projectId === 'string' && project.projectId.trim()) group.projectId = project.projectId;
    if (typeof project?.name === 'string' && project.name.trim()) group.project = project.name.trim();
    const appearance = project?.appearance;
    if (appearance && (appearance.color || appearance.iconName)) group.appearance = { ...appearance };
  }
  return snapshot;
}
