import test from 'node:test';
import assert from 'node:assert/strict';
import { recordSample, cpuSeries, chartGeometry } from '../panel/history.mjs';

test('history contains actual successful scans, deduplicates cached results and stays bounded', () => {
  const snapshot = n => ({ scannedAt: n * 10000, groups: [{ terminals: [{ handle: 'a', cpu: n }] }] });
  let history = [];
  for (let n = 0; n < 40; n++) history = recordSample(history, snapshot(n));
  assert.equal(history.length, 30);
  assert.equal(history[0].at, 100000);
  assert.strictEqual(recordSample(history, snapshot(39)), history);
  assert.equal(cpuSeries(history, ['a']).at(-1).value, 39);
});
test('CPU charts have gaps for missing ownership and do not invent empty-terminal samples', () => {
  const history = [{ at: 1, cpu: { a: 2 } }, { at: 10001, cpu: { a: null } }, { at: 20001, cpu: { a: 3 } }];
  assert.deepEqual(cpuSeries(history, ['a']).map(s => s.value), [2, null, 3]);
  assert.deepEqual(cpuSeries(history, []), []);
  assert.equal(chartGeometry(cpuSeries(history, ['a'])).segments.length, 2);
  assert.equal(chartGeometry([{ at: 1, value: 4 }, { at: 40001, value: 6 }]).segments.length, 2);
});
test('chart uses actual elapsed time and supports more than one CPU core', () => {
  const graph = chartGeometry([{ at: 0, value: 100 }, { at: 10000, value: 200 }, { at: 30000, value: 150 }]);
  assert.equal(graph.ceiling, 200);
  assert.deepEqual(graph.segments[0].map(p => p.x), [0, 100, 300]);
  assert.equal(graph.segments[0][1].y, 0);
});
