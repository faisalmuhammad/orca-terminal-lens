import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from './release-lib.mjs';

const forbiddenExtensions = /[.](?:exe|com|dll|so|dylib|node|o|obj|a|lib|bin|wasm|pyc|pyo|class|jar|zip|tar|tgz|gz|bz2|xz|7z|rar|dmg|pkg|msi|ttf|otf)$/i;
const metadata = /(?:^|[/])(?:[.]DS_Store|[.][_][^/]+|__MACOSX|Thumbs[.]db|Desktop[.]ini)(?:[/]|$)/i;
const mediaHeaders = {
  '.png': data => data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
  '.jpg': data => data.subarray(0,3).equals(Buffer.from([255,216,255])),
  '.jpeg': data => data.subarray(0,3).equals(Buffer.from([255,216,255])),
  '.gif': data => ['GIF87a','GIF89a'].includes(data.toString('ascii',0,6)),
  '.webp': data => data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP',
  '.woff': data => data.toString('ascii',0,4) === 'wOFF',
  '.woff2': data => data.toString('ascii',0,4) === 'wOF2'
};

export async function distributionFile(directory, file) {
  if (path.isAbsolute(file) || file.split('/').includes('..')) throw new Error('Invalid publishing path: ' + file);
  if (metadata.test(file) || forbiddenExtensions.test(file)) throw new Error('Disallowed publishing file: ' + file);
  const stat = await lstat(path.join(directory, file));
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Publishing file is not a regular file: ' + file);
  const data = await readFile(path.join(directory, file));
  const media = mediaHeaders[path.extname(file).toLowerCase()];
  if (media) {
    if (!media(data)) throw new Error('Invalid image or web-font header: ' + file);
  } else {
    try {
      const magic = data.length >= 4 ? data.readUInt32BE(0) : 0;
      if (data.includes(0) || [0x7f454c46,0xfeedface,0xfeedfacf,0xcefaedfe,0xcffaedfe,0xcafebabe,0xbebafeca,0x504b0304,0x504b0506,0x504b0708].includes(magic)
        || (data.length >= 2 && data.readUInt16BE(0) === 0x4d5a)) throw new Error('Binary content');
      new TextDecoder('utf-8', { fatal:true }).decode(data);
    } catch { throw new Error('Disallowed binary content: ' + file); }
  }
  return data;
}

export async function auditTrackedFiles(directory) {
  let stdout;
  try { ({ stdout } = await run('git', ['ls-files', '--cached', '-z', '--', '.'], { cwd:directory })); }
  catch (error) {
    if (error.code === 128 && String(error.stderr).includes('not a git repository')) return { git:false, files:0 };
    throw error;
  }
  const files = stdout.split(String.fromCharCode(0)).filter(Boolean);
  for (const file of files) await distributionFile(directory, file);
  return { git:true, files:files.length };
}
