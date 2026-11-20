import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './release-lib.mjs';
import { releaseInfo, readReleaseInfo } from './ci-release.mjs';

export async function prepareRelease(directory = root) {
  const read = file => readFile(path.join(directory, file), 'utf8');
  const manifest = JSON.parse(await read('orca-plugin.json'));
  const info = releaseInfo(manifest.version, await read('CHANGELOG.md'));
  const updates = [];
  for (const file of ['package.json', 'package-lock.json']) {
    const pkg = JSON.parse(await read(file));
    pkg.version = info.version;
    if (pkg.packages) pkg.packages[''].version = info.version;
    updates.push([file, JSON.stringify(pkg, null, 2) + String.fromCharCode(10)]);
  }
  const html = await read('panel/index.html');
  const oldVersion = html.match(/title="Terminal Lens version ([0-9]+[.][0-9]+[.][0-9]+)"/)?.[1];
  if (!oldVersion) throw new Error('Repair the existing footer version before preparing a release');
  updates.push(['panel/index.html', html.replace('aria-label="Plugin version ' + oldVersion + '"', 'aria-label="Plugin version ' + info.version + '"')
    .replace('title="Terminal Lens version ' + oldVersion + '"', 'title="Terminal Lens version ' + info.version + '"')
    .replace('>v' + oldVersion + '</span>', '>v' + info.version + '</span>')]);
  for (const file of ['README.md', 'RELEASE.md']) {
    updates.push([file, (await read(file)).replace(/v[0-9]+[.][0-9]+[.][0-9]+/g, info.tag)
      .replace(/Version [*][*][0-9]+[.][0-9]+[.][0-9]+[*][*]/, 'Version **' + info.version + '**')
      .replace(/Release version: [*][*][0-9]+[.][0-9]+[.][0-9]+[*][*]/, 'Release version: **' + info.version + '**')]);
  }
  for (const [file, content] of updates) await writeFile(path.join(directory, file), content);
  readReleaseInfo(directory);
  return info;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length > 2) throw new Error('Usage: npm run release:prepare');
  const info = await prepareRelease();
  console.log('Prepared ' + info.tag + ' from orca-plugin.json. Validate and commit the release files before pushing main.');
}
