import { readFile, writeFile } from 'node:fs/promises';
import { root, stableVersion } from './release-lib.mjs';
import path from 'node:path';

const [version, ...extra] = process.argv.slice(2);
if (extra.length || !stableVersion.test(version ?? '')) throw new Error('Usage: npm run version:release -- X.Y.Z');
const manifestPath = path.join(root, 'orca-plugin.json'), packagePath = path.join(root, 'package.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
const panelPath = path.join(root, 'panel/index.html');
const html = await readFile(panelPath, 'utf8');
const previous = manifest.version;
if (!html.includes('title="Terminal Lens version ' + previous + '"')) throw new Error('Repair the existing footer version before bumping');
const nextHtml = html.replace('aria-label="Plugin version ' + previous + '"', 'aria-label="Plugin version ' + version + '"')
  .replace('title="Terminal Lens version ' + previous + '"', 'title="Terminal Lens version ' + version + '"')
  .replace('>v' + previous + '</span>', '>v' + version + '</span>');
manifest.version = version; pkg.version = version;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(packagePath, JSON.stringify(pkg, null, 2) + '\n');
await writeFile(panelPath, nextHtml);
console.log('Updated manifest, package, and footer to ' + version + '. Run npm install --package-lock-only and add CHANGELOG.md notes.');
