import { mkdir, rm, readdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { root, run, releaseFiles, validateRelease } from './release-lib.mjs';
import { distributionFile } from './publishing-policy.mjs';

export async function publishingFiles(directory = root) {
  const files = await releaseFiles(directory);
  files.push('package-lock.json', '.gitignore', '.gitattributes', '.github/workflows/release.yml', '.github/scripts/install-orca.sh', '.github/scripts/publish-release.mjs');
  for (const [folder, pattern] of [['src', /\.test\.mjs$/], ['scripts', /\.mjs$/], ['assets/source', /\.(?:svg|png)$/]]) {
    for (const file of await readdir(path.join(directory, folder), { withFileTypes: true })) {
      if (pattern.test(file.name)) files.push(folder + '/' + file.name);
    }
  }
  return [...new Set(files)].sort();
}

export async function auditPublishingFiles(directory, files) {
  const homePath = /(?:[/]Users[/][^/\s]+[/]|[/]home[/][^/\s]+[/]|[A-Z]:[\\]Users[\\])/i;
  for (const file of files) {
    const data = await distributionFile(directory, file);
    if (file.endsWith('.png')) {
      let offset = 8;
      while (offset + 12 <= data.length) {
        const type = data.toString('ascii', offset + 4, offset + 8);
        if (['tEXt','zTXt','iTXt','eXIf'].includes(type)) throw new Error('Remove image text/EXIF metadata before publishing: ' + file);
        offset += data.readUInt32BE(offset) + 12;
      }
    } else {
      const text = data.toString('utf8');
      if (homePath.test(text)) throw new Error('Machine-specific home path found in ' + file);
      if (text.includes('file:' + '//')) throw new Error('Local file URL found in ' + file);
    }
  }
  const lock = JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) throw new Error('Lockfile version differs from the package; run npm install --package-lock-only');
  for (const dependency of Object.values(lock.packages || {})) {
    if (dependency.resolved && !dependency.resolved.startsWith('https://registry.npmjs.org/')) throw new Error('Lockfile contains a local or non-public dependency source');
  }
  for (const file of files.filter(f => f.endsWith('.md'))) {
    const markdown = await readFile(path.join(directory, file), 'utf8');
    for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (!link || /^https?:/.test(link)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), link));
      if (!files.includes(target)) throw new Error('Broken publishing link in ' + file + ': ' + link);
    }
  }
  return { files: files.length, homePaths: 0, imageTextMetadata: 0, privateDependencySources: 0 };
}

export async function stagePublishing(directory = root) {
  await validateRelease(directory);
  const files = await publishingFiles(directory);
  const audit = await auditPublishingFiles(directory, files);
  const destination = path.join(directory, '.release', 'repository');
  if (await access(path.join(destination, '.git')).then(() => true, () => false)) throw new Error('Publishing staging contains a Git checkout; refuse to replace it');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    const target = path.join(destination, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(directory, file), target);
  }
  await auditPublishingFiles(destination, files);
  await writeFile(path.join(directory,'.release','publishing-files.json'), JSON.stringify({ files, audit }, null, 2) + '\n');
  const archiveName = 'github-upload-v' + JSON.parse(await readFile(path.join(directory, 'orca-plugin.json'), 'utf8')).version + '.zip';
  const archive = path.join(directory, '.release', archiveName);
  await rm(archive, { force:true });
  await run('zip', ['-q', '-X', '-9', archive, ...files], { cwd:destination });
  const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(archive + '.sha256', hash + '  ' + archiveName + '\n');
  return { destination, archive, sha256:hash, audit };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error('Usage: npm run stage:publish');
  console.log(JSON.stringify(await stagePublishing(), null, 2));
}
