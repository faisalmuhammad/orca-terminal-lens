// A local capture harness. This never talks to the Orca worker or real terminals.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './release-lib.mjs';

const [flag, rawPort] = process.argv.slice(2);
if (flag && flag !== '--port') throw new Error('Usage: npm run preview:release -- [--port 43192]');
const port = Number(rawPort || 43192);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
const MiB = 1024 ** 2;
const terminal = (id, title, name, cpu, memory, accessed, agentIdentity) => ({
  handle: 'term_demo-' + id, terminalId: id, title, state: 'running', cpu, memory: memory * MiB,
  accessAt: accessed, agentIdentity, processes: [{ name, pid: 2000 + accessed, foreground: true }, { name: 'sh', pid: 1000 + accessed }]
});
const fixture = { scannedAt: 1700000000000, notes: [], groups: [
  { id: 'web-main', repoId: 'web', projectId: 'northstar', project: 'Northstar', name: 'main', branch: 'main', path: '/demo/northstar/main', host: 'local', lastAccessAt: 60,
    appearance: { iconName: 'Code2', color: '#287d6c' }, terminals: [terminal('web', 'Web development server', 'node', 4.2, 368, 60), terminal('agent', 'Code review', 'node', 1.6, 184, 50, 'codex')] },
  { id: 'api-main', repoId: 'api', projectId: 'harbor', project: 'Harbor', name: 'main', branch: 'main', path: '/demo/harbor/main', host: 'local', lastAccessAt: 30,
    appearance: { iconName: 'Server', color: '#5255a3' }, terminals: [terminal('api', 'API server', 'python3', 2.3, 76, 30)] }
] };
const dark = 'color-scheme:dark;--orca-background:#18202b;--orca-foreground:#d5dbe4;--orca-ring:#b196ff;--orca-muted-foreground:#94a3b8;';
const light = 'color-scheme:light;--orca-background:#ffffff;--orca-foreground:#5255a3;--orca-ring:#287d6c;--orca-muted-foreground:#6f6b80;';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

function injection(view) {
  return '<script>localStorage.setItem("running-terminals:view",' + JSON.stringify(view) + ');' +
    'window.__releaseFixture=' + JSON.stringify(fixture) + ';window.__sampleScan=0;' +
    'window.orca={plugin:{request:async function(name){if(name!=="terminals.scan")return {focused:true};' +
    'const data=structuredClone(window.__releaseFixture);const scan=window.__sampleScan++;data.scannedAt+=scan*10000;' +
    'const change=[0,.4,.8,.3,-.3,.1,.7,1,.5,.2,.6,.9];data.groups[0].terminals[0].cpu+=change[scan%change.length];return data;}},' +
    'host:{call:async()=>({workspaceId:"web-main"})},on:()=>{}};' +
    'window.__captureReady=new Promise(resolve=>addEventListener("DOMContentLoaded",async()=>{' +
    'document.querySelector("[data-view=' + view + ']").click();const refresh=document.getElementById("refresh");for(let i=0;i<12;i++){while(refresh.disabled)await new Promise(r=>setTimeout(r,20));' +
    'refresh.click();await new Promise(r=>setTimeout(r,30));}' +
    'document.getElementById("live").click();await new Promise(r=>setTimeout(r,500));resolve(true);}));</script>';
}

function gallery(theme) {
  const foreground = theme === 'dark' ? '#d5dbe4' : '#5255a3';
  const muted = theme === 'dark' ? '#94a3b8' : '#6f6b80';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Terminal Lens release preview</title>' +
    '<style>:root{' + (theme === 'dark' ? dark : light) + '}*{box-sizing:border-box}body{margin:0;background:var(--orca-background);color:' + foreground + ';font-family:Arial,sans-serif;padding:48px 56px;width:1600px;height:1240px;overflow:hidden}' +
    'h1{font-size:36px;letter-spacing:-1px;margin:0 0 8px}p{margin:0;color:' + muted + ';font-size:17px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}' +
    '.sample{font-size:13px;border:1px solid currentColor;opacity:.7;border-radius:100px;padding:8px 14px}.views{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}' +
    'h2{font-size:17px;margin:0 0 12px;font-weight:500}iframe{display:block;border:1px solid color-mix(in srgb,' + foreground + ' 12%,transparent);border-radius:16px;width:100%;height:1040px}</style></head><body>' +
    '<header><div><h1>Terminal Lens</h1><p>Find running processes. Jump to their terminals.</p></div><span class="sample">Sample data</span></header><div class="views">' +
    [['project','By project'],['grouped','By worktree'],['flat','Flat list']].map(([view,label]) => '<section><h2>' + label + '</h2><iframe title="' + label + '" src="/panel/index.html?theme=' + theme + '&view=' + view + '"></iframe></section>').join('') +
    '</div><script>window.__captureReady=new Promise(resolve=>addEventListener("load",async()=>{await Promise.all([...document.querySelectorAll("iframe")].map(f=>f.contentWindow.__captureReady));resolve(true);}));</script></body></html>';
}

http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const theme = url.searchParams.get('theme') === 'light' ? 'light' : 'dark';
    const view = ['project','grouped','flat'].includes(url.searchParams.get('view')) ? url.searchParams.get('view') : 'project';
    if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(gallery(theme)); return; }
    if (url.pathname === '/assets/icon.png') { response.setHeader('Content-Type', 'image/png'); response.end(await readFile(path.join(root, 'assets/icon.png'))); return; }
    const file = url.pathname.slice(1);
    if (!/^panel\/[a-z-]+\.(?:html|css|js|mjs)$/.test(file)) { response.writeHead(404); response.end(); return; }
    let body = await readFile(path.join(root, file));
    if (file === 'panel/index.html') body = Buffer.from(body.toString().replace('<html lang="en">', '<html lang="en" class="' + theme + '" style="' + (theme === 'dark' ? dark : light) + '">')
      .replace('<script type="module"', injection(view) + '<script type="module"'));
    response.setHeader('Content-Type', types[path.extname(file)]); response.end(body);
  } catch { response.writeHead(404); response.end(); }
}).listen(port, '127.0.0.1', () => console.log('Release preview: http://127.0.0.1:' + port));
