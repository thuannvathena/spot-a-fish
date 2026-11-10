// Nudges the level sheet until the bot's win rate (game/tools/wr-sim.mjs) is within TOL points of the target win rate in the sheet.
//
//   node game/tools/wr-tune.mjs [--tol 3] [--runs 4000] [--rounds 40] [--csv path.csv]
//
// Knobs, in the order they make a level harder: start fish (more decoys, up to the 40-fish cap), decoy species, then look-alike species (up to 4), then urchin / jellyfish (never on levels 1-5, on Easy
// levels before L40 or on a level that introduces a feature; at most 2 of each). To make a level easier the order is reversed. The file is rewritten
// after every round and levels.json is rebuilt from it. A level that cannot reach its target inside these rules is reported at the end.
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { simulate } from './wr-sim.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const TOL = +arg('tol', 3), RUNS = +arg('runs', 4000), ROUNDS = +arg('rounds', 40);
const here = p => fileURLToPath(new URL(p, import.meta.url));
const CSV = arg('csv', here('../../Level-related/Spot-A-Fish - Level System (filled).csv')), JSONF = here('../src/levels.json'), GEN = here('./csv-to-levels.mjs');
const split = line => { const r = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { r.push(cur); cur = ''; } else cur += ch; } r.push(cur); return r; };
const cell = v => (/[,"]/.test(v) ? '"' + v + '"' : v);
const lines = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean), H = split(lines[0]), rows = lines.slice(1).map(split);
// look-alike species per level: the 10-level cluster rule is the starting point, the tuner may change it level by level
if (H.indexOf('Look-alike species') < 0) { H.push('Look-alike species'); for (const r of rows) { while (r.length < H.length - 1) r.push(''); const L = +r[H.indexOf('Level')]; r.push(String(L <= 5 ? 0 : L <= 20 ? 1 : L <= 40 ? 2 : 3)); } }
const ix = n => H.indexOf(n), C = { lv: ix('Level'), diff: ix('Difficulty'), note: ix('Feature/Note'), wr: ix('Winrate (est)'), T: ix('Total Target Fish'), tanks: ix('Total Tanks'), types: ix('Total Type'), start: ix('Start Fish'), urchin: ix('urchin'), jelly: ix('jelly'), look: ix('Look-alike species') };
const save = () => fs.writeFileSync(CSV, [H.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\n') + '\n');
const num = v => (v === '' || v == null ? 0 : +v);
const byLevel = L => rows.find(r => +r[C.lv] === L);

function limits(r, L) {   // what the knobs may do on this level
  const n = num(r[C.tanks]), intro = /^(Feature|Pump)/.test(r[C.note]), obst = L > 5 && !intro && (r[C.diff] !== 'Easy' || L >= 40);   // Easy levels get urchins / jellyfish only from L40, when nothing else can make them harder
  return { startMax: 40, typesMin: n + 2, typesMax: Math.min(22, n + 12), obst };
}
function harder(r, L, up) {   // returns true when something changed
  const lim = limits(r, L); let start = num(r[C.start]), types = num(r[C.types]), u = num(r[C.urchin]), j = num(r[C.jelly]), look = num(r[C.look]); const lookMax = Math.min(4, Math.max(0, types - num(r[C.tanks])));
  const set = () => { r[C.start] = String(start); r[C.types] = String(types); r[C.urchin] = u ? String(u) : ''; r[C.jelly] = j ? String(j) : ''; r[C.look] = String(look); return true; };
  if (up) {
    if (start < lim.startMax) { start = Math.min(lim.startMax, start + 2); return set(); }
    if (types < lim.typesMax) { types++; return set(); }
    if (look < lookMax) { look++; return set(); }
    if (lim.obst && u < 2) { u++; return set(); }
    if (lim.obst && j < 2) { j++; return set(); }
    return false;
  }
  if (lim.obst && j > 0) { j--; return set(); }
  if (lim.obst && u > 0) { u--; return set(); }
  if (look > 0) { look--; return set(); }
  if (types > lim.typesMin) { types--; return set(); }
  const minStart = Math.ceil(num(r[C.T]) * 0.6) + 4; if (start > minStart) { start = Math.max(minStart, start - 2); return set(); }
  return false;
}

let result = [];
for (let round = 1; round <= ROUNDS; round++) {
  save(); execFileSync('node', [GEN, CSV], { stdio: 'pipe' });
  const levels = JSON.parse(fs.readFileSync(JSONF, 'utf8')); let off = 0; result = [];
  for (const lv of levels) {
    const L = lv.refLevel, r = byLevel(L), target = parseFloat(r[C.wr]), s = simulate(lv, RUNS, 1, round), d = s.wr * 100 - target;
    result.push({ L, target, sim: s.wr * 100, d, ci: s.ci * 100 });
    if (Math.abs(d) > TOL) { if (harder(r, L, d > 0)) off++; }
  }
  const mean = result.reduce((a, x) => a + Math.abs(x.d), 0) / result.length;
  console.log(`round ${round}: mean |diff| ${mean.toFixed(1)} pts, ${result.filter(x => Math.abs(x.d) > TOL).length} levels outside ±${TOL}, ${off} changed`);
  if (!off) break;
}
save(); execFileSync('node', [GEN, CSV], { stdio: 'pipe' });
const bad = result.filter(x => Math.abs(x.d) > TOL);
console.log(bad.length ? 'Cannot reach the target inside the design rules:\n' + bad.map(x => `  L${x.L}: sim ${x.sim.toFixed(1)}% vs target ${x.target}% (${x.d >= 0 ? '+' : ''}${x.d.toFixed(1)})`).join('\n') : 'All levels are within the tolerance.');
