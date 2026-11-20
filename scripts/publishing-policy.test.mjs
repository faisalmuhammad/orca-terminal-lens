import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root, run } from './release-lib.mjs';
import { distributionFile, auditTrackedFiles } from './publishing-policy.mjs';

async function fixture(action) {
  const directory = await mkdtemp(path.join(tmpdir(), 'terminal-lens-policy-'));
  try { await mkdir(path.join(directory, 'assets')); await action(directory); }
  finally { await rm(directory, { recursive:true, force:true }); }
}

test('publishing rejects Finder metadata, native modules, archives, bytecode and desktop fonts', async () => fixture(async directory => {
  for (const file of ['assets/.DS_Store','assets/._icon.png','module.node','program.exe','native.dylib','bundle.zip','cache.pyc','font.ttf','font.otf']) {
    await writeFile(path.join(directory, file), 'fixture');
    await assert.rejects(distributionFile(directory, file), /Disallowed publishing file/);
  }
}));

test('publishing rejects binary contents disguised as text and a fake allowed image', async () => fixture(async directory => {
  for (const [file, bytes] of [['code.mjs',Buffer.from([127,69,76,70])],['README.md',Buffer.from([0,1,2])],['assets/pretend.png',Buffer.from('MZ fixture')]]) {
    await writeFile(path.join(directory, file), bytes);
    await assert.rejects(distributionFile(directory, file), /binary content|Invalid image/);
  }
  await symlink(path.join(directory, 'README.md'), path.join(directory, 'link.md'));
  await assert.rejects(distributionFile(directory, 'link.md'), /regular file/);
}));

test('publishing permits the original PNG artwork and UTF-8 source', async () => fixture(async directory => {
  const png = await readFile(path.join(root, 'assets/icon.png'));
  await writeFile(path.join(directory, 'assets/icon.png'), png);
  assert.deepEqual(await distributionFile(directory, 'assets/icon.png'), png);
  await writeFile(path.join(directory, 'README.md'), 'Terminal Lens → process discovery');
  assert.ok((await distributionFile(directory, 'README.md')).length > 0);
}));

test('Git audit rejects ignored metadata already tracked outside the export allowlist', async () => fixture(async directory => {
  await run('git', ['init', '--quiet'], { cwd:directory });
  await writeFile(path.join(directory, '.gitignore'), '.DS_Store');
  await writeFile(path.join(directory, 'assets/.DS_Store'), 'Finder metadata fixture');
  await run('git', ['add', '.gitignore'], { cwd:directory });
  await run('git', ['add', '--force', 'assets/.DS_Store'], { cwd:directory });
  await assert.rejects(auditTrackedFiles(directory), /Disallowed publishing file: assets[/][.]DS_Store/);
  await run('git', ['rm', '--cached', 'assets/.DS_Store'], { cwd:directory });
  assert.deepEqual(await auditTrackedFiles(directory), { git:true, files:1 });
}));
