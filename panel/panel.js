import { filterGroups, flatTerminals, groupByProject, memoryLabel, processAppearance, terminalAppearance, worktreeAppearance } from './view.mjs';
import { recordSample, cpuSeries, chartGeometry } from './history.mjs';
import { createListMotion } from './motion.mjs';

const $ = id => document.getElementById(id);
const bridge = window.orca;
const svgNS = 'http://www.w3.org/2000/svg';
let snapshot = null, context = null, busy = false, contextBusy = null, timer = null, history = [];
const expanded = new Set(), opening = new Set(), collapsed = new Set();
const listMotion = createListMotion($('list-scroll'));
function alignListScrollbar() {
  const list = $('list-scroll');
  // Keep cards on the shared right edge, with the native scrollbar in the outer padding.
  const gutter = list.offsetWidth - list.clientWidth;
  list.style.marginInlineEnd = -gutter + 'px';
}
const listLayoutObserver = new ResizeObserver(alignListScrollbar);
listLayoutObserver.observe(document.querySelector('main'));
alignListScrollbar();
let view = 'grouped';
try {
  const savedView = localStorage.getItem('running-terminals:view');
  if (['grouped', 'project', 'flat'].includes(savedView)) view = savedView;
} catch {}
const icons = {
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 2v6h-6M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 22v-6h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 7v10m12-9v2a4 4 0 0 1-4 4H6"/>',
  external: '<path d="M14 4h6v6m0-6L10 14M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 14"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  agent: '<rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 3v4M2 12v4m20-4v4M9 16h6"/><circle cx="9" cy="12" r=".7"/><circle cx="15" cy="12" r=".7"/>',
  python: '<path d="M12 3H9a4 4 0 0 0-4 4v4h9a3 3 0 0 0 3-3V7a4 4 0 0 0-4-4h-1Zm0 18h3a4 4 0 0 0 4-4v-4h-9a3 3 0 0 0-3 3v1a4 4 0 0 0 4 4h1ZM5 7H4a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h3m12 0h1a3 3 0 0 0 3-3v-4a3 3 0 0 0-3-3h-3"/><path d="M10 6h.01M14 18h.01"/>',
  gem: '<path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18"/>',
  container: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10M7 5l10 4"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8M3.3 7 12 12l8.7-5M12 22V12"/>',
  sparkles: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3M5 3v4M3 5h4M19 17v4M17 19h4"/>',
  code2: '<path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16"/>',
  folder: '<path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/>',
  blocks: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  book: '<path d="M12 7v14M3 3h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6v16h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3H3V3Z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><ellipse cx="12" cy="12" rx="4" ry="10"/>',
  server: '<rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><path d="M6 6.5h.01M6 17.5h.01"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2M12 15l-3-3c2-5 6-9 12-10 0 6-4 10-9 13ZM9 12H4s0-3 3-5h5m0 8v5s3 0 5-3v-5"/><circle cx="16" cy="7" r="1"/>',
  workflow: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v-3a4 4 0 0 0-4-4H10"/>'
};
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function icon(name) {
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon'); svg.innerHTML = icons[name] ?? icons.terminal;
  return svg;
}
for (const node of document.querySelectorAll('[data-icon]')) node.append(icon(node.dataset.icon));
function showError(message) { $('error').textContent = message; $('error').hidden = !message; }
function drawTrend(handles) {
  const series = cpuSeries(history, handles);
  const { ceiling, segments } = chartGeometry(series);
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 -2 300 34'); svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  const valid = series.filter(s => s.value !== null);
  svg.setAttribute('aria-label', 'CPU trend: ' + valid.length + ' measured scans. Scale 0 to ' + ceiling + ' percent.');
  const shape = (tag, attributes) => { const node = document.createElementNS(svgNS, tag); for (const [key,value] of Object.entries(attributes)) node.setAttribute(key, value); svg.append(node); return node; };
  for (const y of [0, 15, 30]) shape('line', { x1: 0, x2: 300, y1: y, y2: y, class: 'trend-grid' });
  for (const segment of segments) {
    const path = segment.map((p,i) => (i ? 'L' : 'M') + p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');
    if (segment.length > 1) {
      shape('path', { d: path + ' L' + segment.at(-1).x + ',30 L' + segment[0].x + ',30 Z', class: 'trend-area' });
      shape('path', { d: path, class: 'trend-line' });
    }
    const last = segment.at(-1);
    if (last) shape('circle', { cx: last.x, cy: last.y, r: 1.8, class: 'trend-dot' });
  }
  $('trend').replaceChildren(svg);
  const duration = history.length > 1 ? Math.round((history.at(-1).at - history[0].at) / 1000) : 0;
  $('trend-label').textContent = !handles.length ? 'CPU trend · no measured terminals' : valid.length < 2 ? 'CPU trend · collecting samples' : 'CPU trend · last ' + (duration >= 60 ? Math.round(duration / 60) + ' min' : duration + ' sec');
  $('trend-scale').textContent = '0–' + ceiling + '%';
}
function metric(value, fraction, title) {
  const node = element('div', 'metric'); node.title = title;
  const meter = element('div', 'meter'); meter.setAttribute('aria-hidden', 'true');
  const fill = element('div', 'meter-fill'); fill.style.width = Math.min(100, Math.max(0, fraction * 100)) + '%'; meter.append(fill);
  node.append(meter, element('span', 'metric-value', value));
  return node;
}
async function openTerminal(terminal) {
  if (opening.has(terminal.handle)) return;
  const returnControl = document.activeElement?.dataset.handle === terminal.handle ? document.activeElement.dataset.control : null;
  opening.add(terminal.handle); showError(''); render();
  try {
    const result = await bridge.plugin.request('terminals.focus', { handle: terminal.handle });
    const accessedAt = result?.accessedAt || Date.now();
    for (const group of snapshot.groups) {
      const opened = group.terminals.find(t => t.handle === terminal.handle);
      if (opened) { opened.accessAt = accessedAt; group.lastAccessAt = accessedAt; }
    }
  } catch (error) { showError(error.message || 'This terminal could not be opened.'); }
  finally {
    opening.delete(terminal.handle); render();
    if (returnControl && document.activeElement === document.body) {
      [...document.querySelectorAll('[data-handle]')].find(node => node.dataset.handle === terminal.handle && node.dataset.control === returnControl)?.focus({ preventScroll: true });
    }
  }
}
function identityGlyph(appearance, className = '') {
  const glyph = element('span', 'process-identity ' + className);
  glyph.dataset.tone = appearance.tone; glyph.title = appearance.label; glyph.append(icon(appearance.icon));
  return glyph;
}
function terminalCard(terminal, maxMemory, group = null, { includeProject = true } = {}) {
  const card = element('article', 'terminal');
  card.dataset.motionKey = view + ':terminal:' + terminal.handle;
  card.setAttribute('aria-label', terminal.title);
  // A real button covers the row. Its sibling controls stay independent and accessible.
  const activate = element('button', 'row-open');
  activate.type = 'button'; activate.dataset.handle = terminal.handle; activate.dataset.control = 'row';
  activate.setAttribute('aria-label', 'Open terminal: ' + terminal.title + (group ? ' in ' + group.name : ''));
  activate.disabled = opening.has(terminal.handle); activate.addEventListener('click', () => void openTerminal(terminal));
  card.append(activate);
  card.setAttribute('aria-busy', String(opening.has(terminal.handle)));
  const row = element('div', 'terminal-main');
  const processIcon = identityGlyph(terminalAppearance(terminal), 'process-icon');
  const copy = element('div', 'terminal-copy');
  const names = [...new Set(terminal.processes.filter(p => !p.stopped).map(p => p.name))];
  const name = terminal.agentIdentity && terminal.state === 'running' ? terminal.agentIdentity : names.length ? names.slice(0, 3).join(' · ') + (names.length > 3 ? '…' : '') : { idle: 'Shell', stopped: 'Stopped process', unknown: 'Process unknown' }[terminal.state];
  const heading = element('div', 'terminal-heading');
  const dot = element('span', 'state-dot'); dot.dataset.state = terminal.state;
  dot.title = terminal.state; dot.setAttribute('aria-label', terminal.state);
  const processName = element('span', 'process-name', name); processName.title = names.join(', ') || name;
  heading.append(processName, dot);
  const title = element('p', 'terminal-title', terminal.title); title.title = terminal.title;
  copy.append(heading, title);
  if (group) {
    const appearance = worktreeAppearance(group);
    const worktreeName = includeProject && group.project && group.project !== group.name ? group.project + ' / ' + group.name : group.name;
    const worktree = element('span', 'worktree-label'); worktree.append(icon(appearance.icon), element('span', '', worktreeName));
    if (appearance.color) { worktree.style.color = appearance.color; worktree.dataset.customColor = 'true'; }
    worktree.title = [group.project, group.name, group.path].filter(Boolean).join(' · '); copy.append(worktree);
  }
  const open = element('button', 'open', 'Open'); open.type = 'button';
  open.dataset.handle = terminal.handle; open.dataset.control = 'open'; open.title = 'Open terminal: ' + terminal.title;
  open.setAttribute('aria-label', open.title); open.disabled = opening.has(terminal.handle);
  open.addEventListener('click', () => void openTerminal(terminal));
  row.append(processIcon, copy, open); card.append(row);
  const metrics = element('div', 'metrics');
  if (Number.isFinite(terminal.cpu)) metrics.append(metric(terminal.cpu.toFixed(1) + '% CPU', terminal.cpu / 100, 'CPU usage. 100% is one core.'));
  if (Number.isFinite(terminal.memory)) metrics.append(metric(memoryLabel(terminal.memory), maxMemory > 0 ? terminal.memory / maxMemory : 0, 'Memory relative to the largest visible terminal.'));
  if (terminal.processes.length) {
    const toggle = element('button', 'details-toggle', terminal.processes.length + (terminal.processes.length === 1 ? ' process' : ' processes'));
    toggle.type = 'button'; toggle.append(icon('chevron')); toggle.dataset.handle = terminal.handle; toggle.dataset.control = 'details';
    const listId = 'processes-' + terminal.handle;
    toggle.setAttribute('aria-expanded', String(expanded.has(terminal.handle))); toggle.setAttribute('aria-controls', listId);
    const list = element('ul', 'processes'); list.id = listId; list.hidden = !expanded.has(terminal.handle);
    for (const process of terminal.processes) {
      const item = element('li'); const processLabel = element('span', 'process-name', process.name); processLabel.title = process.name;
      const identity = element('span', 'process-detail-name');
      identity.append(identityGlyph(processAppearance(process.name)), processLabel);
      item.append(identity, element('span', 'pid', 'PID ' + process.pid), element('span', 'process-role', process.stopped ? 'Stopped' : process.foreground ? 'Foreground' : 'Background'));
      list.append(item);
    }
    toggle.addEventListener('click', () => {
      if (expanded.has(terminal.handle)) expanded.delete(terminal.handle); else expanded.add(terminal.handle);
      toggle.setAttribute('aria-expanded', String(expanded.has(terminal.handle)));
      listMotion.setHidden(list, !expanded.has(terminal.handle));
    });
    metrics.append(toggle); card.append(metrics, list);
  } else if (metrics.children.length) card.append(metrics);
  if (terminal.reason) card.append(element('p', 'reason', terminal.reason));
  return card;
}
function render({ resetScroll = false } = {}) {
  if (!snapshot) return;
  const listScroll = $('list-scroll'), previousScroll = resetScroll ? 0 : listScroll.scrollTop;
  const previousItems = listMotion.capture($('groups'));
  const groups = filterGroups(snapshot, { query: $('search').value, scope: $('scope').value, context, includeIdle: $('include-idle').checked });
  const terminals = groups.flatMap(g => g.terminals);
  const running = terminals.filter(t => t.state === 'running').length;
  const known = terminals.filter(t => Number.isFinite(t.cpu));
  $('running-count').textContent = running;
  $('summary').textContent = groups.length + (groups.length === 1 ? ' worktree' : ' worktrees');
  $('cpu-total').textContent = known.length || !terminals.length ? known.reduce((sum,t) => sum+t.cpu, 0).toFixed(1) + '%' : '—';
  $('memory-total').textContent = known.length || !terminals.length ? memoryLabel(known.reduce((sum,t) => sum+(t.memory ?? 0), 0)) : '—';
  drawTrend(terminals.filter(t => Number.isFinite(t.cpu)).map(t => t.handle));
  const unknown = snapshot.groups.flatMap(g => g.terminals).filter(t => t.state === 'unknown').length;
  const notes = [...snapshot.notes];
  if (unknown) notes.push(unknown + ' unverified ' + (unknown === 1 ? 'terminal' : 'terminals') + '. Enable “Show all” to inspect.');
  $('notice').textContent = notes.join(' '); $('notice').hidden = !notes.length;
  const focused = document.activeElement;
  const maxMemory = Math.max(0, ...terminals.map(t => t.memory ?? 0));
  const fragment = document.createDocumentFragment();
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  $('groups').setAttribute('aria-label', view === 'flat' ? 'Terminals, most recent first' : 'Terminals grouped by ' + (view === 'project' ? 'project' : 'worktree') + ', most recent first');
  if (view === 'flat') {
    const list = element('div', 'flat-list');
    for (const terminal of flatTerminals(groups)) list.append(terminalCard(terminal, maxMemory, terminal.group));
    fragment.append(list);
  } else for (const group of view === 'project' ? groupByProject(groups) : groups) {
    const section = element('section', 'group');
    const heading = element('button', 'group-heading'); heading.type = 'button';
    heading.dataset.group = group.id; heading.dataset.control = 'group';
    heading.dataset.motionKey = view + ':group:' + group.id;
    const list = element('div', 'group-items'); list.id = 'group-' + encodeURIComponent(group.id);
    list.hidden = collapsed.has(group.id);
    heading.setAttribute('aria-controls', list.id); heading.setAttribute('aria-expanded', String(!list.hidden));
    heading.setAttribute('aria-label', group.name + ', ' + group.terminals.length + ' terminals');
    const appearance = worktreeAppearance(group);
    if (view === 'project' && !group.appearance?.iconName) appearance.icon = 'folder';
    const glyph = element('span', 'group-icon'); glyph.append(icon(appearance.icon));
    if (appearance.color) { glyph.style.color = appearance.color; glyph.classList.add('configured'); }
    const title = element('span', 'group-copy');
    title.append(element('span', 'group-project', view === 'project' ? group.name : group.project || 'Workspace'));
    const subtitle = view === 'project' ? group.worktrees.length + (group.worktrees.length === 1 ? ' worktree' : ' worktrees') : group.name;
    const groupName = element('span', 'group-name', subtitle);
    groupName.title = view === 'project' ? group.worktrees.map(tree => tree.name).join(' · ') : group.name + (group.branch && group.branch !== group.name ? ' · ' + group.branch : '') + ' · ' + group.path;
    title.append(groupName);
    const chevron = icon('chevron'); chevron.classList.add('group-chevron');
    heading.append(glyph, title, element('span', 'group-count', group.terminals.length), chevron);
    heading.addEventListener('click', () => {
      if (collapsed.has(group.id)) collapsed.delete(group.id); else collapsed.add(group.id);
      const hidden = collapsed.has(group.id);
      heading.setAttribute('aria-expanded', String(!hidden)); listMotion.setHidden(list, hidden);
    });
    section.append(heading, list);
    for (const terminal of group.terminals) list.append(view === 'project'
      ? terminalCard(terminal, maxMemory, terminal.group, { includeProject: false })
      : terminalCard(terminal, maxMemory));
    fragment.append(section);
  }
  $('groups').replaceChildren(fragment);
  if (focused?.dataset.handle) [...document.querySelectorAll('[data-handle]')].find(b => b.dataset.handle === focused.dataset.handle && b.dataset.control === focused.dataset.control)?.focus({ preventScroll: true });
  if (focused?.dataset.group) [...document.querySelectorAll('[data-group]')].find(b => b.dataset.group === focused.dataset.group)?.focus({ preventScroll: true });
  $('empty').hidden = groups.length > 0;
  listScroll.scrollTop = previousScroll;
  $('empty-title').textContent = $('search').value || $('scope').value === 'current' ? 'No matching terminals' : 'All quiet here';
  $('empty-detail').textContent = $('scope').value === 'current' && !context ? 'Choose a worktree in Orca to see its terminals.' : $('search').value ? 'Try another process or worktree name.' : 'Running commands appear here automatically. Enable “Show all” to see idle shells.';
  $('updated').textContent = 'Scanned ' + new Date(snapshot.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  listMotion.play($('groups'), previousItems);
}
function readContext() {
  if (contextBusy) return contextBusy;
  contextBusy = bridge.host.call('workspace.readContext', {}).then(value => { context = value; render(); }).catch(() => { context = null; render(); }).finally(() => { contextBusy = null; });
  return contextBusy;
}
function schedule() {
  clearTimeout(timer);
  if ($('live').checked && document.visibilityState !== 'hidden') timer = setTimeout(refresh, 10000);
}
async function refresh() {
  if (busy || !bridge) return;
  clearTimeout(timer); busy = true; $('refresh').disabled = true; $('groups').setAttribute('aria-busy', 'true');
  try {
    snapshot = await bridge.plugin.request('terminals.scan', undefined, { timeoutMs: 15000 });
    history = recordSample(history, snapshot); showError(''); render();
  } catch (error) {
    showError((snapshot ? 'Showing the previous scan. ' : '') + (error.message || 'Could not scan terminals.'));
    if (!snapshot) $('summary').textContent = 'Scan unavailable';
  } finally {
    busy = false; $('refresh').disabled = false; $('groups').setAttribute('aria-busy', 'false'); schedule();
  }
}
$('search').addEventListener('input', () => render({ resetScroll: true }));
$('scope').addEventListener('change', () => render({ resetScroll: true }));
$('include-idle').addEventListener('change', () => render({ resetScroll: true }));
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => {
  view = button.dataset.view;
  try { localStorage.setItem('running-terminals:view', view); } catch {}
  render({ resetScroll: true });
});
$('refresh').addEventListener('click', refresh);
$('live').addEventListener('change', () => { $('live-label').textContent = $('live').checked ? 'Live' : 'Paused'; schedule(); });
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) { event.preventDefault(); $('search').focus(); }
  if (event.key === 'Escape' && document.activeElement === $('search')) { $('search').value = ''; $('search').blur(); render(); }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') clearTimeout(timer); else if ($('live').checked) { void readContext(); void refresh(); } });
window.addEventListener('pagehide', () => {
  clearTimeout(timer);
  listLayoutObserver.disconnect();
  listMotion.dispose();
});
if (bridge) {
  bridge.on('workspace.changed', ({ context: next }) => { context = next; render(); });
  void readContext(); void refresh();
} else {
  $('summary').textContent = 'Open in Orca'; showError('Register Terminal Lens in Orca to inspect your terminals.'); $('refresh').disabled = true; $('live').disabled = true;
}
