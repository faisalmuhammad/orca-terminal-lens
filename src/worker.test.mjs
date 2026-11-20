import test from 'node:test';
import assert from 'node:assert/strict';
import { registerTerminalHandlers } from './worker.mjs';

const snapshot = () => ({ groups: [{ terminals: [{ handle: 'term_valid' }] }] });
function setup(scanner, now = Date.now) {
  const handlers = new Map();
  registerTerminalHandlers({ panels: { handle: (name, handler) => handlers.set(name, handler) } }, scanner, now);
  return { scan: handlers.get('terminals.scan'), focus: handlers.get('terminals.focus') };
}

test('panels share an in-flight scan and its cache expires after two seconds', async () => {
  let resolve, calls = 0, time = 1000;
  const service = setup({ scan: () => { calls++; return new Promise(done => { resolve = done; }); } }, () => time);
  assert.equal(calls, 0);
  const first = service.scan(), second = service.scan();
  assert.equal(calls, 1);
  const result = snapshot(); resolve(result);
  assert.strictEqual(await first, result);
  assert.strictEqual(await second, result);
  time = 2999;
  assert.strictEqual(await service.scan(), result);
  assert.equal(calls, 1);
  time = 3000;
  const expired = service.scan();
  assert.equal(calls, 2);
  resolve(snapshot()); await expired;
});

test('a failed shared scan releases the pending request and can be retried', async () => {
  let calls = 0;
  const service = setup({ scan: async () => { if (++calls === 1) throw new Error('unavailable'); return snapshot(); } });
  const results = await Promise.allSettled([service.scan(), service.scan()]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(calls, 1);
  await service.scan();
  assert.equal(calls, 2);
});

test('navigation only accepts handles actually returned by a successful scan', async () => {
  const focused = [];
  const service = setup({ scan: async () => snapshot(), focus: async handle => { focused.push(handle); return { focused: true }; } });
  await assert.rejects(service.focus({ handle: 'term_valid' }), /Refresh/);
  await service.scan();
  for (const input of [undefined, {}, { handle: 'term_other' }, { handle: [] }]) await assert.rejects(service.focus(input), /Refresh/);
  assert.deepEqual(focused, []);
  assert.deepEqual(await service.focus({ handle: 'term_valid' }), { focused: true });
  assert.deepEqual(focused, ['term_valid']);
});

test('successful navigation forces a new scan while failed navigation preserves the cache', async () => {
  let scans = 0, fail = true;
  const service = setup({
    scan: async () => { scans++; return snapshot(); },
    focus: async () => { if (fail) throw new Error('closed'); return { focused: true }; }
  }, () => 0);
  await service.scan();
  await assert.rejects(service.focus({ handle: 'term_valid' }), /closed/);
  await service.scan(); assert.equal(scans, 1);
  fail = false; await service.focus({ handle: 'term_valid' });
  await service.scan(); assert.equal(scans, 2);
});
