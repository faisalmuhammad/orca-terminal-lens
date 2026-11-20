import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const run = promisify(execFile);
export const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const json = async file => JSON.parse(await readFile(file, 'utf8'));

export function releaseTag(args) {
  requireThat(args.length === 0 || (args.length === 2 && args[0] === '--tag'), 'Usage: [--tag vX.Y.Z]');
  return args[1];
}

export async function releaseFiles(directory) {
  const files = ['orca-plugin.json', 'package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md',
    'RELEASE.md', 'COMPATIBILITY.md', 'THIRD_PARTY_NOTICES.md', 'docs/usage.md', 'docs/PRIVACY.md', 'docs/DESIGN.md', 'docs/RELEASING.md', 'docs/github-upload.md', 'assets/README.md'];
  for (const folder of ['src', 'panel']) {
    for (const file of await readdir(path.join(directory, folder), { withFileTypes: true })) {
      if (!/\.(?:mjs|js|css|html)$/.test(file.name) || /\.test\./.test(file.name)) continue;
      requireThat(file.isFile(), 'Release files must be regular files: ' + folder + '/' + file.name);
      files.push(folder + '/' + file.name);
    }
  }
  const manifest = await json(path.join(directory, 'orca-plugin.json'));
  files.push(manifest.icon, manifest.cover.path, ...(manifest.screenshots || []).map(s => s.path), 'assets/social.png');
  return [...new Set(files)].sort();
}

export async function imageInfo(directory, file) {
  requireThat(typeof file === 'string' && /^assets\/[a-z0-9-]+\.png$/.test(file), 'Invalid asset path: ' + file);
  const buffer = await readFile(path.join(directory, file));
  requireThat(buffer.length >= 33 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && buffer.toString('ascii',12,16) === 'IHDR', file + ' must be a PNG');
  let offset = 8, ended = false;
  while (offset + 12 <= buffer.length) {
    const size = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    requireThat(type !== 'acTL', file + ' must be static');
    offset += size + 12;
    requireThat(offset <= buffer.length, file + ' has a truncated PNG chunk');
    if (type === 'IEND') { ended = true; break; }
  }
  requireThat(ended, file + ' has no PNG end chunk');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
}

export function changelogNotes(text, version) {
  const sections = text.split(/^## /m).slice(1);
  const section = sections.find(s => s.split('\n', 1)[0].trim() === version);
  requireThat(section, 'CHANGELOG.md needs a section for ' + version);
  const notes = section.slice(section.indexOf('\n') + 1).trim();
  requireThat(notes.length > 0, 'Release notes must not be empty');
  return notes + '\n';
}

export async function validateRelease(directory = root, tag) {
  const manifest = await json(path.join(directory, 'orca-plugin.json'));
  const pkg = await json(path.join(directory, 'package.json'));
  const allowed = new Set(['manifestVersion','id','name','version','description','author','repository','homepage','icon','cover','screenshots','license','engines','execution','pluginApi','main','contributes','capabilities']);
  requireThat(Object.keys(manifest).every(k => allowed.has(k)), 'Unknown manifest field; validate new fields with Orca before updating the release check');
  requireThat(manifest.manifestVersion === 2 && manifest.pluginApi === 1, 'Unsupported manifest/API version');
  requireThat(manifest.name === 'Terminal Lens' && manifest.id === 'running-terminals', 'Keep the display name and stable install identity');
  requireThat(stableVersion.test(manifest.version), 'Release version must be stable semver X.Y.Z');
  requireThat(pkg.version === manifest.version, 'Package and manifest versions differ');
  requireThat(!tag || tag === 'v' + manifest.version, 'Release tag must equal v' + manifest.version);
  requireThat(manifest.repository === 'https://github.com/faisalmuhammad/orca-terminal-lens', 'Unexpected source repository');
  requireThat(pkg.repository?.url === manifest.repository + '.git', 'Package repository must match the manifest');
  requireThat(manifest.homepage === manifest.repository + '#readme', 'Homepage must point to the project README');
  requireThat(manifest.author?.name && manifest.author?.url?.startsWith('https://'), 'Author metadata is required');
  requireThat(manifest.description?.length > 0 && manifest.license === 'MIT' && pkg.license === 'MIT', 'Description and MIT license metadata are required');
  requireThat(manifest.engines?.orca === '>=1.4.260', 'Review host requirements before changing the supported Orca version');
  requireThat(manifest.execution === 'trusted-worker' && manifest.main === 'src/worker.mjs', 'Unexpected worker configuration');
  requireThat(JSON.stringify(manifest.capabilities) === JSON.stringify([{kind:'workspace:read'},{kind:'workspace:write'},{kind:'terminal:read'}]), 'Capability changes require an access review');
  requireThat(Object.keys(manifest.contributes).length === 1 && Array.isArray(manifest.contributes.panels) && manifest.contributes.panels.length === 1, 'Unexpected contributions');
  const panel = manifest.contributes.panels[0];
  requireThat(panel.id === 'running-terminals' && panel.title === manifest.name && panel.icon === 'terminal' && panel.entry === 'panel/index.html' && panel.ui === 'html', 'Unexpected panel configuration');
  const html = await readFile(path.join(directory, panel.entry), 'utf8');
  requireThat(html.includes('<title>Terminal Lens</title>') && html.includes('<h1>Terminal Lens</h1>'), 'Panel branding differs from the manifest');
  requireThat(html.includes('aria-label="Plugin version ' + manifest.version + '"') && html.includes('title="Terminal Lens version ' + manifest.version + '"') && html.includes('>v' + manifest.version + '</span>'), 'Footer version differs from the manifest');
  requireThat((await readFile(path.join(directory, 'LICENSE'), 'utf8')).includes('MIT License'), 'Missing MIT license text');
  const notes = changelogNotes(await readFile(path.join(directory, 'CHANGELOG.md'), 'utf8'), manifest.version);
  requireThat(typeof manifest.cover?.alt === 'string' && manifest.cover.alt.trim(), 'Cover alt text is required');
  requireThat(manifest.cover.alt.length <= 160, 'Cover alt text must be at most 160 characters');
  const screenshots = manifest.screenshots ?? [];
  requireThat(Array.isArray(screenshots) && screenshots.length <= 6 && (manifest.screenshots === undefined || screenshots.length > 0), 'When present, include one to six screenshots');
  requireThat(screenshots.every(s => s.alt?.trim() && s.caption?.trim() && ['light','dark'].includes(s.theme)), 'Screenshots need alt text, captions, and themes');
  const icon = await imageInfo(directory, manifest.icon);
  requireThat(icon.width === icon.height && icon.width >= 128 && icon.bytes <= 256 * 1024, 'Icon must be square, at least 128px, and at most 256 KiB');
  const cover = await imageInfo(directory, manifest.cover.path);
  requireThat(cover.width >= 800 && cover.height >= 500 && cover.bytes <= 1024 * 1024, 'Cover must be at least 800x500 and at most 1 MiB');
  const shots = await Promise.all(screenshots.map(s => imageInfo(directory, s.path)));
  requireThat(shots.every(s => s.width > 0 && s.height > 0) && shots.reduce((n,s) => n+s.bytes,0) <= 8*1024*1024, 'Screenshot dimensions or size exceed the supported limit');
  const social = await imageInfo(directory, 'assets/social.png');
  requireThat(social.width === 1280 && social.height === 640 && social.bytes < 1024*1024, 'Social image must be 1280x640 and below 1 MiB');
  const files = await releaseFiles(directory), included = new Set(files);
  requireThat(included.has(manifest.main) && included.has(panel.entry), 'Release archive is missing an entry point');
  for (const file of files) {
    const stat = await lstat(path.join(directory, file));
    requireThat(stat.isFile() && !stat.isSymbolicLink(), 'Release file must not be a directory or symlink: ' + file);
    if (/\.(?:mjs|js)$/.test(file)) {
      await run(process.execPath, ['--check', path.join(directory, file)]);
      const text = await readFile(path.join(directory, file), 'utf8');
      for (const match of text.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
        if (match[1].startsWith('node:')) continue;
        requireThat(match[1].startsWith('.'), 'Runtime dependencies must be bundled: ' + match[1]);
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
        requireThat(included.has(target), 'Missing runtime import: ' + file + ' -> ' + target);
      }
    }
  }
  return { manifest, pkg, files, notes, assets: { icon, cover, shots, social } };
}
