import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildSnapshot, parseProcesses } from './processes.mjs';
import { createRecencyTracker, readNativeRecency } from './recency.mjs';
import { applyWorktreeAppearances } from './appearance.mjs';

const execute = promisify(execFile);
export function cliExecutable(env = process.env, platform = process.platform) {
  if (env.ORCA_CLI_COMMAND) return env.ORCA_CLI_COMMAND;
  if (env.ORCA_DEV_REPO_ROOT) return 'orca-dev';
  return platform === 'darwin' ? '/Applications/Orca.app/Contents/Resources/bin/orca' : 'orca-ide';
}

export function createScanner({ run = execute, executable = cliExecutable(), platform = process.platform, readRecency = readNativeRecency } = {}) {
  const recency = createRecencyTracker();
  let lastSnapshot = null;
  // Select this host explicitly: inherited pairing variables must not redirect the scan.
  const cli = async (args) => {
    const { stdout } = await run(executable, [...args, '--environment', 'local', '--json'],
      { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const response = JSON.parse(stdout);
    if (!response.ok || !response.result) throw new Error(response.error?.message || 'Orca did not return a result.');
    return response.result;
  };
  return {
    async scan() {
      if (!['darwin', 'linux'].includes(platform)) throw new Error('Process inspection currently supports macOS and Linux hosts.');
      const [terminals, navigation] = await Promise.all([
        cli(['terminal', 'list', '--include-visual-layouts', '--limit', '1000']),
        readRecency().catch(() => null)
      ]);
      if (!Array.isArray(terminals.terminals)) throw new Error('Orca returned an unsupported terminal list.');
      const [resources, processResult, inventory, projects] = await Promise.allSettled([
        cli(['diagnostics', 'memory']),
        run('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,tpgid=,tty=,stat=,comm='], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 }),
        cli(['worktree', 'ps', '--limit', '1000']),
        cli(['project', 'list'])
      ]);
      const snapshot = buildSnapshot(terminals, resources.status === 'fulfilled' ? resources.value : null,
        processResult.status === 'fulfilled' ? parseProcesses(processResult.value.stdout) : new Map());
      if (resources.status === 'rejected') snapshot.notes.push('Orca resource diagnostics could not be read.');
      if (processResult.status === 'rejected') snapshot.notes.push('The local process table could not be read.');
      if (!navigation) snapshot.notes.push('Saved access order is unavailable; ordering uses terminals observed in this session.');
      applyWorktreeAppearances(snapshot, inventory.status === 'fulfilled' ? inventory.value : null, projects.status === 'fulfilled' ? projects.value : null);
      lastSnapshot = recency.apply(snapshot, terminals, navigation);
      return lastSnapshot;
    },
    async focus(handle) {
      if (typeof handle !== 'string' || !/^term_[a-zA-Z0-9-]+$/.test(handle)) throw new Error('Invalid terminal handle.');
      // Re-list before acting: handles are runtime-scoped and may have expired.
      const current = await cli(['terminal', 'list', '--limit', '1000']);
      if (!current.terminals?.some(t => t.handle === handle && !t.orphaned)) throw new Error('This terminal has closed. Refresh the list.');
      const result = await cli(['terminal', 'switch', '--terminal', handle]);
      if (result.navigated === false || result.focused === false) throw new Error('Orca could not focus this terminal.');
      const accessedAt = Date.now();
      if (lastSnapshot) recency.opened(lastSnapshot, handle, accessedAt);
      return { focused: true, accessedAt };
    }
  };
}
