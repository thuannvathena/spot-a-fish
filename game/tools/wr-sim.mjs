// Win-rate bot: plays every level of game/src/levels.json thousands of times with a simple model of a human player and prints the estimated
// FIRST-TRY win rate (no boosters, no Play On) next to the target in the design sheet.
//
//   node game/tools/wr-sim.mjs [--runs 3000] [--from 1] [--to 60] [--seed 1] [--levels path.json] [--csv path.csv] [--json out.json]
//
// This is a MODEL of the game rules that matter for losing (Backup of 7 slots, fish that come back out of the Backup when a tank needs them,
// obstacles that stay in the Backup, tank order, pipe waves that hold back target fish) plus a MODEL of the player (how often a tap is wrong).
// The player part (the ERR constants below and SKILL_SIGMA) is a guess until real players have been measured: the numbers rank levels by
// difficulty, they are not measured win rates. When real data exists, fit the constants in ERR to it (nothing else has to change).
import fs from 'fs';
import { fileURLToPath } from 'url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const RUNS = +arg('runs', 3000), FROM = +arg('from', 1), TO = +arg('to', 60), SEED = +arg('seed', 1);
const here = p => fileURLToPath(new URL(p, import.meta.url));
const LEVELS = JSON.parse(fs.readFileSync(arg('levels', here('../src/levels.json')), 'utf8'));
const CSV = arg('csv', here('../../Level-related/Spot-A-Fish - Level System (filled).csv'));

/* ---- the player model: probability that a tap is wrong = skill * (base + crowd + look-alikes + obstacles) x hidden-view factor ---- */
export const ERR = { base: 0.012, crowd: 0.075, look: 0.045, obst: 0.04, tiny: 1.8, fast: 1.6, ink: 1.6, swarmWait: 0.7, swarmTap: 2.5, scale: 1.3 };
export const SKILL_SIGMA = 0.4;   // players differ: each run draws a skill factor from a log-normal, so the win rate is the average over a crowd
const BACKUP_MAX = 7, FISH_CAP = 40, SPARSE = Math.round(FISH_CAP * 0.58);

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const shuffle = (a, r) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function playOnce(lv, r, errScale) {
  const k = lv.goal, skill = Math.exp(gauss(r) * SKILL_SIGMA);
  // target species 0..k-1: the last ones are the bounty species (1 fish each)
  const bKinds = lv.bounty || [], bIdx = bKinds.map((_, i) => k - 1 - i), need = [];
  let sizes = lv.tanks.slice(); for (const _ of bIdx) { const j = sizes.indexOf(1); sizes.splice(j >= 0 ? j : sizes.length - 1, 1); }
  sizes = shuffle(sizes, r); let q = 0; for (let s = 0; s < k; s++) need[s] = bIdx.includes(s) ? 1 : (sizes[q++] ?? 3);
  let order = shuffle([...Array(k).keys()].filter(s => !bIdx.includes(s)), r);
  bIdx.forEach((s, i) => order.splice(i === 0 ? Math.min(2, order.length) : Math.min(order.length, Math.max(5, order.length - 2)), 0, s));
  // fish in the tank: targets, look-alikes of targets (hue-turned decoys), other decoys
  const inTank = need.slice(), pipeT = Array(k).fill(0), decoySp = Math.max(1, lv.species - k), lookSp = Math.min(lv.look, decoySp);
  const decoyStart = Math.max(0, lv.decoyFish - (lv.tube.enabled ? lv.tube.extraFish : 0));
  const waves = lv.tube.enabled ? lv.tube.waves.map(w => ({ t: w.afterTanks, hold: w.holdFish || 1, dec: 0, tg: [] })) : [];
  const pipeDec = lv.tube.enabled ? lv.tube.extraFish : 0; waves.forEach((w, i) => { w.dec = Math.floor(pipeDec / waves.length) + (i < pipeDec % waves.length ? 1 : 0); });
  // hold back the last fish of some target species in the pipe (they come out with their wave)
  const used = new Set(bIdx);
  for (const w of waves) for (let h = 0; h < w.hold; h++) { let j = w.t; while (j < order.length && used.has(order[j])) j++; if (j >= order.length) break; const s = order[j]; used.add(s); if (need[s] < 2) continue; inTank[s]--; w.tg.push(s); }
  const decoy = Array(decoySp).fill(0); for (let i = 0; i < decoyStart; i++) decoy[i % decoySp]++;
  const la = Array(k).fill(0);   // look-alike fish of each target species (a look-alike species is a decoy species that copies a target)
  const laOwner = shuffle(order.slice(), r).slice(0, lookSp); laOwner.forEach((s, i) => { la[s] = decoy[i]; });
  const camo = bKinds.indexOf('camo'); if (camo >= 0) la[bIdx[camo]] += 8;
  let junk = { urchin: lv.urchin, jelly: lv.jelly, squid: lv.squid }, clam = lv.clam;
  const backup = []; // entries: {t: species | -1 for decoy | -2 junk, n: slots}
  let active = [null, null], qi = 0, done = 0, time = 0, wi = 0, tubeBusy = 0, lastWave = -99, dueAt = -1;
  const slots = () => backup.reduce((a, b) => a + b.n, 0);
  const tankFish = () => inTank.reduce((a, b) => a + b, 0) + la.reduce((a, b) => a + b, 0) + decoy.reduce((a, b) => a + b, 0);
  const take = i => { const s = order[qi++]; active[i] = s === undefined ? null : { s, got: 0 }; if (active[i]) { pull(active[i]); if (active[i].got >= need[active[i].s]) finish(i); } };   // fish waiting in the Backup can fill a new tank at once
  const pull = a => { for (let i = backup.length - 1; i >= 0; i--) { const b = backup[i]; if (b.t === a.s) { const m = Math.min(b.n, need[a.s] - a.got); a.got += m; b.n -= m; if (b.n <= 0) backup.splice(i, 1); } } };
  const finish = i => { done++; active[i] = null; if (done >= k) return; take(i); };
  take(0); take(1);
  for (const a of active) if (a && a.got >= need[a.s]) { /* pulled everything already */ }
  const swarmCycle = lv.swarm ? { start: 7 + r() * 3, len: 18, gap: 30 } : null;
  const inSwarm = t => { if (!swarmCycle) return 0; const c = swarmCycle.len + swarmCycle.gap, x = t - swarmCycle.start; return x >= 0 && (x % c) < swarmCycle.len ? swarmCycle.len - (x % c) : 0; };
  for (let step = 0; step < 400 && done < k; step++) {
    // pipe waves
    if (waves.length && wi < waves.length && done >= waves[wi].t) {
      if (dueAt < 0) dueAt = time;
      const starved = active.every(a => !a || a.got >= need[a.s] || (inTank[a.s] === 0 && !backup.some(b => b.t === a.s)));
      if ((tankFish() <= SPARSE && time - lastWave > 5) || time - dueAt > 8 || starved) { const w = waves[wi++]; dueAt = -1; lastWave = time; time += 1.5;
        for (const s of w.tg) inTank[s]++;
        const room = Math.max(0, FISH_CAP - tankFish()); const add = Math.min(w.dec, room + (starved ? 0 : 0)); for (let i = 0; i < add; i++) decoy[(r() * decoySp) | 0]++;
        if (w.dec > add) { const nx = waves[wi]; if (nx) nx.dec += w.dec - add; else for (let i = 0; i < w.dec - add; i++) decoy[(r() * decoySp) | 0]++; } }
    }
    // what can the player see and tap for?
    const vis = active.filter(a => a && a.got < need[a.s] && inTank[a.s] > 0);
    if (!vis.length) { time += 2.5 + 3; if (!waves.length || wi >= waves.length) { if (!active.some(a => a && a.got < need[a.s] && (inTank[a.s] > 0))) { for (const a of active) if (a && a.got < need[a.s] && inTank[a.s] === 0) { const b = backup.find(x => x.t === a.s); if (!b) inTank[a.s] = 1; } } } continue; }
    // how hard is this tap?
    const F = tankFish() + junk.urchin + junk.jelly + junk.squid + clam, crowd = (F / FISH_CAP) ** 2, a0 = vis[(r() * vis.length) | 0], neededFish = vis.reduce((n, a) => n + inTank[a.s], 0);
    const lookN = vis.reduce((n, a) => n + la[a.s], 0), lookQ = Math.min(1.5, lookN / Math.max(1, neededFish));
    const obst = (junk.urchin + junk.jelly + junk.squid + clam) / 8;
    let p = skill * errScale * ERR.scale * (ERR.base + ERR.crowd * crowd + ERR.look * lookQ + ERR.obst * obst);
    if (junk.squid && ((time % 16) < 4)) p *= ERR.ink;
    const sw = inSwarm(time); if (sw) { if (r() < ERR.swarmWait) { time += sw; continue; } p *= ERR.swarmTap; }
    const bi = bIdx.indexOf(a0.s); if (bi >= 0) p *= bKinds[bi] === 'tiny' ? ERR.tiny : bKinds[bi] === 'fast' ? ERR.fast : 1;
    p = Math.min(0.9, p);
    time += 3 + 2.5 * crowd + 1.5 * lookQ;
    if (r() >= p) { inTank[a0.s]--; a0.got++; if (a0.got >= need[a0.s]) finish(active.indexOf(a0)); continue; }
    // a wrong tap: look-alike of a needed fish (confusion), an obstacle, a decoy or a target that is not wanted yet
    const wOb = (junk.urchin + junk.jelly + junk.squid) * 0.5, wLA = lookN * 1.5, others = tankFish() - neededFish - lookN, wT = others > 0 ? others : 0, tot = wOb + wLA + wT;
    if (tot <= 0) continue; let x = r() * tot;
    if (x < wOb) { const kinds = ['urchin', 'jelly', 'squid'].filter(n => junk[n] > 0), kd = kinds[(r() * kinds.length) | 0]; backup.push({ t: -2, n: kd === 'squid' ? 3 : 1 }); }   // an obstacle stays in the Backup (squid takes 3 slots)
    else if (x < wOb + wLA) { const cand = vis.filter(a => la[a.s] > 0); const a = cand[(r() * cand.length) | 0] || vis[0]; la[a.s]--; backup.push({ t: -1, n: 1 }); }
    else { const pool = []; inTank.forEach((n, s) => { if (n > 0 && !active.some(a => a && a.s === s && a.got < need[a.s])) pool.push([s, n]); }); const dsum = decoy.reduce((a, b) => a + b, 0), tsum = pool.reduce((a, b) => a + b[1], 0), pick = r() * (dsum + tsum);
      if (pick < dsum) { let c = pick, i = 0; while (i < decoySp - 1 && c >= decoy[i]) { c -= decoy[i]; i++; } if (decoy[i] > 0) decoy[i]--; backup.push({ t: -1, n: 1 }); }
      else { let c = pick - dsum; for (const [s, n] of pool) { if (c < n) { inTank[s]--; backup.push({ t: s, n: 1 }); break; } c -= n; } } }
    // tanks that need a species that was just tapped wrongly get it back at once
    for (const a of active) if (a) { pull(a); if (a.got >= need[a.s]) finish(active.indexOf(a)); }
    if (slots() >= BACKUP_MAX) return { win: false, time };
  }
  if (done < k && globalThis.__SIMDBG) console.log('STALL', JSON.stringify({ L: lv.refLevel, done, k, active, inTank, need, backup, decoy, la, order, qi, time, waves: waves.length, wi }));
  return { win: done >= k, time, stall: done < k };   // stall = the run ran out of steps without winning or losing (a model gap, counted as a loss)
}

export function simulate(lv, runs = RUNS, errScale = 1, seed = SEED) {
  const r = rng(seed * 7919 + lv.refLevel); let w = 0, tm = 0, st = 0; for (let i = 0; i < runs; i++) { const o = playOnce(lv, r, errScale); if (o.win) w++; if (o.stall) st++; tm += o.time; }
  const p = w / runs; return { wr: p, ci: 1.96 * Math.sqrt(Math.max(p * (1 - p), 1e-4) / runs), time: tm / runs, stall: st / runs };
}

if (import.meta.url === 'file://' + process.argv[1] || process.argv[1]?.endsWith('wr-sim.mjs')) {
  const sheet = {}; if (fs.existsSync(CSV)) for (const l of fs.readFileSync(CSV, 'utf8').split(/\r?\n/).slice(1)) { const c = l.split(','); if (/^\d+$/.test(c[1])) sheet[+c[1]] = parseFloat(c[4]); }
  const out = []; let sumAbs = 0, n = 0;
  console.log('L   diff       sim WR   ±CI   sheet   diff   avg time(s)');
  for (const lv of LEVELS) { const L = lv.refLevel; if (L < FROM || L > TO) continue; const s = simulate(lv), t = sheet[L]; const d = t != null ? s.wr * 100 - t : null; if (d != null) { sumAbs += Math.abs(d); n++; }
    out.push({ L, difficulty: lv.difficulty, sim: +(s.wr * 100).toFixed(1), ci: +(s.ci * 100).toFixed(1), sheet: t, diff: d == null ? null : +d.toFixed(1), time: Math.round(s.time) });
    console.log(String(L).padEnd(3), lv.difficulty.padEnd(10), (s.wr * 100).toFixed(1).padStart(6) + '%', ('±' + (s.ci * 100).toFixed(1)).padStart(5), t != null ? (t + '%').padStart(7) : '', d != null ? (d >= 0 ? '+' : '') + d.toFixed(1) : '', String(Math.round(s.time)).padStart(8)); }
  if (n) console.log(`mean |sim - sheet| = ${(sumAbs / n).toFixed(1)} points over ${n} levels (${RUNS} runs each)`);
  if (arg('json', null)) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
}
