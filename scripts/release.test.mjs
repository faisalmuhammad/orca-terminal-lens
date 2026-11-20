import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, run, validateRelease, releaseTag } from './release-lib.mjs';
import { packRelease } from './pack-release.mjs';
import { publishingFiles, auditPublishingFiles, stagePublishing } from './stage-publish.mjs';
import { prepareRelease } from './prepare-release.mjs';
import { readReleaseInfo } from './ci-release.mjs';

async function fixture(action) {
  const directory = await mkdtemp(path.join(tmpdir(), 'terminal-lens-release-'));
  try {
    for (const file of ['src','panel','docs','assets','scripts','.github','.gitignore','.gitattributes','package.json','package-lock.json','orca-plugin.json','README.md','RELEASE.md','COMPATIBILITY.md','THIRD_PARTY_NOTICES.md','LICENSE','CHANGELOG.md','CONTRIBUTING.md']) {
      await cp(path.join(root,file), path.join(directory,file), {recursive:true});
    }
    await action(directory);
  } finally { await rm(directory,{recursive:true,force:true}); }
}

test('release rejects mismatched tag, package version, and footer version', async () => fixture(async directory => {
  await assert.rejects(validateRelease(directory,'v9.0.0'), /Release tag/);
  assert.throws(() => releaseTag(['--tag']), /Usage/);
  const file = path.join(directory,'package.json'), original = await readFile(file,'utf8');
  const pkg = JSON.parse(original); pkg.version='9.0.0'; await writeFile(file,JSON.stringify(pkg));
  await assert.rejects(validateRelease(directory), /versions differ/);
  await writeFile(file,original);
  const html = path.join(directory,'panel/index.html');
  await writeFile(html,(await readFile(html,'utf8')).replace('Plugin version ' + JSON.parse(original).version,'Plugin version 9.0.0'));
  await assert.rejects(validateRelease(directory), /Footer version/);
}));

test('release rejects missing images and unreviewed grants', async () => fixture(async directory => {
  await rm(path.join(directory,'assets/icon.png'));
  await assert.rejects(validateRelease(directory), /ENOENT/);
  await cp(path.join(root,'assets/icon.png'),path.join(directory,'assets/icon.png'));
  const file = path.join(directory,'orca-plugin.json'), manifest=JSON.parse(await readFile(file,'utf8'));
  manifest.capabilities.push({kind:'terminal:send'}); await writeFile(file,JSON.stringify(manifest));
  await assert.rejects(validateRelease(directory), /access review/);
}));

test('release enforces Orca cover alt length and permits a cover without a screenshot gallery', async () => fixture(async directory => {
  const file = path.join(directory, 'orca-plugin.json'), manifest = JSON.parse(await readFile(file, 'utf8'));
  delete manifest.screenshots;
  manifest.cover.alt = 'x'.repeat(161);
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(validateRelease(directory), /at most 160 characters/);
  manifest.cover.alt = 'x'.repeat(160);
  await writeFile(file, JSON.stringify(manifest));
  const result = await validateRelease(directory);
  assert.deepEqual(result.assets.shots, []);
  assert.ok(!result.files.some(file => file.startsWith('assets/screenshot-')));
}));

test('archive includes runtime and license, excludes local state and development dependencies, and verifies its checksum', async () => fixture(async directory => {
  await mkdir(path.join(directory,'.orca'),{recursive:true});
  await writeFile(path.join(directory,'.orca','private.json'),'private fixture');
  await writeFile(path.join(directory,'.env'),'private fixture');
  const version=JSON.parse(await readFile(path.join(directory,'orca-plugin.json'),'utf8')).version;
  const result = await packRelease(directory,'v' + version);
  const {stdout} = await run('tar',['-tzf',result.archive]);
  const files=stdout.trim().split('\n');
  assert.ok(files.includes('orca-plugin.json') && files.includes('src/worker.mjs') && files.includes('LICENSE'));
  assert.ok(!files.some(f=>/\.orca|\.env|node_modules|\.test\.|scripts\/|proposal/.test(f)));
  const pkg=JSON.parse(await readFile(path.join(directory,'.release/staging/package.json'),'utf8'));
  assert.equal(pkg.devDependencies,undefined);
  const hash=createHash('sha256').update(await readFile(result.archive)).digest('hex');
  assert.ok((await readFile(result.archive+'.sha256','utf8')).startsWith(hash+'  '));
}));

test('publishing snapshot excludes local proposals and rejects private paths and symlinks', async () => fixture(async directory => {
  const files=await publishingFiles(directory);
  assert.ok(files.includes('.github/workflows/release.yml') && files.includes('scripts/release.test.mjs'));
  assert.ok(!files.some(f=>/proposal|\.orca\//.test(f)));
  const readme=path.join(directory,'README.md'), original=await readFile(readme,'utf8');
  const privatePath=path.posix.join('/','Users','private-example','project');
  await writeFile(readme,original+'\n'+privatePath);
  await assert.rejects(auditPublishingFiles(directory,files), /Machine-specific/);
  await rm(readme); await symlink(path.join(root,'README.md'),readme);
  await assert.rejects(auditPublishingFiles(directory,files), /regular file/);
}));

test('publishing staging preserves existing Git checkouts', async () => fixture(async directory => {
  const destination=path.join(directory,'.release/repository/.git');
  await mkdir(destination,{recursive:true});
  await writeFile(path.join(destination,'sentinel'),'keep');
  await assert.rejects(stagePublishing(directory), /Git checkout/);
  assert.equal(await readFile(path.join(destination,'sentinel'),'utf8'),'keep');
}));

test('manifest-driven preparation synchronizes package, lockfile, footer, and install references', async () => fixture(async directory => {
  const file = path.join(directory, 'orca-plugin.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.version = '8.7.6';
  await writeFile(file, JSON.stringify(manifest));
  await writeFile(path.join(directory, 'CHANGELOG.md'), ['## 8.7.6', '- Search improvements.', ''].join(String.fromCharCode(10)));
  assert.equal((await prepareRelease(directory)).tag, 'v8.7.6');
  assert.equal(readReleaseInfo(directory, 'v8.7.6').version, '8.7.6');
  const lock = JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages[''].version, '8.7.6');
  assert.ok((await readFile(path.join(directory, 'panel/index.html'), 'utf8')).includes('>v8.7.6</span>'));
  assert.ok((await readFile(path.join(directory, 'README.md'), 'utf8')).includes('@v8.7.6'));
  assert.ok((await readFile(path.join(directory, 'RELEASE.md'), 'utf8')).includes('#v8.7.6'));
}));

test('preparation rejects a missing changelog entry before changing package metadata', async () => fixture(async directory => {
  const file = path.join(directory, 'orca-plugin.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  const previous = await readFile(path.join(directory, 'package.json'), 'utf8');
  manifest.version = '9.0.0';
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(prepareRelease(directory), /Missing changelog entry/);
  assert.equal(await readFile(path.join(directory, 'package.json'), 'utf8'), previous);
}));

test('GitHub upload ZIP contains the complete audited snapshot including hidden release configuration', async () => fixture(async directory => {
  const result = await stagePublishing(directory);
  const { stdout } = await run('unzip', ['-Z1', result.archive]);
  const files = stdout.trim().split(String.fromCharCode(10)).sort();
  assert.deepEqual(files, await publishingFiles(directory));
  assert.ok(files.includes('.github/scripts/publish-release.mjs'));
  assert.ok(files.includes('.github/scripts/install-orca.sh'));
  assert.ok(files.includes('LICENSE') && files.includes('THIRD_PARTY_NOTICES.md') && files.includes('RELEASE.md'));
  const checksum = createHash('sha256').update(await readFile(result.archive)).digest('hex');
  assert.equal(checksum, result.sha256);
  assert.ok((await readFile(result.archive + '.sha256', 'utf8')).startsWith(checksum + '  '));
  assert.equal(result.audit.homePaths, 0);
}));
