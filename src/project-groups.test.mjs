import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGroups, groupByProject } from '../panel/view.mjs';

const terminal = (handle, accessAt, state = 'running') => ({ handle, title: handle, accessAt, state, processes: [{ name: 'node' }] });
const tree = (id, projectId, terminals, extra = {}) => ({ id, name: id, project: 'App', projectId, host: 'local', terminals, ...extra });

test('combines repositories of one native project and orders projects and terminals by recent access', () => {
  const groups = [
    tree('main', 'app', [terminal('old', 100)], { repoId: 'repo-one', lastAccessAt: 100, appearance: { iconName: 'Code2', color: '#ec4899' } }),
    tree('feature', 'app', [terminal('new', 250), terminal('older', 90)], { repoId: 'repo-two', lastAccessAt: 200 }),
    tree('other', 'other', [terminal('other-terminal', 225)], { project: 'Other', lastAccessAt: 225 })
  ];
  const original = structuredClone(groups);
  const projects = groupByProject(filterGroups({ groups }));
  assert.deepEqual(projects.map(p => p.name), ['App', 'Other']);
  assert.equal(projects[0].worktrees.length, 2);
  assert.deepEqual(projects[0].terminals.map(t => t.handle), ['new', 'old', 'older']);
  assert.deepEqual(projects[0].terminals.map(t => t.group.name), ['feature', 'main', 'feature']);
  assert.deepEqual(projects[0].appearance, { iconName: 'Code2', color: '#ec4899' });
  assert.deepEqual(groups, original, 'Grouping preserves source worktrees and terminal arrays');
});

test('keeps duplicate project labels, execution hosts, and unknown workspace identities separate', () => {
  const projects = groupByProject([
    tree('one', 'one', [terminal('a', 1)]),
    tree('two', 'two', [terminal('b', 2)]),
    tree('remote', 'one', [terminal('c', 3)], { host: 'ssh:server' }),
    tree('fallback-one', undefined, [terminal('d', 4)], { repoId: 'known-repo' }),
    tree('fallback-two', undefined, [terminal('e', 5)], { repoId: 'known-repo' }),
    tree('unknown-one', undefined, [terminal('f', 6)]),
    tree('unknown-two', undefined, [terminal('g', 7)])
  ]);
  assert.equal(projects.length, 6);
  assert.equal(new Set(projects.map(p => p.id)).size, 6);
  assert.equal(projects.find(p => p.terminals.some(t => t.handle === 'd')).worktrees.length, 2);
});

test('project counts and rows reflect search, current-worktree scope, and idle filters', () => {
  const groups = [
    tree('main', 'app', [terminal('old', 100), terminal('shell', 300, 'idle')]),
    tree('feature', 'app', [terminal('new', 250)]),
    tree('other', 'other', [terminal('other-terminal', 225)], { project: 'Other' })
  ];
  const search = groupByProject(filterGroups({ groups }, { query: 'new' }));
  assert.equal(search.length, 1);
  assert.equal(search[0].worktrees.length, 1);
  assert.deepEqual(search[0].terminals.map(t => t.handle), ['new']);
  const current = groupByProject(filterGroups({ groups }, { scope: 'current', context: { workspaceId: 'main' }, includeIdle: true }));
  assert.equal(current.length, 1);
  assert.equal(current[0].worktrees.length, 1);
  assert.deepEqual(current[0].terminals.map(t => t.handle), ['shell', 'old']);
  assert.deepEqual(groupByProject(filterGroups({ groups }, { query: 'missing' })), []);
});
