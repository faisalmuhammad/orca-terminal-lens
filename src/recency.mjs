import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const execute = promisify(execFile);
const timestamp = value => Number.isFinite(value) && value > 0 ? value : 0;
const fields = ['lastVisitedAtByWorktreeId', 'tabsByWorktree', 'tabGroups', 'activeWorktreeId', 'activeTabId', 'activeWorkspaceExecutionHostId', 'activeGroupIdByWorktree'];

export function dataDirectory(env = process.env, platform = process.platform) {
  const scratch = env.ORCA_CHAT_SCRATCH_DIR;
  if (scratch && /^[a-f0-9]{32}$/.test(path.basename(scratch))) return path.dirname(path.dirname(scratch));
  return path.join(platform === 'darwin' ? path.join(homedir(), 'Library', 'Application Support') : (env.XDG_CONFIG_HOME || path.join(homedir(), '.config')), 'orca');
}

// Read only navigation metadata; never modify native state or retrieve chat/terminal content.
export async function readNativeRecency({ run = execute, directory = dataDirectory() } = {}) {
  const index = JSON.parse(await readFile(path.join(directory, 'orca-profile-index.json'), 'utf8'));
  if (typeof index.activeProfileId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(index.activeProfileId)) throw new Error('Unknown Orca profile.');
  const database = path.join(directory, 'profiles', index.activeProfileId, 'profile-state.db');
  const query = async sql => {
    const { stdout } = await run('/usr/bin/sqlite3', ['-readonly', '-json', database, sql], { timeout: 2000, maxBuffer: 2 * 1024 * 1024 });
    return stdout.trim() ? JSON.parse(stdout) : [];
  };
  const tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('profile_state_document_parts_meta','profile_state_documents');");
  const hasParts = tables.some(t => t.name === 'profile_state_document_parts_meta');
  const meta = hasParts ? await query("SELECT domain_version FROM profile_state_document_parts_meta WHERE domain='workspaceSession';") : [];
  if (meta.length) {
    if (meta[0].domain_version !== 1) throw new Error('Unsupported Orca navigation schema.');
    const rows = await query(`SELECT part_key, CASE json_extract(part_key, '$[0]')
      WHEN 'tabsByWorktree' THEN (SELECT json_group_array(json_object('id', json_extract(value, '$.id'), 'createdAt', json_extract(value, '$.createdAt'))) FROM json_each(payload))
      WHEN 'tabGroups' THEN (SELECT json_group_array(json_object('id', json_extract(value, '$.id'), 'activeTabId', json_extract(value, '$.activeTabId'), 'recentTabIds', json(json_extract(value, '$.recentTabIds')))) FROM json_each(payload))
      ELSE payload END AS payload FROM profile_state_document_parts
      WHERE domain='workspaceSession' AND json_extract(part_key, '$[0]') IN (${fields.map(f => "'" + f + "'").join(',')}) LIMIT 5000;`);
    return navigationFromParts(rows);
  }
  // Older profiles stored a single document: select just these navigation fields.
  const rows = await query(`SELECT ${fields.map(f => `json_extract(payload, '$.${f}') AS ${f}`).join(',')} FROM profile_state_documents WHERE domain='workspaceSession' AND domain_version=1;`);
  if (!rows.length) throw new Error('Orca navigation metadata is unavailable.');
  const parts = [];
  for (const field of fields) {
    let value = rows[0][field];
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) value = JSON.parse(value);
    if (field.endsWith('ByWorktree') || field === 'tabsByWorktree' || field === 'tabGroups' || field === 'lastVisitedAtByWorktreeId') {
      for (const [key, item] of Object.entries(value || {})) parts.push({ part_key: JSON.stringify([field, key]), payload: JSON.stringify(item) });
    } else parts.push({ part_key: JSON.stringify([field]), payload: JSON.stringify(value) });
  }
  return navigationFromParts(parts);
}

export function navigationFromParts(rows) {
  const navigation = { visits: {}, tabs: {}, groups: {}, activeGroups: {}, activeWorktreeId: null, activeTabId: null, activeHost: null };
  for (const row of rows.slice(0, 5000)) {
    const [field, key] = JSON.parse(row.part_key), value = JSON.parse(row.payload);
    if (field === 'lastVisitedAtByWorktreeId' && key?.startsWith('local|')) navigation.visits[key.slice(6)] = timestamp(value);
    else if (field === 'tabsByWorktree' && Array.isArray(value)) navigation.tabs[key] = value.slice(0, 1000).map(t => ({ id: t.id, createdAt: timestamp(t.createdAt) }));
    else if (field === 'tabGroups' && Array.isArray(value)) navigation.groups[key] = value.slice(0, 100).map(g => ({ id: g.id, activeTabId: g.activeTabId, recentTabIds: Array.isArray(g.recentTabIds) ? g.recentTabIds.filter(id => typeof id === 'string').slice(-1000) : [] }));
    else if (field === 'activeGroupIdByWorktree' && typeof value === 'string') navigation.activeGroups[key] = value;
    else if (field === 'activeWorktreeId') navigation.activeWorktreeId = value;
    else if (field === 'activeTabId') navigation.activeTabId = value;
    else if (field === 'activeWorkspaceExecutionHostId') navigation.activeHost = value;
  }
  return navigation;
}

export function createRecencyTracker() {
  const accesses = new Map(), groupAccesses = new Map(), initialVisits = new Map();
  let seen = new Set(), initialized = false, selection = null, previousVisits = {};
  const key = (group, terminal) => group.id + '\0' + terminal.terminalId;
  const mark = (group, terminal, at) => { accesses.set(key(group, terminal), at); groupAccesses.set(group.id, at); };
  return {
    opened(snapshot, handle, at = Date.now()) {
      for (const group of snapshot.groups) {
        const terminal = group.terminals.find(t => t.handle === handle);
        if (terminal) { mark(group, terminal, at); terminal.accessAt = at; group.lastAccessAt = at; }
      }
    },
    apply(snapshot, terminalList, navigation, at = Date.now()) {
      const current = new Set();
      const active = activePane(terminalList.visualLayouts, navigation);
      for (const group of snapshot.groups) {
        const visitedAt = timestamp(navigation?.visits[group.id]);
        if (!initialVisits.get(group.id)) initialVisits.set(group.id, visitedAt);
        const tabGroups = navigation?.groups[group.id] || [];
        for (const terminal of group.terminals) {
          const id = key(group, terminal); current.add(id);
          if (initialized && !seen.has(id)) mark(group, terminal, at);
          if (active === terminal.handle && initialized && (active !== selection || visitedAt > (previousVisits[group.id] || 0))) mark(group, terminal, at);
          const tabGroup = tabGroups.find(g => g.recentTabIds.includes(terminal.tabId));
          // Orca's recentTabIds are oldest first. Ranks are ordinal, never fake timestamps.
          terminal.tabRank = tabGroup ? tabGroup.recentTabIds.indexOf(terminal.tabId) + 1 : 0;
          terminal.createdAt = navigation?.tabs[group.id]?.find(t => t.id === terminal.tabId)?.createdAt || 0;
          terminal.accessAt = accesses.get(id) || 0;
          terminal.worktreeVisitedAt = initialVisits.get(group.id);
        }
        group.lastAccessAt = Math.max(visitedAt, groupAccesses.get(group.id) || 0, ...group.terminals.map(t => Math.max(t.accessAt, t.createdAt)));
      }
      for (const id of accesses.keys()) if (!current.has(id)) accesses.delete(id);
      for (const id of groupAccesses.keys()) if (!snapshot.groups.some(g => g.id === id)) groupAccesses.delete(id);
      for (const id of initialVisits.keys()) if (!snapshot.groups.some(g => g.id === id)) initialVisits.delete(id);
      seen = current; initialized = true; selection = active; previousVisits = { ...navigation?.visits };
      return snapshot;
    }
  };
}

function activePane(layouts, navigation) {
  if (!navigation || navigation.activeHost !== 'local') return null;
  const layout = layouts?.find(l => l.worktreeId === navigation.activeWorktreeId);
  let handle = null;
  function walk(node) {
    if (!node) return;
    if (node.type === 'group') {
      if (navigation.activeGroups[layout.worktreeId] && node.groupId !== navigation.activeGroups[layout.worktreeId]) return;
      const tab = node.tabs?.find(t => t.tabId === navigation.activeTabId);
      const findLeaf = pane => {
        if (pane?.type === 'terminal' && pane.leafId === tab.activeLeafId) handle = pane.handle;
        else if (pane?.type === 'split') { findLeaf(pane.first); findLeaf(pane.second); }
      };
      if (tab) findLeaf(tab.panes);
    } else if (node.type === 'split') { walk(node.first); walk(node.second); }
  }
  walk(layout?.root); return handle;
}
