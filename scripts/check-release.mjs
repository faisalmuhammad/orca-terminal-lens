import { root, releaseTag, validateRelease } from './release-lib.mjs';
import { publishingFiles, auditPublishingFiles } from './stage-publish.mjs';
const result = await validateRelease(root, releaseTag(process.argv.slice(2)) || process.env.RELEASE_TAG);
const publishingAudit = await auditPublishingFiles(root, await publishingFiles(root));
console.log(JSON.stringify({ version: result.manifest.version, files: result.files.length, assets: result.assets, publishingAudit, valid: true }, null, 2));
