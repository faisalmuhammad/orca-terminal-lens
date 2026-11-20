import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRecencyTracker, navigationFromParts, readNativeRecency } from './recency.mjs';
import { filterGroups, flatTerminals, processAppearance, terminalAppearance } from '../panel/view.mjs';

const terminal = (handle, tabId = handle) => ({ handle, tabId, terminalId: handle, title: handle, state: 'running', processes: [{ name: 'node' }] });
const group = (id, handles) => ({ id, name: id, project: '', path: '', branch: '', terminals: handles.map(h => terminal(h)) });
const navigation = () => ({ visits: { alpha: 100, beta: 200 }, tabs: { alpha: [{ id: 'a', createdAt: 10 }, { id: 'b', createdAt: 20 }] }, groups: { alpha: [{ recentTabIds: ['b', 'a'] }] }, activeGroups: {}, activeWorktreeId: 'alpha', activeTabId: 'a', activeHost: 'local' });
const layout = handle => [{ worktreeId: 'alpha', root: { type: 'group', tabs: [{ tabId: handle, activeLeafId: 'leaf', panes: { type: 'terminal', leafId: 'leaf', handle } }] } }];
const snapshot = () => ({ groups: [group('alpha', ['a', 'b']), group('beta', ['c'])] });
const handles = groups => flatTerminals(groups).map(t => t.handle);

test('seeds worktrees by saved visits and terminals by tab MRU, without output activity', () => {
  const tracker = createRecencyTracker(), current = snapshot();
  tracker.apply(current, { visualLayouts: layout('a') }, navigation(), 300);
  const groups = filterGroups(current);
  assert.deepEqual(groups.map(g => g.id), ['beta', 'alpha']);
  assert.deepEqual(groups[1].terminals.map(t => t.handle), ['a', 'b']);
  assert.deepEqual(handles(groups), ['c', 'a', 'b']);
  tracker.apply(current, { visualLayouts: layout('a'), terminals: [{ handle: 'b', lastOutputAt: 99999 }] }, navigation(), 350);
  assert.deepEqual(handles(filterGroups(current)), ['c', 'a', 'b']);
});

test('pane access, plugin Open, and new terminals reorder both views and retain timestamps across scans', () => {
  const tracker = createRecencyTracker(), current = snapshot(), nav = navigation();
  tracker.apply(current, { visualLayouts: layout('a') }, nav, 300);
  nav.activeTabId = 'b'; nav.visits.alpha = 400;
  tracker.apply(current, { visualLayouts: layout('b') }, nav, 400);
  assert.deepEqual(handles(filterGroups(current)), ['b', 'c', 'a']);
  assert.deepEqual(filterGroups(current).map(g => g.id), ['alpha', 'beta']);
  tracker.opened(current, 'a', 500);
  assert.deepEqual(handles(filterGroups(current)), ['a', 'b', 'c']);
  current.groups[1].terminals.push(terminal('d'));
  tracker.apply(current, { visualLayouts: layout('b') }, nav, 600);
  assert.deepEqual(handles(filterGroups(current)), ['d', 'a', 'b', 'c']);
  const next = snapshot(); next.groups[1].terminals.push(terminal('d'));
  tracker.apply(next, { visualLayouts: layout('b') }, nav, 700);
  assert.deepEqual(handles(filterGroups(next)), ['d', 'a', 'b', 'c']);
  assert.equal(next.groups[0].terminals[1].accessAt, 400);
});

test('a tab opened after the saved worktree visit takes precedence over old tab MRU', () => {
  const tracker = createRecencyTracker(), current = snapshot(), nav = navigation();
  nav.tabs.alpha[1].createdAt = 250;
  tracker.apply(current, {}, nav, 300);
  assert.deepEqual(handles(filterGroups(current)), ['b', 'c', 'a']);
  assert.equal(filterGroups(current)[0].id, 'alpha');
});

test('uses only the selected worktree and leaf; closed panes do not inherit access history', () => {
  const tracker = createRecencyTracker(), nav = navigation(), current = snapshot();
  tracker.apply(current, { visualLayouts: layout('a') }, nav, 300);
  const splitLayout = layout('b');
  splitLayout[0].root.tabs[0].panes = { type: 'split', first: { type: 'terminal', leafId: 'other', handle: 'a' }, second: { type: 'terminal', leafId: 'leaf', handle: 'b' } };
  nav.activeTabId = 'b';
  tracker.apply(current, { visualLayouts: splitLayout }, nav, 400);
  assert.equal(current.groups[0].terminals[1].accessAt, 400);
  nav.activeWorktreeId = 'beta';
  tracker.apply(current, { visualLayouts: splitLayout }, nav, 500);
  assert.equal(current.groups[0].terminals[1].accessAt, 400);
  current.groups[0].terminals.pop();
  tracker.apply(current, {}, null, 600);
  current.groups[0].terminals.push(terminal('b'));
  tracker.apply(current, {}, null, 700);
  assert.equal(current.groups[0].terminals[1].accessAt, 700);
});

test('reads bounded navigation fields through read-only SQLite argument arrays; authoritative parts win', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'running-terminals-recency-'));
  try {
    await mkdir(path.join(directory, 'profiles', 'local-default'), { recursive: true });
    await writeFile(path.join(directory, 'orca-profile-index.json'), JSON.stringify({ activeProfileId: 'local-default' }));
    const calls = [];
    const run = async (executable, args) => {
      calls.push(args); assert.equal(executable, '/usr/bin/sqlite3'); assert.equal(args[0], '-readonly');
      const sql = args.at(-1);
      const result = sql.includes('sqlite_master') ? [{ name: 'profile_state_document_parts_meta' }] : sql.includes('SELECT domain_version') ? [{ domain_version: 1 }] : [
        { part_key: '["lastVisitedAtByWorktreeId","local|alpha"]', payload: '100' },
        { part_key: '["lastVisitedAtByWorktreeId","remote|beta"]', payload: '999' },
        { part_key: '["tabsByWorktree","alpha"]', payload: '[{"id":"a","createdAt":20}]' }
      ];
      return { stdout: JSON.stringify(result) };
    };
    const result = await readNativeRecency({ run, directory });
    assert.deepEqual(result.visits, { alpha: 100 });
    assert.equal(result.tabs.alpha[0].createdAt, 20);
    assert.equal(calls.length, 3);
    assert.ok(calls[2].at(-1).includes('LIMIT 5000'));
    assert.ok(!calls[2].at(-1).includes('SELECT payload FROM'));
    assert.deepEqual(navigationFromParts([{ part_key: '["lastVisitedAtByWorktreeId","local|a"]', payload: '-1' }]).visits, { a: 0 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('icons distinguish actual executable types and agent identities, with neutral unknown fallbacks', () => {
  assert.deepEqual(processAppearance('node'), { icon: 'terminal', tone: 'node', label: 'JavaScript runtime' });
  assert.equal(processAppearance('python3.12').icon, 'python');
  assert.equal(processAppearance('docker').icon, 'container');
  assert.equal(processAppearance('ruby').icon, 'gem');
  assert.equal(processAppearance('claude').icon, 'agent');
  assert.equal(processAppearance('unrecognized').tone, 'neutral');
  assert.equal(terminalAppearance({ agentIdentity: 'codex', processes: [{ name: 'node' }] }).icon, 'agent');
  assert.equal(terminalAppearance({ title: 'Claude running', processes: [] }).tone, 'neutral');
  assert.equal(terminalAppearance({ processes: [{ name: 'npm' }, { name: 'codex' }] }).icon, 'agent');
});
