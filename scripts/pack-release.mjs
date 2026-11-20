import { mkdir, rm, copyFile, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { root, run, releaseTag, validateRelease } from './release-lib.mjs';
import { publishingFiles, auditPublishingFiles } from './stage-publish.mjs';

export async function packRelease(directory = root, tag) {
  const result = await validateRelease(directory, tag);
  await auditPublishingFiles(directory, await publishingFiles(directory));
  const output = path.join(directory, '.release'), stage = path.join(output, 'staging');
  // Delete only this script's generated staging directory, never the source folder.
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  for (const file of result.files) {
    const target = path.join(stage, file);
    await mkdir(path.dirname(target), { recursive: true });
    if (file === 'package.json') {
      const { name, version, type, license } = result.pkg;
      await writeFile(target, JSON.stringify({ name, version, type, license, private: true }, null, 2) + '\n');
    } else await copyFile(path.join(directory, file), target);
  }
  const name = 'terminal-lens-' + result.manifest.version + '.tar.gz';
  const archive = path.join(output, name);
  await run('tar', ['-czf', archive, '-C', stage, ...result.files], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(archive + '.sha256', hash + '  ' + name + '\n');
  await writeFile(path.join(output, 'release-notes.md'), result.notes);
  await writeFile(path.join(output, 'files.json'), JSON.stringify(result.files, null, 2) + '\n');
  return { archive, sha256: hash, files: result.files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await packRelease(root, releaseTag(process.argv.slice(2))), null, 2));
}
