import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanner } from './scanner.mjs';

const terminal = { handle: 'term_valid', worktreeId: 'workspace', ptyId: 'session', tabId: 'tab', leafId: 'leaf', connected: true, executionHostId: 'local', title: 'Terminal', preview: 'PRIVATE_OUTPUT_CONTENT' };
const resources = () => ({ collectedAt: Date.now(), worktrees: [{ worktreeId: 'workspace', sessions: [{ sessionId: 'session', paneKey: 'tab:leaf', pid: 100 }] }] });
const reply = result => ({ stdout: JSON.stringify({ ok: true, result }) });

function setup({ failed, navigationFails = false, current = [terminal], switchResult = { focused: true, navigated: true } } = {}) {
  const calls = [];
  const scanner = createScanner({ executable: '/fixture-orca', platform: 'linux',
    readRecency: async () => { if (navigationFails) throw new Error('unavailable'); return null; },
    run: async (file, args) => {
      calls.push({ file, args });
      if (file === '/bin/ps') {
        if (failed === 'processes') throw new Error('process table unavailable');
        return { stdout: '100 1 100 200 pts/1 S sh\n200 100 200 200 pts/1 S+ sample-process' };
      }
      if (args[0] === 'diagnostics') return reply(resources());
      if (args[0] === 'terminal' && args[1] === 'list') return reply({ terminals: current });
      if (args[0] === 'terminal' && args[1] === 'switch') return reply(switchResult);
      if (failed === 'appearance') throw new Error('appearance unavailable');
      return reply({});
    }
  });
  return { scanner, calls };
}

test('scan results exclude terminal previews and discover arbitrary executable names', async () => {
  const { scanner, calls } = setup();
  const result = await scanner.scan();
  assert.equal(result.groups[0].terminals[0].state, 'running');
  assert.ok(result.groups[0].terminals[0].processes.some(process => process.name === 'sample-process'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_OUTPUT_CONTENT'));
  const processQuery = calls.find(call => call.file === '/bin/ps');
  assert.deepEqual(processQuery.args, ['-axo', 'pid=,ppid=,pgid=,tpgid=,tty=,stat=,comm=']);
});

test('a failed process query reports Unknown rather than presenting a terminal as idle', async () => {
  const { scanner } = setup({ failed: 'processes' });
  const result = await scanner.scan();
  assert.equal(result.groups[0].terminals[0].state, 'unknown');
  assert.ok(result.notes.includes('The local process table could not be read.'));
});

test('missing appearance and saved recency do not prevent process discovery', async () => {
  const { scanner } = setup({ failed: 'appearance', navigationFails: true });
  const result = await scanner.scan();
  assert.equal(result.groups[0].terminals[0].state, 'running');
  assert.ok(result.notes.some(note => note.includes('Saved access order')));
});

test('focus revalidates an exact handle and refuses orphaned or unsuccessful navigation', async () => {
  const orphan = setup({ current: [{ ...terminal, orphaned: true }] });
  await assert.rejects(orphan.scanner.focus('term_valid'), /closed/);
  assert.ok(!orphan.calls.some(call => call.args[1] === 'switch'));
  for (const switchResult of [{ focused: false }, { navigated: false }]) {
    const { scanner } = setup({ switchResult });
    await assert.rejects(scanner.focus('term_valid'), /could not focus/);
  }
  const { scanner, calls } = setup();
  assert.equal((await scanner.focus('term_valid')).focused, true);
  assert.deepEqual(calls.map(call => call.args.slice(0, 2)), [['terminal', 'list'], ['terminal', 'switch']]);
  assert.ok(calls.every(call => call.args.includes('--environment') && call.args.includes('local')));
});

test('unsupported platforms do not launch host commands', async () => {
  const scanner = createScanner({ platform: 'win32', run: async () => assert.fail('unexpected command'), readRecency: async () => assert.fail('unexpected navigation read') });
  await assert.rejects(scanner.scan(), /macOS and Linux/);
});
