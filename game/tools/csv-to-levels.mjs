// Builds game/src/levels.json (the 60 levels) from the level design sheet exported as CSV
// (Level-related/Spot-A-Fish - Level System (filled).csv). Run:  node game/tools/csv-to-levels.mjs [path-to-csv]
// The sheet is the design source; this file only translates it into level files (see docs/guide/editor.md).
import fs from 'fs';
import { fileURLToPath } from 'url';
import { LEVEL_SCHEMA, EVENT_UNLOCK, UNLOCK } from '../src/levelcfg.js';

// one CSV line to cells (a cell in double quotes may contain commas, e.g. "tiny, camo")
function splitCsv(line) { const r = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { r.push(cur); cur = ''; } else cur += ch; } r.push(cur); return r; }
const csvPath = process.argv[2] || fileURLToPath(new URL('../../Level-related/Spot-A-Fish - Level System (filled).csv', import.meta.url));
const rows = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean).map(splitCsv);
const H = rows[0], ix = n => { const i = H.indexOf(n); if (i < 0) throw new Error('column missing: ' + n); return i; };
const col = { diff: ix('Difficulty'), lv: ix('Level'), note: ix('Feature/Note'), T: ix('Total Target Fish'), tanks: ix('Total Tanks'), types: ix('Total Type'), start: ix('Start Fish'),
  pump: ix('Pump'), urchin: ix('urchin'), jelly: ix('jelly'), squid: ix('Squid'), shell: ix('Shell'), swarm: ix('Fish Swarm'), mix: ix('Tank mix (fish per tank)'), pumpFish: ix('Pump fish (total in pipe)'), special: ix('Special fish (x1 tank each)'), hold: ix('Held target fish per wave'), look: H.indexOf('Look-alike species') };   // the look-alike column is optional: without it the cluster rule below applies
const num = v => (v === '' || v == null ? 0 : +v);

// fish look-alike steps, in clusters of 10 levels: how many decoy species are colour look-alikes of a target, and how far their hue is turned (smaller = more alike)
const LOOK = L => (L <= 5 ? 0 : L <= 20 ? 1 : L <= 40 ? 2 : 3), SHIFT = L => [130, 110, 90, 75, 62, 55][Math.min(5, Math.floor((L - 1) / 10))];
const FISH_CAP = 40, CAMO_COPIES = 8;

const out = [];
for (const r of rows.slice(1)) {
  const L = num(r[col.lv]); if (!L) continue;
  const note = r[col.note], T = num(r[col.T]), bounty = (r[col.special] || '').split(',').map(s => s.trim()).filter(Boolean);
  const tanks = []; for (const part of r[col.mix].split('+')) { const [n, k] = part.split('x').map(Number); for (let i = 0; i < n; i++) tanks.push(k); }
  if (tanks.reduce((a, b) => a + b, 0) !== T || tanks.length !== num(r[col.tanks])) throw new Error('L' + L + ': tank mix does not match target fish');
  const nTanks = tanks.length, waves = num(r[col.pump]), pumpFish = num(r[col.pumpFish]), camo = bounty.includes('camo') ? CAMO_COPIES : 0;
  const holdFish = num(r[col.hold]) || 1, held = waves ? Math.min(waves * holdFish, tanks.filter(k => k >= 2).length) : 0;   // target fish that wait in the pipe at the start
  const decoyStart = Math.max(0, num(r[col.start]) - (T - held) - camo);
  const afterTanks = []; for (let i = 1; i <= waves; i++) { let t = Math.max(1, Math.min(nTanks - 1, Math.round(i * nTanks / (waves + 1)))); if (afterTanks.length && t <= afterTanks[afterTanks.length - 1]) t = afterTanks[afterTanks.length - 1] + 1; afterTanks.push(Math.min(nTanks - 1, t)); }
  const events = Object.entries(EVENT_UNLOCK).filter(([k, from]) => from <= L && k !== 'feed' && k !== 'startle').map(([k]) => k);
  out.push({
    schema: LEVEL_SCHEMA, version: 2, id: 'L' + String(L).padStart(2, '0'), name: note || 'Level ' + L, status: 'Ready', difficulty: r[col.diff], category: L === 1 ? 'Tutorial' : bounty.length ? 'Bounty' : 'Normal', refLevel: L,
    goal: nTanks, per: 3, tanks, bounty,
    species: num(r[col.types]), decoyFish: decoyStart + pumpFish, look: col.look >= 0 && r[col.look] !== '' ? num(r[col.look]) : LOOK(L), shift: SHIFT(L), sizeK: 1.4, speedK: 0.85,
    urchin: num(r[col.urchin]), jelly: num(r[col.jelly]), squid: num(r[col.squid]), clam: num(r[col.shell]), swarm: num(r[col.swarm]) > 0,
    tube: { enabled: L >= UNLOCK.tube, extraFish: pumpFish, waves: afterTanks.map(t => ({ afterTanks: t, holdLast: true, holdFish })), autoPumpWhenStuck: true, stuckDelaySec: 2.5 },
    backup: L >= 2, hint: L >= 4, tank: L >= 7, clear: L >= 9, theme: Math.floor((L - 1) / 12),
    events, eventGap: [8, 10], feed: L >= EVENT_UNLOCK.feed, feedGap: [24, 34], startle: L >= EVENT_UNLOCK.startle, startleGap: [26, 38], swarmGap: [30, 30]
  });
  const o = out[out.length - 1];
  if (o.tube.enabled === false) { o.tube.extraFish = 0; o.tube.waves = []; }
  if (!o.tube.enabled && T + camo + decoyStart > FISH_CAP) throw new Error('L' + L + ': too many fish without a pipe');
}
// level 61: a test level for the Tripo fish (public/models/tripo): 4 target tanks of 1 fish, 8 decoys, one fish of each of the 12 kinds
const TRIPO = ['Emerald_blue', 'Golden_Flame', 'Goldie_tot', 'Green_Orby', 'Green_finny', 'brown_stripe', 'deep_lantern_fish', 'ghostly_wave', 'golden_spot', 'golden_tide', 'goldie', 'green_beast'];
out.push({ schema: LEVEL_SCHEMA, version: 2, id: 'L61', name: 'Tripo fish test', status: 'Draft', difficulty: 'Easy', category: 'Normal', refLevel: 61, goal: 4, per: 1, tanks: [1, 1, 1, 1], bounty: [], species: 12, decoyFish: 8, look: 0, shift: 55, sizeK: 1.4, speedK: 0.85, urchin: 0, jelly: 0, squid: 0, clam: 0, swarm: false,
  tube: { enabled: false, extraFish: 0, waves: [], autoPumpWhenStuck: true, stuckDelaySec: 2.5 }, backup: true, hint: true, tank: true, clear: true, theme: 4, events: [], eventGap: [8, 10], feed: false, feedGap: [24, 34], startle: false, startleGap: [26, 38], swarmGap: [30, 30], fishKeys: TRIPO.map(n => 'tripo_' + n) });
fs.writeFileSync(new URL('../src/levels.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('wrote', out.length, 'levels');
