import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { root, run } from './release-lib.mjs';
import { cliExecutable } from '../src/scanner.mjs';

const executable = cliExecutable();
const css = await readFile(path.join(root, 'panel/styles.css'), 'utf8');
const ink = css.match(/--color-foreground: *(#[a-f0-9]{6})/i)?.[1];
if (!ink) throw new Error('Missing approved artwork foreground token');
const backdrop = '#' + [1,3,5].map(start => Math.round(parseInt(ink.slice(start,start+2),16)*.2).toString(16).padStart(2,'0')).join('');
const call = async args => {
  const { stdout } = await run(executable,[...args,'--json'],{cwd:root,timeout:30000,maxBuffer:8*1024*1024});
  const response=JSON.parse(stdout);
  if (!response.ok) throw new Error(response.error?.message || 'Orca command failed');
  return response.result;
};
let page;
const server=spawn(process.execPath,[path.join(root,'scripts/preview-release.mjs')],{cwd:root,stdio:['ignore','pipe','pipe']});
try {
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Preview server did not start')),10000);
    server.once('error',error=>{clearTimeout(timer);reject(error);});
    server.once('exit',()=>{clearTimeout(timer);reject(new Error('Preview server exited; check the loopback port'));});
    server.stdout.on('data',data=>{if(data.toString().includes('Release preview:')){clearTimeout(timer);resolve();}});
    server.stderr.on('data',data=>process.stderr.write(data));
  });
  await mkdir(path.join(root,'assets/source'),{recursive:true});
  page=(await call(['tab','create','--url','http://127.0.0.1:43192/panel/index.html?theme=dark&view=project'])).browserPageId;
  if (!page) throw new Error('Orca did not return a browser page ID');
  await call(['viewport','--page',page,'--width','480','--height','820']);
  await call(['snapshot','--page',page]);
  await call(['eval','--page',page,'--expression','Promise.resolve(window.__captureReady).then(() => {document.documentElement.style.setProperty("--orca-background",' + JSON.stringify(backdrop) + ');const style=document.createElement("style");style.textContent="body,main,footer,.overview,.group,.group-heading,.terminal,.search,.view-switch{background:var(--color-surface)!important;}";document.head.append(style);return true;})']);
  const capture=await call(['full-screenshot','--page',page]);
  await sharp(capture.path).extract({left:0,top:0,width:480,height:820}).png({compressionLevel:9}).toFile(path.join(root,'assets/source/panel-demo-dark.png'));
  await run(process.execPath,[path.join(root,'scripts/generate-art.mjs')],{cwd:root,timeout:30000});
  console.log('Captured the sample panel for the cover and generated release artwork.');
} finally {
  if(page) await call(['tab','close','--page',page]).catch(error=>console.error('Close the capture tab manually:',error.message));
  const stopped=!server.pid || server.exitCode !== null ? Promise.resolve() : once(server,'exit');
  server.kill('SIGTERM');
  await stopped;
}
