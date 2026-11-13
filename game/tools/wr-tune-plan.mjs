// Nudges game/src/levels.json (the planned ramp of scripts/plan-levels.py) until the bot's win rate (wr-sim.mjs) is within TOL points of the target win rate of the
// design sheet CSV (column "Winrate (est)"). It does NOT read or write the CSV and it never changes the fish counts, the fish speed or the fish size.
//
//   node game/tools/wr-tune-plan.mjs [--tol 3] [--runs 2500] [--rounds 30] [--dry]
//
// Knobs, in the order they make a level harder: colour copies of a target (only from level 11, at most 4, never more than the decoy species), then urchins and jellyfish
// (not on levels 1-7, not on a level that introduces something, not on Easy levels before L40; at most 2 of each). To make a level easier the order is reversed.
// A level that cannot reach its target inside these rules is listed at the end.
import fs from 'fs';
import { fileURLToPath } from 'url';
import { simulate } from './wr-sim.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const TOL = +arg('tol', 3), RUNS = +arg('runs', 2500), ROUNDS = +arg('rounds', 30), DRY = process.argv.includes('--dry');
const here = p => fileURLToPath(new URL(p, import.meta.url));
const JSONF = here('../src/levels.json'), CSV = here('../../Level-related/Spot-A-Fish - Level System (filled).csv');
const split = line => { const r = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { r.push(cur); cur = ''; } else cur += ch; } r.push(cur); return r; };
const lines = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean), H = split(lines[0]), rows = lines.slice(1).map(split);
const target = {}; for (const r of rows) target[+r[H.indexOf('Level')]] = parseFloat(r[H.indexOf('Winrate (est)')]);
const levels = JSON.parse(fs.readFileSync(JSONF, 'utf8'));
const INTRO = new Set([3, 4, 7, 9, 11, 16, 21, 31]);   // levels that introduce a feature or a booster
const decoySp = lv => lv.fishKeys.length - lv.goal;
function step(lv, L, harder) {
  const obstOK = L >= 8 && !INTRO.has(L) && (lv.difficulty !== 'Easy' || L >= 40), lookMax = L < 11 ? 0 : Math.min(4, decoySp(lv));
  if (harder) { if (lv.look < lookMax) { lv.look++; return true; } if (obstOK && lv.urchin < 2) { lv.urchin++; return true; } if (obstOK && lv.jelly < 2) { lv.jelly++; return true; } return false; }
  if (lv.jelly > 0) { lv.jelly--; return true; } if (lv.urchin > 0) { lv.urchin--; return true; } if (lv.look > 0) { lv.look--; return true; } return false;
}
let result = [];
for (let round = 1; round <= ROUNDS; round++) {
  let changed = 0; result = [];
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i], L = i + 1, s = simulate(lv, RUNS, 1, round), d = s.wr * 100 - target[L]; result.push({ L, target: target[L], sim: s.wr * 100, d });
    if (Math.abs(d) > TOL && step(lv, L, d > 0)) changed++;
  }
  const mean = result.reduce((a, x) => a + Math.abs(x.d), 0) / result.length;
  console.log(`round ${round}: mean |diff| ${mean.toFixed(1)} pts, ${result.filter(x => Math.abs(x.d) > TOL).length} levels outside ±${TOL}, ${changed} changed`);
  if (!changed) break;
}
if (!DRY) { fs.writeFileSync(JSONF, JSON.stringify(levels, null, 1)); console.log('levels.json written'); }
fs.writeFileSync(here('../../tune-result.json'), JSON.stringify(result.map(x => ({ L: x.L, target: x.target, sim: +x.sim.toFixed(1), look: levels[x.L - 1].look, urchin: levels[x.L - 1].urchin, jelly: levels[x.L - 1].jelly })), null, 1));
const bad = result.filter(x => Math.abs(x.d) > TOL);
console.log(bad.length ? `Cannot reach the target inside the rules (${bad.length}):\n` + bad.map(x => `  L${x.L}: sim ${x.sim.toFixed(1)}% vs target ${x.target}% (${x.d >= 0 ? '+' : ''}${x.d.toFixed(1)})`).join('\n') : 'All levels are within the tolerance.');
