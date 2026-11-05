import * as THREE from 'three';
import { LEVEL_SCHEMA, defaultsFor } from '../src/levelcfg.js';
import DEFAULTS from '../src/levels.json';

/* ---------- constants and helpers ---------- */
const FISH_CAP = 40, TUBE_INIT = 40, SPECIES_MAX = 29, CATCHABLE = 27, HISTORY_KEEP = 10;
const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setP = (o, p, v) => { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach(k => { if (a[k] == null || typeof a[k] !== 'object') a[k] = /^\d+$/.test(ks[ks.indexOf(k) + 1]) ? [] : {}; a = a[k]; }); a[ks[ks.length - 1]] = v; };
const DIFF = ['Easy', 'Medium', 'Hard'], STATUS = ['Draft', 'Ready', 'Retired'], CATS = ['Tutorial', 'Normal', 'Bounty', 'Boss'], BOUNTY = ['tiny', 'camo', 'fast'];
const REF_BY_DIFF = { Easy: 3, Medium: 8, Hard: 13 };

/* ---------- storage ---------- */
const sortLv = a => a.slice().sort((x, y) => String(x.id).localeCompare(String(y.id), undefined, { numeric: true }));
class BrowserStorage {
  constructor() { this.label = 'Browser storage'; this.d = { levels: {}, history: {}, collections: {} }; try { Object.assign(this.d, JSON.parse(lsGet('saf_editor_v1', '{}'))); } catch (e) { } }
  _w() { lsSet('saf_editor_v1', JSON.stringify(this.d)); }
  async loadAll() { return { levels: sortLv(Object.values(this.d.levels)), collections: Object.values(this.d.collections) }; }
  async saveLevel(lv) { this.d.levels[lv.id] = clone(lv); const h = this.d.history[lv.id] || (this.d.history[lv.id] = []); h.push({ t: Date.now(), lv: clone(lv) }); while (h.length > HISTORY_KEEP) h.shift(); this._w(); }
  async deleteLevel(id) { delete this.d.levels[id]; this._w(); }
  async saveCollection(c) { this.d.collections[c.id] = clone(c); this._w(); }
  async deleteCollection(id) { delete this.d.collections[id]; this._w(); }
}
class FolderStorage {
  constructor(h) { this.h = h; this.label = 'Folder: ' + h.name; }
  async dir(path, create) { let d = this.h; for (const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create }); return d; }
  async readAll(path) {
    const out = []; let d; try { d = await this.dir(path, false); } catch (e) { return out; }
    for await (const [n, h] of d.entries()) if (h.kind === 'file' && n.endsWith('.json')) { try { out.push(JSON.parse(await (await h.getFile()).text())); } catch (e) { } }
    return out;
  }
  async write(path, name, text) { const d = await this.dir(path, true), f = await d.getFileHandle(name, { create: true }), w = await f.createWritable(); await w.write(text); await w.close(); }
  async loadAll() { return { levels: sortLv(await this.readAll('levels')), collections: await this.readAll('collections') }; }
  async saveLevel(lv) {
    await this.write('levels', lv.id + '.json', JSON.stringify(lv, null, 2));
    await this.write('history/' + lv.id, new Date().toISOString().replace(/[:.]/g, '-') + '.json', JSON.stringify(lv, null, 2));
    const d = await this.dir('history/' + lv.id, true), names = []; for await (const [n] of d.entries()) names.push(n);
    names.sort(); while (names.length > HISTORY_KEEP) await d.removeEntry(names.shift());
  }
  async deleteLevel(id) { const d = await this.dir('levels', true); try { await d.removeEntry(id + '.json'); } catch (e) { } }
  async saveCollection(c) { await this.write('collections', c.id + '.json', JSON.stringify(c, null, 2)); }
  async deleteCollection(id) { const d = await this.dir('collections', true); try { await d.removeEntry(id + '.json'); } catch (e) { } }
}
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('saf-editor', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbGet = async k => { try { const db = await idb(); return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } };
const idbPut = async (k, v) => { try { const db = await idb(); await new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch (e) { } };

/* ---------- state ---------- */
const S = { store: null, levels: [], cols: [], cur: null, curCol: null, dirty: false, undo: [], redo: [], tab: 'ed', seed: '', pending: null, dlgSel: new Set(), dlgQ: '' };
const level = () => S.levels.find(l => l.id === S.cur) || null;
const status = (m, bad) => { const el = $('status'); el.textContent = m; el.className = 'status' + (bad ? ' bad' : ''); };

function newLevelJson(id) {
  const lv = clone(DEFAULTS[0]); lv.id = id; lv.name = 'New level'; lv.status = 'Draft'; lv.refLevel = 1; return lv;
}
function freeId(base) { let n = 1, id = base; const has = i => S.levels.some(l => l.id === i); if (!has(id)) return id; while (has(base + '_' + (++n))); return base + '_' + n; }
function nextId() { let n = 1; while (S.levels.some(l => l.id === 'L' + String(n).padStart(2, '0'))) n++; return 'L' + String(n).padStart(2, '0'); }

/* ---------- validation and stats ---------- */
function stats(lv) {
  const goal = lv.goal | 0, per = lv.per | 0, hasB = Array.isArray(lv.bounty) && lv.bounty.length > 0, tube = !!(lv.tube && lv.tube.enabled);
  const tf = Math.max(0, goal * per - (hasB ? per - 1 : 0) + (hasB && lv.bounty[0] === 'camo' ? 8 : 0)), decoy = lv.decoyFish | 0;
  const extraT = lv.tube && typeof lv.tube.extraFish === 'number' ? lv.tube.extraFish : null;
  const extra = tube ? (extraT != null ? Math.max(0, decoy - extraT) : Math.max(0, Math.min(decoy, TUBE_INIT - tf))) : Math.max(0, Math.min(decoy, FISH_CAP - tf));
  return { tf, decoy, start: tf + extra, pumped: tube ? Math.max(0, decoy - extra) : 0, tube, total: tf + decoy };
}
function checks(lv) {
  const w = [], s = stats(lv), num = v => typeof v === 'number' && isFinite(v);
  if (!lv.id) w.push('Id is missing'); if (!lv.name) w.push('Name is missing');
  if (lv.id && S.levels.filter(l => l.id === lv.id).length > 1) w.push('Duplicate id: ' + lv.id);
  if (!num(lv.goal) || lv.goal < 1) w.push('Target tanks must be at least 1');
  if (![1, 2, 3].includes(lv.per)) w.push('Fish per tank must be 1, 2 or 3');
  if (!s.tube && s.total > FISH_CAP) w.push(`Total fish ${s.total} is above the limit ${FISH_CAP}; extra decoys are dropped in game`);
  if (s.tube && s.start > TUBE_INIT) w.push(`Start fish ${s.start} is above the tube-level limit ${TUBE_INIT}`);
  if (num(lv.species) && lv.species < lv.goal * 2) w.push(`Species ${lv.species} is less than 2 x target tanks (${lv.goal * 2})`);
  if (num(lv.species) && lv.species > SPECIES_MAX) w.push(`Species ${lv.species} is more than the ${SPECIES_MAX} available`);
  if (lv.goal > CATCHABLE) w.push(`Target tanks ${lv.goal} is more than the ${CATCHABLE} catchable species`);
  const waves = (lv.tube && lv.tube.waves) || [];
  waves.forEach((v, i) => { if (v.afterTanks > lv.goal) w.push(`Wave ${i + 1}: after ${v.afterTanks} tanks, but the level has only ${lv.goal}`); });
  if (waves.length && !s.tube) w.push('Waves are set but the tube is off');
  if ((lv.bounty || []).length && lv.goal < 2) w.push('Bounty tank needs at least 2 normal tanks first');
  if ((lv.bounty || []).length > 1) w.push('More than one bounty tank: the game uses only the first one for now');
  return w;
}

/* ---------- editing, undo ---------- */
function edit(fn, structural) {
  const lv = level(); if (!lv) return;
  S.undo.push(clone(lv)); if (S.undo.length > 60) S.undo.shift(); S.redo = [];
  fn(lv); S.dirty = true; structural ? renderAll() : renderLight();
}
function restore(snap) { const i = S.levels.findIndex(l => l.id === S.cur); if (i < 0) return; S.levels[i] = snap; S.cur = snap.id; S.dirty = true; renderAll(); }
$('bUndo').onclick = () => { const lv = level(); if (!lv || !S.undo.length) return; S.redo.push(clone(lv)); restore(S.undo.pop()); };
$('bRedo').onclick = () => { const lv = level(); if (!lv || !S.redo.length) return; S.undo.push(clone(lv)); restore(S.redo.pop()); };
async function save() {
  const lv = level(); if (!lv || !S.store) return;
  try { await S.store.saveLevel(lv); S.dirty = false; status(`Saved ${lv.id} (${S.store.label})`); } catch (e) { status('Save failed: ' + e.message, true); }
  renderLight();
}
$('bSave').onclick = save;
addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } });

/* ---------- field helpers ---------- */
const val = (lv, p) => getP(lv, p);
function num(label, p, lv, o = {}) { const v = val(lv, p); return `<label class="f"><small>${esc(label)}</small><input type="number" data-k="${p}" data-t="${o.t || 'num'}" value="${v ?? ''}" ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''} step="${o.step || 1}" ${o.ph ? `placeholder="${o.ph}"` : ''}></label>`; }
function sel(label, p, lv, opts, o = {}) { const v = val(lv, p); return `<label class="f"><small>${esc(label)}</small><select data-k="${p}" data-t="${o.t || 'str'}">${opts.map(x => { const [k, t] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(k)}" ${String(v ?? '') === String(k) ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select></label>`; }
function tog(label, p, lv) { return `<label class="f"><small>${esc(label)}</small><input type="checkbox" data-k="${p}" data-t="bool" ${val(lv, p) ? 'checked' : ''}></label>`; }
function txt(label, p, lv) { return `<label class="f"><small>${esc(label)}</small><input type="text" data-k="${p}" data-t="str" value="${esc(val(lv, p))}"></label>`; }
function pair(label, p, lv) { const v = val(lv, p) || ['', '']; return `<div class="f pair"><small>${esc(label)} (s)</small><input type="number" data-k="${p}.0" data-t="num" value="${v[0]}" min="0"><input type="number" data-k="${p}.1" data-t="num" value="${v[1]}" min="0"></div>`; }
const parseV = (el) => { const t = el.dataset.t; if (t === 'bool') return el.checked; if (t === 'str') return el.value; if (el.value === '') return t === 'optnum' ? null : 0; const n = Number(el.value); return isFinite(n) ? n : 0; };

/* ---------- left panel (levels / collections) ---------- */
function renderLeft() {
  const el = $('cL'); let h = '';
  if (!S.store) { el.innerHTML = '<h3>Levels</h3><p class="mu">Choose where levels are stored.</p>'; return; }
  if (S.tab === 'ed') {
    h += '<h3>Levels</h3>';
    if (!S.levels.length) h += '<p class="mu">No levels yet.</p><button class="pr" id="bBuiltin">Add the 15 built-in levels</button>';
    h += S.levels.map(l => `<div class="row ${l.id === S.cur ? 'on' : ''}" data-id="${esc(l.id)}"><b>${esc(l.id)}</b> ${esc(l.name)}${l.id === S.cur && S.dirty ? ' *' : ''}<br><span class="mu sm">${l.goal} x ${l.per} · ${esc(l.difficulty || '')} · ${esc(l.status || '')}</span></div>`).join('');
    h += '<div class="bar"><button id="bNew">New</button><button id="bDup">Duplicate</button><button id="bImp">Import</button><button id="bDel">Delete</button></div><input type="file" id="fImp" accept=".json,application/json" multiple class="hide">';
    if (S.levels.length) h += '<div class="bar"><button id="bBuiltin2" class="sm">Add missing built-in levels</button></div>';
  } else {
    h += '<h3>Collections</h3>';
    if (!S.cols.length) h += '<p class="mu">No collections yet.</p>';
    h += S.cols.map(c => `<div class="row ${c.id === S.curCol ? 'on' : ''}" data-cid="${esc(c.id)}">${esc(c.name)}<br><span class="mu sm">${c.levels.length} levels</span></div>`).join('');
    h += '<div class="bar"><button id="bNewCol">New collection</button><button id="bDelCol">Delete</button></div>';
  }
  el.innerHTML = h;
}

/* ---------- center and right panels (Editor tab) ---------- */
function renderCenter() {
  const el = $('cC'), lv = level();
  if (!S.store) { el.innerHTML = `<div class="sec"><h3 class="t">Where should levels be saved?</h3>
    <p class="mu">Folder access works in Chrome and Edge. Browser storage is only for trying things out and stays in this browser.</p>
    <div class="bar"><button class="pr" id="bFolder" ${window.showDirectoryPicker ? '' : 'disabled title="Chrome or Edge only"'}>Choose levels folder</button><button id="bBrowser">Use browser storage</button>${S.pending ? '<button id="bReconn">Reconnect ' + esc(S.pending.name) + '</button>' : ''}</div></div>`; return; }
  if (!lv) { el.innerHTML = '<p class="mu">Select or create a level.</p>'; return; }
  const st = stats(lv);
  el.innerHTML = `<div class="sec"><h3 class="t">Level details</h3><div class="grid">
    ${txt('Name', 'name', lv)}${txt('Id', 'id', lv)}${sel('Status', 'status', lv, STATUS)}${sel('Difficulty', 'difficulty', lv, DIFF)}${sel('Category', 'category', lv, CATS)}${num('Reference level (1-15)', 'refLevel', lv, { min: 1, max: 15 })}</div></div>
   <div class="sec"><h3 class="t">Generator</h3><div class="grid">
    ${num('Target tanks', 'goal', lv, { min: 1, max: 30 })}${sel('Fish per tank', 'per', lv, [[1, '1 fish'], [2, '2 fish'], [3, '3 fish']], { t: 'num' })}
    <label class="f"><small>Seed for Play (optional)</small><input type="text" id="seed" placeholder="empty = random" value="${esc(S.seed)}"></label>
    <div style="display:flex;align-items:center"><button class="pr" id="bAuto" title="Fills species, decoys, obstacles and tube from the built-in rules (placeholder rule)">Auto-fill</button></div></div></div>
   <div class="sec"><h3 class="t">Fish and tanks</h3><div class="grid">
    ${num('Species', 'species', lv, { min: 1, max: 40 })}${num('Decoy fish', 'decoyFish', lv, { min: 0, max: 200 })}${sel('Look-alike level', 'look', lv, [[0, '0 none'], [1, '1 some'], [2, '2 close']], { t: 'num' })}
    ${num('Fish size', 'sizeK', lv, { min: 0.5, max: 3, step: 0.05 })}${num('Fish speed', 'speedK', lv, { min: 0.3, max: 3, step: 0.05 })}
    <div class="f"><small>Bounty tanks (x1)</small>${(lv.bounty || []).map((b, i) => `<span>${esc(b)} <a href="#" data-rmb="${i}" class="mu">remove</a></span>`).join(', ') || '<span class="mu">none</span>'}
     <select id="addB"><option value="">+ add bounty</option>${BOUNTY.map(b => `<option>${b}</option>`).join('')}</select></div></div></div>
   <div class="sec"><h3 class="t">Preview <span class="mu sm">3D sketch, drag to rotate. Fish positions are random in game.</span></h3><canvas id="cv"></canvas>
    <p class="mu sm" id="pvInfo">Start fish ${st.start} · tube ${st.pumped} · target fish ${st.tf} · decoys ${st.decoy}</p></div>`;
  drawPreview();
}
function renderRight() {
  const el = $('cR'), lv = level(); if (!S.store || !lv) { el.innerHTML = ''; return; }
  const t = lv.tube || {}, waves = t.waves || [];
  el.innerHTML = `<div class="sec"><h3 class="t">Obstacles</h3><div class="grid">${num('Urchin', 'urchin', lv, { min: 0, max: 20 })}${num('Jelly', 'jelly', lv, { min: 0, max: 20 })}${num('Squid', 'squid', lv, { min: 0, max: 5 })}${num('Clam', 'clam', lv, { min: 0, max: 5 })}${tog('Swarm', 'swarm', lv)}</div></div>
   <div class="sec"><h3 class="t">Pump tube</h3><div class="grid">${tog('Tube on', 'tube.enabled', lv)}${num('Extra fish (empty = auto)', 'tube.extraFish', lv, { t: 'optnum', min: 0, max: 200, ph: 'auto' })}${tog('Auto-pump when stuck', 'tube.autoPumpWhenStuck', lv)}${num('Stuck delay (s)', 'tube.stuckDelaySec', lv, { min: 0.5, max: 20, step: 0.5 })}</div>
    <h3 style="margin-top:8px">Waves ${waves.length ? '' : '(empty = random, like the built-in levels)'}</h3>
    ${waves.map((w, i) => `<div class="grid" style="margin-bottom:4px">${num('Wave ' + (i + 1) + ' after tanks', `tube.waves.${i}.afterTanks`, lv, { min: 1, max: 30 })}<div class="f"><small>Hold last fish</small><input type="checkbox" data-k="tube.waves.${i}.holdLast" data-t="bool" ${w.holdLast !== false ? 'checked' : ''}> <a href="#" data-rmw="${i}" class="mu">remove</a></div></div>`).join('')}
    <button id="bAddW">Add wave</button></div>
   <details class="sec"><summary>Boosters, events, theme</summary><div class="grid">${tog('Backup', 'backup', lv)}${tog('Hint', 'hint', lv)}${tog('Clear Backup', 'clear', lv)}${tog('Feeding', 'feed', lv)}${tog('Startle', 'startle', lv)}
    ${sel('Theme', 'theme', lv, [['', 'Auto'], [0, '1'], [1, '2'], [2, '3'], [3, '4'], [4, '5']], { t: 'optnum' })}</div>
    <div class="grid" style="margin-top:6px">${pair('Event gap', 'eventGap', lv)}${pair('Feed gap', 'feedGap', lv)}${pair('Swarm gap', 'swarmGap', lv)}${pair('Startle gap', 'startleGap', lv)}</div></details>
   <div class="sec" id="chk"></div>
   <div class="sec"><h3 class="t">Simulation</h3><div class="tbd">Later (check level C). Win-rate estimate and what counts as "difficult" are _TBD_.</div></div>`;
  renderChecks();
}
function renderChecks() {
  const el = $('chk'), lv = level(); if (!el || !lv) return; const w = checks(lv);
  el.innerHTML = '<h3 class="t">Level checks</h3>' + (w.length ? w.map(x => `<div class="warn">${esc(x)}</div>`).join('') : '<div class="ok">No warnings</div>');
}

/* ---------- Organiser ---------- */
function renderOrganiser() {
  const c = S.cols.find(x => x.id === S.curCol), cC = $('cC'), cR = $('cR');
  if (!S.store) { cC.innerHTML = ''; cR.innerHTML = ''; return; }
  if (!c) { cC.innerHTML = '<p class="mu">Select or create a collection.</p>'; cR.innerHTML = ''; return; }
  const miss = c.levels.filter(id => !S.levels.some(l => l.id === id)).length;
  cC.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Levels in ${esc(c.name)}</h3><button class="pr" id="bAddLv">Add levels</button></div><div style="margin-top:8px" id="olist">
   ${c.levels.map((id, i) => { const l = S.levels.find(x => x.id === id); return `<div class="lv" draggable="true" data-i="${i}"><span class="hnd" title="Drag to reorder">::</span><b style="min-width:22px">${i + 1}</b><span style="flex:1">${l ? esc(l.id + ' ' + l.name) : esc(id) + ' <span class="bad">(missing)</span>'}</span><button data-mv="${i},-1" ${i ? '' : 'disabled'}>Up</button><button data-mv="${i},1" ${i < c.levels.length - 1 ? '' : 'disabled'}>Down</button><button data-rm="${i}">Remove</button></div>`; }).join('') || '<p class="mu">No levels in this collection.</p>'}</div>
   <p class="mu sm">Copy status: ${c.levels.length} levels, ${miss} missing files${S.dirty ? ' · unsaved collection' : ''}</p>`;
  cR.innerHTML = `<h3>Settings</h3>${`<label class="f"><small>Collection name</small><input type="text" id="cName" value="${esc(c.name)}"></label>`}<label class="f" style="margin-top:6px"><small>Id</small><input type="text" value="${esc(c.id)}" disabled></label>
   <label class="f" style="margin-top:6px"><small>Description</small><input type="text" id="cDesc" value="${esc(c.description || '')}" placeholder="_TBD_"></label>
   <div class="bar"><button class="pr ${S.colDirty ? 'dirty' : ''}" id="bSaveCol">Save collection</button><button id="bExport" title="Downloads the levels of this collection as one levels.json for game/src/levels.json">Export levels.json</button></div>`;
}
function openAddDlg() {
  const c = S.cols.find(x => x.id === S.curCol); if (!c) return;
  const avail = S.levels.filter(l => !c.levels.includes(l.id)), q = S.dlgQ.toLowerCase(), list = avail.filter(l => (l.name + ' ' + l.id).toLowerCase().includes(q));
  S.dlgSel = new Set([...S.dlgSel].filter(id => avail.some(l => l.id === id)));
  const m = $('mAdd');
  if (!avail.length) m.innerHTML = '<div style="display:flex;justify-content:space-between"><b>Add levels</b><button id="dX" aria-label="Close">X</button></div><p>All levels are already in this collection.</p>';
  else m.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>Add levels</b><button id="dX" aria-label="Close">X</button></div>
   <input type="text" id="dQ" placeholder="Search by level name" value="${esc(S.dlgQ)}" style="margin-bottom:6px">
   ${list.map(l => `<label class="r"><input type="checkbox" data-sel="${esc(l.id)}" ${S.dlgSel.has(l.id) ? 'checked' : ''}><span style="flex:1">${esc(l.id + ' ' + l.name)}</span><span class="mu sm">${l.goal} x ${l.per} · ${esc(l.difficulty || '')}</span></label>`).join('') || '<p class="mu">No match.</p>'}
   <div style="display:flex;align-items:center;gap:8px;margin-top:10px"><span class="mu sm" style="flex:1">${S.dlgSel.size} of ${avail.length} selected</span><button id="dAll">Add all levels</button><button class="pr" id="dSel" ${S.dlgSel.size ? '' : 'disabled'}>Add selected levels</button></div>`;
  $('ovAdd').classList.add('show');
  const q2 = $('dQ'); if (q2 && document.activeElement !== q2 && S.dlgFocus) { q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); }
}
const closeDlg = () => { $('ovAdd').classList.remove('show'); S.dlgSel = new Set(); S.dlgQ = ''; S.dlgFocus = false; };

/* ---------- preview (three.js cylinder tank) ---------- */
let pv = null;
function drawPreview() {
  const cv = $('cv'), lv = level(); if (!cv || !lv) return;
  if (!pv || pv.cv !== cv) {
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1, .1, 100);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x335566, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(3, 6, 4); sc.add(dl);
    pv = { cv, r, sc, cam, g: new THREE.Group(), yaw: .6, pitch: .35, dist: 15 }; sc.add(pv.g);
    let drag = null; cv.onpointerdown = e => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; };
    cv.onpointermove = e => { if (!drag) return; pv.yaw -= (e.clientX - drag[0]) * .01; pv.pitch = Math.max(-.2, Math.min(1.2, pv.pitch + (e.clientY - drag[1]) * .008)); drag = [e.clientX, e.clientY]; renderPv(); };
    cv.onpointerup = () => { drag = null; cv.style.cursor = 'grab'; };
    cv.onwheel = e => { e.preventDefault(); pv.dist = Math.max(8, Math.min(26, pv.dist + e.deltaY * .01)); renderPv(); };
  }
  const g = pv.g; while (g.children.length) { const o = g.children.pop(); o.traverse(n => { n.geometry && n.geometry.dispose(); n.material && n.material.dispose && n.material.dispose(); }); }
  const st = stats(lv), M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .5, ...o });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 5.2, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xbfe8fa, transparent: true, opacity: .22, side: THREE.DoubleSide })); glass.position.y = 2.6; g.add(glass);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.15, 4.3, 48), new THREE.MeshStandardMaterial({ color: 0x1a6aa0, transparent: true, opacity: .5 })); water.position.y = 2.65; g.add(water);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.6, .4, 48), M(0x20262f)); base.position.y = -.2; g.add(base);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, .06, 48), M(0x4aa6d8, { transparent: true, opacity: .8 })); top.position.y = 4.78; g.add(top);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dots = (n, c, rad) => { for (let i = 0; i < Math.min(n, 120); i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 2.6, m = new THREE.Mesh(new THREE.SphereGeometry(rad, 10, 8), M(c)); m.position.set(Math.cos(a) * r, .8 + rnd() * 3.6, Math.sin(a) * r); g.add(m); } };
  dots(st.tf, 0xf28a1f, .16); dots(st.start - st.tf, 0x4cc3c3, .13);
  dots((lv.urchin || 0) + (lv.jelly || 0) + (lv.squid || 0) + (lv.clam || 0), 0x9aa4b4, .24);
  const nt = Math.min(Math.max(1, lv.goal | 0), 8); for (let i = 0; i < nt; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .9, 24), M(0x2a6a99, { transparent: true, opacity: .85 })); c.position.set((i - (nt - 1) / 2) * 1.35, 7.2, 0); g.add(c); }
  if (lv.tube && lv.tube.enabled) { const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(4.4, 0, 0), new THREE.Vector3(4.4, 4, 0), new THREE.Vector3(4, 5.3, 0), new THREE.Vector3(2.9, 4.6, 0)]); g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .26, 10), M(0xf28a1f))); }
  renderPv();
}
function renderPv() {
  if (!pv) return; const { r, sc, cam, cv } = pv, w = cv.clientWidth || 600, h = cv.clientHeight || 300;
  r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  cam.position.set(Math.sin(pv.yaw) * Math.cos(pv.pitch) * pv.dist, 3.6 + Math.sin(pv.pitch) * pv.dist, Math.cos(pv.yaw) * Math.cos(pv.pitch) * pv.dist); cam.lookAt(0, 3.4, 0); r.render(sc, cam);
}
addEventListener('resize', () => { if (S.tab === 'ed') renderPv(); });

/* ---------- render ---------- */
function renderAll() {
  $('main').className = S.tab === 'org' ? 'org' : '';
  $('tEd').classList.toggle('on', S.tab === 'ed'); $('tOrg').classList.toggle('on', S.tab === 'org');
  $('store').textContent = S.store ? S.store.label : 'No storage chosen';
  renderLeft(); if (S.tab === 'ed') { renderCenter(); renderRight(); } else renderOrganiser();
  $('bSave').classList.toggle('dirty', S.dirty); $('bSave').disabled = !level() || S.tab !== 'ed'; $('bPlay').disabled = !level() || S.tab !== 'ed';
  $('bUndo').disabled = !S.undo.length || S.tab !== 'ed'; $('bRedo').disabled = !S.redo.length || S.tab !== 'ed';
}
function renderLight() {
  renderLeft(); const lv = level();
  if (S.tab === 'ed' && lv) { renderChecks(); const st = stats(lv); const p = $('pvInfo'); if (p) p.textContent = `Start fish ${st.start} · tube ${st.pumped} · target fish ${st.tf} · decoys ${st.decoy}`; drawPreview(); }
  $('bSave').classList.toggle('dirty', S.dirty); $('bUndo').disabled = !S.undo.length; $('bRedo').disabled = !S.redo.length;
}

/* ---------- actions ---------- */
async function loadStore(store) {
  S.store = store; const all = await store.loadAll(); S.levels = all.levels; S.cols = all.collections; S.cur = S.levels[0] ? S.levels[0].id : null; S.curCol = S.cols[0] ? S.cols[0].id : null; S.dirty = false; S.undo = []; S.redo = [];
  status(`${store.label}: ${S.levels.length} levels, ${S.cols.length} collections`); renderAll();
}
async function addLevel(lv) { S.levels = sortLv(S.levels.concat(lv)); S.cur = lv.id; S.undo = []; S.redo = []; try { await S.store.saveLevel(lv); S.dirty = false; } catch (e) { status('Save failed: ' + e.message, true); } renderAll(); }
async function addBuiltins() { let n = 0; for (const d of DEFAULTS) { if (!S.levels.some(l => l.id === d.id)) { const lv = clone(d); S.levels.push(lv); await S.store.saveLevel(lv); n++; } } S.levels = sortLv(S.levels); S.cur = S.cur || (S.levels[0] && S.levels[0].id); status(`Added ${n} built-in levels`); renderAll(); }
function autoFill() {
  edit(lv => {
    const ref = REF_BY_DIFF[lv.difficulty] || 8, C = defaultsFor(ref), goal = Math.max(1, lv.goal | 0);
    Object.assign(lv, { refLevel: ref, species: goal * 2, decoyFish: Math.max(6, Math.round(4 + goal * goal * 0.75)), look: C.look, sizeK: C.sizeK, speedK: C.speedK, urchin: C.urchin, jelly: C.jelly, squid: C.squid, clam: C.clams, swarm: !!C.swarm,
      backup: C.backup, hint: C.hint, clear: C.clear, feed: !!C.feed, startle: !!C.startle, eventGap: C.evGap, feedGap: C.feedGap, swarmGap: C.swarmGap, startleGap: C.startleGap });
    lv.tube = { enabled: !!C.tube, autoPumpWhenStuck: true, stuckDelaySec: 2.5 };
  }, true);
  status('Auto-fill used the built-in rules (placeholder). Edit any field by hand.');
}
async function importFiles(files) {
  let n = 0, bad = 0;
  for (const f of files) {
    try {
      const j = JSON.parse(await f.text()), arr = Array.isArray(j) ? j : [j];
      for (const o of arr) { if (!o || o.schema !== LEVEL_SCHEMA || !o.id) { bad++; continue; } const lv = clone(o); lv.id = freeId(lv.id); S.levels.push(lv); await S.store.saveLevel(lv); S.cur = lv.id; n++; }
    } catch (e) { bad++; }
  }
  S.levels = sortLv(S.levels); status(`Imported ${n} levels${bad ? `, skipped ${bad} invalid` : ''}`, !!bad && !n); renderAll();
}
async function saveCol() { const c = S.cols.find(x => x.id === S.curCol); if (!c) return; try { await S.store.saveCollection(c); S.colDirty = false; status('Saved collection ' + c.name); } catch (e) { status('Save failed: ' + e.message, true); } renderAll(); }

/* ---------- Play test ---------- */
const demoUrl = () => (location.pathname.includes('/editor/') ? '../demo/index.html' : '../index.html') + '?playtest=1';
function postPlay() { const lv = level(), f = $('pFrame'); if (!lv || !f.contentWindow) return; f.contentWindow.postMessage({ type: 'ff-play', level: clone(lv), seed: $('pSeed').value }, '*'); $('pInfo').textContent = `Playing ${lv.id} ${lv.name} · progress and stars are not saved`; }
addEventListener('message', e => { if (e.data && e.data.type === 'ff-ready' && $('play').classList.contains('show')) postPlay(); });
$('bPlay').onclick = () => { if (!level()) return; $('pSeed').value = S.seed; $('play').classList.add('show'); $('pFrame').src = demoUrl(); };
$('pRestart').onclick = postPlay;
$('pBack').onclick = () => { S.seed = $('pSeed').value; $('play').classList.remove('show'); $('pFrame').src = 'about:blank'; renderAll(); };

/* ---------- events ---------- */
const root = document.body;
root.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'seed') { S.seed = el.value; return; }
  if (el.id === 'fImp') { importFiles([...el.files]); el.value = ''; return; }
  if (el.id === 'addB') { if (el.value) edit(lv => { (lv.bounty = lv.bounty || []).push(el.value); }, true); return; }
  if (el.id === 'cName' || el.id === 'cDesc') { const c = S.cols.find(x => x.id === S.curCol); if (c) { if (el.id === 'cName') c.name = el.value || c.name; else c.description = el.value; S.colDirty = true; renderLeft(); } return; }
  if (el.dataset.sel) { el.checked ? S.dlgSel.add(el.dataset.sel) : S.dlgSel.delete(el.dataset.sel); openAddDlg(); return; }
  if (!el.dataset.k) return;
  const k = el.dataset.k; let v = parseV(el);
  if (el.dataset.t === 'optnum' && (el.value === '' || v === null)) v = null;
  if (k === 'id') { v = String(v).trim(); if (!v) return; }
  const oldId = S.cur;
  edit(lv => {
    if (k === 'id' && v !== lv.id) { v = S.levels.some(l => l !== lv && l.id === v) ? freeId(v) : v; S.renameFrom = lv.id; }
    if (v === null && k.startsWith('tube.extraFish')) delete lv.tube.extraFish; else if (v === null && k === 'theme') delete lv.theme; else setP(lv, k, v);
    if (k === 'id') S.cur = lv.id;
  }, k === 'id' || k === 'difficulty' || k === 'goal' || k === 'per' || k.startsWith('tube.waves') && false);
  if (k === 'id' && oldId !== S.cur && S.renameFrom) { const from = S.renameFrom; S.renameFrom = null; S.store.deleteLevel(from).then(() => S.store.saveLevel(level())).then(() => { S.cols.forEach(c => { c.levels = c.levels.map(x => x === from ? S.cur : x); S.store.saveCollection(c); }); S.dirty = false; renderAll(); status(`Renamed ${from} to ${S.cur}`); }); }
});
root.addEventListener('input', e => { if (e.target.id === 'dQ') { S.dlgQ = e.target.value; S.dlgFocus = true; openAddDlg(); } });
root.addEventListener('click', async e => {
  const t = e.target, id = t.id, c = t.closest('[data-id],[data-cid],[data-mv],[data-rm],[data-rmb],[data-rmw]');
  if (id === 'tEd' || id === 'tOrg') { S.tab = id === 'tEd' ? 'ed' : 'org'; if (S.tab === 'org' && S.store && !S.cols.length) { /* none yet */ } renderAll(); return; }
  if (id === 'bTheme') { const th = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = th; lsSet('saf_theme', th); return; }
  if (id === 'bFolder') { try { const h = await showDirectoryPicker({ mode: 'readwrite' }); await idbPut('dir', h); lsSet('saf_mode', 'folder'); await loadStore(new FolderStorage(h)); } catch (err) { if (err.name !== 'AbortError') status('Could not open folder: ' + err.message, true); } return; }
  if (id === 'bBrowser') { lsSet('saf_mode', 'browser'); await loadStore(new BrowserStorage()); return; }
  if (id === 'bReconn') { try { if ((await S.pending.requestPermission({ mode: 'readwrite' })) === 'granted') await loadStore(new FolderStorage(S.pending)); } catch (err) { status('Reconnect failed: ' + err.message, true); } return; }
  if (id === 'bBuiltin' || id === 'bBuiltin2') { await addBuiltins(); return; }
  if (id === 'bNew') { await addLevel(newLevelJson(nextId())); return; }
  if (id === 'bDup') { const lv = level(); if (lv) { const d = clone(lv); d.id = freeId(lv.id + '_copy'); d.name = lv.name + ' copy'; d.status = 'Draft'; await addLevel(d); } return; }
  if (id === 'bImp') { $('fImp').click(); return; }
  if (id === 'bDel') { const lv = level(); if (lv && confirm(`Delete level ${lv.id} ${lv.name}? Its history is kept in the folder.`)) { await S.store.deleteLevel(lv.id); S.levels = S.levels.filter(l => l !== lv); S.cols.forEach(cc => { cc.levels = cc.levels.filter(x => x !== lv.id); }); S.cur = S.levels[0] ? S.levels[0].id : null; S.dirty = false; S.undo = []; S.redo = []; renderAll(); status('Deleted ' + lv.id); } return; }
  if (id === 'bAuto') { autoFill(); return; }
  if (id === 'bAddW') { edit(lv => { lv.tube = lv.tube || {}; (lv.tube.waves = lv.tube.waves || []).push({ afterTanks: Math.max(1, Math.min(lv.goal - 1, 2 + (lv.tube.waves.length) * 2)), holdLast: true }); }, true); return; }
  if (id === 'bNewCol') { const name = prompt('Collection name', 'Main'); if (name) { const cid = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection'); const col = { schema: 'spot-a-fish-collection', version: 1, id: S.cols.some(x => x.id === cid) ? cid + '-' + (S.cols.length + 1) : cid, name, description: '', levels: [] }; S.cols.push(col); S.curCol = col.id; await S.store.saveCollection(col); renderAll(); } return; }
  if (id === 'bDelCol') { const col = S.cols.find(x => x.id === S.curCol); if (col && confirm('Delete collection ' + col.name + '? Levels are not deleted.')) { await S.store.deleteCollection(col.id); S.cols = S.cols.filter(x => x !== col); S.curCol = S.cols[0] ? S.cols[0].id : null; renderAll(); } return; }
  if (id === 'bAddLv') { S.dlgFocus = false; openAddDlg(); return; }
  if (id === 'bSaveCol') { await saveCol(); return; }
  if (id === 'bExport') { const col = S.cols.find(x => x.id === S.curCol); if (col) { const arr = col.levels.map(i => S.levels.find(l => l.id === i)).filter(Boolean), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' })); a.download = 'levels.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); status(`Exported ${arr.length} levels. Put the file at game/src/levels.json and rebuild the game.`); } return; }
  if (id === 'dX' || t === $('ovAdd')) { closeDlg(); return; }
  const colObj = S.cols.find(x => x.id === S.curCol);
  if (id === 'dAll' && colObj) { const q = S.dlgQ; const avail = S.levels.filter(l => !colObj.levels.includes(l.id)); avail.forEach(l => colObj.levels.push(l.id)); closeDlg(); S.colDirty = true; renderAll(); return; }
  if (id === 'dSel' && colObj) { S.levels.filter(l => S.dlgSel.has(l.id) && !colObj.levels.includes(l.id)).forEach(l => colObj.levels.push(l.id)); closeDlg(); S.colDirty = true; renderAll(); return; }
  if (!c) return;
  if (c.dataset.id) { if (S.dirty && !confirm('Discard unsaved changes to ' + S.cur + '?')) return; if (S.dirty) { const o = await S.store.loadAll(); S.levels = o.levels; } S.cur = c.dataset.id; S.dirty = false; S.undo = []; S.redo = []; renderAll(); }
  else if (c.dataset.cid) { S.curCol = c.dataset.cid; S.colDirty = false; renderAll(); }
  else if (c.dataset.rmb !== undefined) { e.preventDefault(); edit(lv => { lv.bounty.splice(+c.dataset.rmb, 1); }, true); }
  else if (c.dataset.rmw !== undefined) { e.preventDefault(); edit(lv => { lv.tube.waves.splice(+c.dataset.rmw, 1); }, true); }
  else if (c.dataset.mv && colObj) { const [i, d] = c.dataset.mv.split(',').map(Number), a = colObj.levels, j = i + d; if (j >= 0 && j < a.length) { [a[i], a[j]] = [a[j], a[i]]; S.colDirty = true; renderAll(); } }
  else if (c.dataset.rm && colObj) { colObj.levels.splice(+c.dataset.rm, 1); S.colDirty = true; renderAll(); }
});
let dragI = null;
root.addEventListener('dragstart', e => { const r = e.target.closest && e.target.closest('.lv[data-i]'); if (r) { dragI = +r.dataset.i; r.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; } });
root.addEventListener('dragover', e => { if (dragI !== null && e.target.closest('.lv[data-i]')) e.preventDefault(); });
root.addEventListener('drop', e => { const r = e.target.closest && e.target.closest('.lv[data-i]'), c = S.cols.find(x => x.id === S.curCol); if (r && c && dragI !== null) { e.preventDefault(); const j = +r.dataset.i, [m] = c.levels.splice(dragI, 1); c.levels.splice(j, 0, m); S.colDirty = true; } dragI = null; renderAll(); });
root.addEventListener('dragend', () => { dragI = null; renderAll(); });

/* ---------- panels: resize and collapse (state remembered) ---------- */
function applyPanels() { const m = $('main'); m.style.setProperty('--lw', lsGet('saf_lw', '200') + 'px'); m.style.setProperty('--rw', lsGet('saf_rw', '260') + 'px'); }
function splitter(id, key, def, dir) {
  const s = $(id); s.onmousedown = e => { e.preventDefault(); const x0 = e.clientX, w0 = +lsGet(key, def); const mv = ev => { lsSet(key, Math.max(0, Math.min(520, w0 + (ev.clientX - x0) * dir))); applyPanels(); renderPv(); }; const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); };
  s.ondblclick = () => { lsSet(key, lsGet(key, def) === '0' ? def : (+lsGet(key, def) > 0 && +lsGet(key, def) !== +def ? def : 0)); applyPanels(); renderPv(); };
}
splitter('sL', 'saf_lw', 200, 1); splitter('sR', 'saf_rw', 260, -1);

/* ---------- boot ---------- */
document.documentElement.dataset.theme = lsGet('saf_theme', 'dark');
applyPanels();
(async () => {
  const mode = lsGet('saf_mode', '');
  if (mode === 'browser') { await loadStore(new BrowserStorage()); return; }
  if (mode === 'folder') { const h = await idbGet('dir'); if (h) { try { if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') { await loadStore(new FolderStorage(h)); return; } } catch (e) { } S.pending = h; } }
  renderAll();
})();
