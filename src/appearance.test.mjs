import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorktreeAppearances } from './appearance.mjs';
import { worktreeAppearance } from '../panel/view.mjs';
import { createScanner } from './scanner.mjs';

const snapshot = () => ({ groups: ['one', 'two', 'child', 'remote'].map(id => ({ id, host: id === 'remote' ? 'ssh:server' : 'local', terminals: [] })) });
const inventory = { worktrees: [
  { worktreeId: 'one', repoId: 'repo-one', hostId: 'local' },
  { worktreeId: 'two', repoId: 'repo-two', hostId: 'local' },
  { worktreeId: 'child', repoId: 'repo-one', hostId: 'local' },
  { worktreeId: 'remote', repoId: 'repo-one', hostId: 'ssh:server' }
] };
const projects = { projects: [
  { id: 'project-one', displayName: 'Same name', sourceRepoIds: ['repo-one'], badgeColor: '#ec4899', repoIcon: { type: 'lucide', name: 'Code2' } },
  { id: 'project-two', displayName: 'Same name', sourceRepoIds: ['repo-two'], badgeColor: '#8b5cf6', repoIcon: { type: 'lucide', name: 'Sparkles' } }
] };

test('inherits appearance by native repository ID, including child worktrees with duplicate project names', () => {
  const current = applyWorktreeAppearances(snapshot(), inventory, projects);
  assert.deepEqual(current.groups[0].appearance, { iconName: 'Code2', color: '#ec4899' });
  assert.deepEqual(current.groups[1].appearance, { iconName: 'Sparkles', color: '#8b5cf6' });
  assert.deepEqual(current.groups[2].appearance, current.groups[0].appearance);
  assert.equal(current.groups[3].appearance, undefined);
  assert.deepEqual(current.groups.map(g => g.projectId), ['project-one', 'project-two', 'project-one', undefined]);
  assert.deepEqual(current.groups.map(g => g.repoId), ['repo-one', 'repo-two', 'repo-one', undefined]);
  applyWorktreeAppearances(current, inventory, null);
  assert.ok(current.groups.every(g => g.appearance === undefined), 'Missing metadata clears previous appearance');
  assert.ok(current.groups.every(g => g.projectId === undefined), 'Missing metadata clears project ownership');
});

test('rejects ambiguous ownership and invalid colors/icons; icon and color fall back independently', () => {
  const ambiguous = structuredClone(projects); ambiguous.projects.push(ambiguous.projects[0]);
  assert.equal(applyWorktreeAppearances(snapshot(), inventory, ambiguous).groups[0].appearance, undefined);
  const duplicateInventory = structuredClone(inventory); duplicateInventory.worktrees.push(duplicateInventory.worktrees[0]);
  assert.equal(applyWorktreeAppearances(snapshot(), duplicateInventory, projects).groups[0].appearance, undefined);
  const invalid = { projects: [{ sourceRepoIds: ['repo-one'], badgeColor: 'url(https://invalid)', repoIcon: { type: 'lucide', name: '<svg/>' } }] };
  assert.equal(applyWorktreeAppearances(snapshot(), inventory, invalid).groups[0].appearance, undefined);
  assert.deepEqual(worktreeAppearance({}), { icon: 'branch', color: null });
  assert.deepEqual(worktreeAppearance({ appearance: { iconName: 'Code-2', color: '#ec4899' } }), { icon: 'code2', color: '#ec4899' });
  assert.deepEqual(worktreeAppearance({ appearance: { iconName: 'UnavailableIcon', color: '#ec4899' } }), { icon: 'branch', color: '#ec4899' });
  assert.deepEqual(worktreeAppearance({ appearance: { iconName: 'Sparkles', color: 'invalid' } }), { icon: 'sparkles', color: null });
  assert.doesNotThrow(() => applyWorktreeAppearances(snapshot(), { worktrees: {} }, { projects: {} }));
});

test('shows native worktree display names and project labels, including branch names for root worktrees', () => {
  const namedInventory = structuredClone(inventory), namedProjects = structuredClone(projects);
  namedInventory.worktrees[0].displayName = 'feature/dashboard';
  namedInventory.worktrees[2].displayName = 'Search improvements';
  namedProjects.projects[0].displayName = 'Web App';
  const current = applyWorktreeAppearances(snapshot(), namedInventory, namedProjects);
  assert.equal(current.groups[0].name, 'feature/dashboard');
  assert.equal(current.groups[0].project, 'Web App');
  assert.equal(current.groups[2].name, 'Search improvements');
  assert.equal(current.groups[2].project, 'Web App');
  assert.equal(current.groups[3].name, undefined);
});

test('unavailable appearance commands never prevent a process scan', async () => {
  const calls = [];
  const scanner = createScanner({ executable: '/orca', platform: 'darwin', readRecency: async () => null, run: async (file, args) => {
    calls.push(args);
    if (file === '/bin/ps') return { stdout: '' };
    if (args[0] === 'project' || args[0] === 'worktree') throw new Error('Unavailable on this host');
    const result = args[0] === 'terminal' ? { terminals: [] } : { collectedAt: Date.now(), worktrees: [] };
    return { stdout: JSON.stringify({ ok: true, result }) };
  } });
  assert.deepEqual((await scanner.scan()).groups, []);
  for (const args of calls.filter(args => args[0] === 'project' || args[0] === 'worktree')) assert.ok(args.includes('--environment') && args.includes('local'));
});
