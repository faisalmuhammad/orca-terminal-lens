import { createScanner } from './scanner.mjs';

// No timers in the worker: an open, visible panel drives scans. All panels share one scan.
export default function activate(orca) {
  const scanner = createScanner();
  let pending = null, cached = null, cachedAt = 0;
  orca.panels.handle('terminals.scan', async () => {
    if (pending) return pending;
    if (cached && Date.now() - cachedAt < 2000) return cached;
    pending = scanner.scan().then(result => { cached = result; cachedAt = Date.now(); return result; });
    try { return await pending; } finally { pending = null; }
  });
  orca.panels.handle('terminals.focus', async (input) => {
    if (!cached?.groups.some(g => g.terminals.some(t => t.handle === input?.handle))) {
      throw new Error('Refresh the list before focusing this terminal.');
    }
    const result = await scanner.focus(input.handle);
    // Do not serve an old order after a successful navigation.
    cachedAt = 0;
    return result;
  });
}
