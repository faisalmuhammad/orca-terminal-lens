import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProcesses, terminalProcesses, buildSnapshot } from './processes.mjs';
import { filterGroups } from '../panel/view.mjs';
import { createScanner, cliExecutable } from './scanner.mjs';
const table = `
100 1 100 200 ttys001 Ss /usr/bin/login
101 100 101 200 ttys001 S -/bin/zsh
102 101 102 200 ttys001 S /tmp/gitstatusd-darwin-arm64
200 101 200 200 ttys001 S+ /opt/node
201 200 200 200 ttys001 S+ /opt/esbuild
210 101 210 200 ttys001 S /opt/python3
211 101 211 200 ttys001 Z /opt/node
300 1 300 301 ttys002 Ss /usr/bin/login
301 300 301 301 ttys002 S+ -/bin/zsh
302 301 302 301 ttys002 S /tmp/gitstatusd-darwin-arm64
400 1 400 401 ttys003 Ss /usr/bin/login
401 400 401 401 ttys003 S+ -/bin/zsh
402 401 402 401 ttys003 T /opt/node
`;
const terminals = { terminals: [
  { handle: 'term-a', worktreeId: 'w', ptyId: 'w@@a', tabId: 'tab', leafId: 'a', title: 'Server', worktreePath: '/w', connected: true, executionHostId: 'local' },
  { handle: 'term-b', worktreeId: 'w', ptyId: 'w@@b', tabId: 'tab', leafId: 'b', title: 'Shell', worktreePath: '/w', connected: true, executionHostId: 'local' }
] };
const resources = { collectedAt: 1000, worktrees: [{ worktreeId: 'w', worktreeName: 'Feature', repoName: 'App', sessions: [
  { sessionId: 'w@@a', paneKey: 'tab:a', pid: 100, cpu: 1, memory: 1024 },
  { sessionId: 'w@@b', paneKey: 'tab:b', pid: 300, cpu: 0, memory: 1024 }
] }] };
test('separates foreground/background jobs, ignores zombies, idle shells and prompt helpers', () => {
  const processes = parseProcesses(table);
  assert.deepEqual(terminalProcesses(100, processes).processes.map(p => [p.name, p.foreground]), [['node', true], ['esbuild', true], ['python3', false]]);
  assert.equal(terminalProcesses(100, processes).state, 'running');
  assert.equal(terminalProcesses(300, processes).state, 'idle');
  assert.equal(terminalProcesses(400, processes).state, 'stopped');
  assert.equal(terminalProcesses(999, processes).state, 'unknown');
});
test('counts direct commands and discards arguments in modified process titles', () => {
  const p = parseProcesses('500 1 500 500 pts/1 S+ node --token=secret');
  assert.deepEqual(terminalProcesses(500, p).processes, [{ pid: 500, name: 'node', foreground: true, stopped: false }]);
});
test('maps two panes in one worktree to their exact PTY sessions and filters correctly', () => {
  const snapshot = buildSnapshot(terminals, resources, parseProcesses(table), 1000);
  assert.deepEqual(snapshot.groups[0].terminals.map(t => t.state), ['running', 'idle']);
  assert.equal(filterGroups(snapshot)[0].terminals.length, 1);
  assert.equal(filterGroups(snapshot, { query: 'python' }).length, 1);
  assert.equal(filterGroups(snapshot, { query: 'unrelated' }).length, 0);
  assert.equal(filterGroups(snapshot, { scope: 'current', context: { terminals: [{ id: 'w@@a' }] } }).length, 1);
  assert.equal(filterGroups(snapshot, { scope: 'current', context: { workspaceId: 'other' } }).length, 0);
});
test('stale, mismatched, duplicate, orphaned and remote ownership remains unknown', () => {
  const make = (t = terminals, r = resources, now = 1000) => buildSnapshot(t, r, parseProcesses(table), now).groups[0].terminals[0];
  assert.equal(make(terminals, resources, 50000).state, 'unknown');
  const wrong = structuredClone(resources); wrong.worktrees[0].sessions[0].paneKey = 'wrong:a';
  assert.equal(make(terminals, wrong).state, 'unknown');
  const duplicate = structuredClone(resources); duplicate.worktrees[0].sessions.push(duplicate.worktrees[0].sessions[0]);
  assert.equal(make(terminals, duplicate).state, 'unknown');
  const remote = structuredClone(terminals); remote.terminals[0].executionHostId = 'ssh:remote';
  assert.equal(make(remote).state, 'unknown');
  const orphan = structuredClone(terminals); orphan.terminals[0].orphaned = true;
  assert.equal(make(orphan).state, 'unknown');
});
test('pins scans to the local host and preserves uncertainty when diagnostics fails', async () => {
  const calls = [];
  const scanner = createScanner({ executable: '/orca', platform: 'darwin', readRecency: async () => null, run: async (file, args) => {
    calls.push([file, args]);
    if (file === '/bin/ps') return { stdout: table };
    if (args[0] === 'diagnostics') throw new Error('unavailable');
    return { stdout: JSON.stringify({ ok: true, result: terminals }) };
  } });
  const result = await scanner.scan();
  assert.equal(result.groups[0].terminals[0].state, 'unknown');
  assert.ok(result.notes.length);
  assert.ok(calls.filter(([file]) => file === '/orca').every(([, args]) => args.includes('local') && args.includes('--environment')));
});
test('expired and malicious handles cannot trigger terminal focus', async () => {
  const calls = [];
  const scanner = createScanner({ executable: '/orca', run: async (file, args) => {
    calls.push(args); return { stdout: JSON.stringify({ ok: true, result: { terminals: [] } }) };
  } });
  await assert.rejects(scanner.focus('term_123;rm'), /Invalid/);
  await assert.rejects(scanner.focus('term_123'), /closed/);
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].includes('switch'));
  assert.equal(cliExecutable({ ORCA_CLI_COMMAND: '/custom/orca' }, 'darwin'), '/custom/orca');
});
