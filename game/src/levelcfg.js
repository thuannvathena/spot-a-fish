// Level parameters shared by the game and the level editor.
// defaultsFor(L) is the built-in rule set (moved unchanged from the old levelConfig in main.js).
// cfgFromLevel(json, L) lays a level file (see docs/guide/editor.md) over those defaults.

// goal = target tanks, obstacles (urchin + jelly), decoy = decoy fish. The 2nd column (species) is unused; species = 2 x goal.
export const LEVELS = [
  [3, 5, 1, 8], [4, 5, 1, 12], [4, 6, 2, 14], [5, 7, 2, 18], [5, 8, 3, 24],
  [6, 9, 3, 30], [6, 10, 4, 36], [7, 11, 4, 42], [7, 12, 5, 48], [8, 13, 5, 54],
  [8, 14, 6, 58], [9, 15, 6, 62], [9, 16, 7, 66], [10, 18, 7, 70], [10, 20, 8, 74]];

export function defaultsFor(L) {
  let [goal, , obs, decoy] = LEVELS[Math.min(Math.max(L, 1), LEVELS.length) - 1];
  // gentle ramp: levels 1-2 need 1 fish per tank, 3-4 need 2, from 5 on 3; a slow calm school at first, fast swimming only comes later as a mechanic
  const per = L <= 2 ? 1 : L <= 4 ? 2 : 3; if (L <= 2) goal = L === 1 ? 4 : 5; else if (L <= 4) goal = 4;
  // species in the tank = 2 x goal: `goal` target species + `goal` decoy species, of which 1~2 are colour look-alikes of a target
  const C = { goal, per, backup: L >= 2, hint: L >= 4, clear: L >= 5, sizeK: L <= 3 ? 1.7 : L <= 6 ? 1.5 : L <= 9 ? 1.35 : 1.25, speedK: L <= 3 ? .72 : L <= 6 ? .82 : L <= 9 ? .9 : 1, boostK: L <= 3 ? .5 : L <= 6 ? .7 : 1, dash: L >= 9, startle: L >= 10, tube: L >= 7, swarm: L >= 9, swarmGap: L < 12 ? [28, 40] : [20, 30], bounty: L >= 6 && (L % 2 === 0 || L === 15) ? (L === 15 ? 'fast' : ['tiny', 'camo', 'fast'][(L / 2 | 0) % 3]) : null, evKinds: L < 2 ? ['squabble', 'waltz', 'conga', 'drop'] : L < 4 ? ['squabble', 'waltz', 'conga', 'drop'] : L < 7 ? ['squabble', 'waltz', 'conga', 'swirl', 'drop'] : ['squabble', 'waltz', 'conga', 'swirl', 'hide', 'drop'], evGap: L < 7 ? [6, 10] : [5, 8], startleGap: L < 13 ? [26, 38] : [18, 28], typesTotal: goal * 2, obstacles: obs, decoys: decoy, look: L < 3 ? 0 : L < 8 ? 1 : 2, shift: Math.max(55, 168 - L * 8),
    squid: L < 3 ? 0 : L < 12 ? 1 : 2, clams: L < 6 ? 0 : L < 12 ? 1 : 2, clamTaps: 1, feed: L >= 3, feedGap: L < 10 ? [24, 34] : [18, 26] };
  const only = { 3: 'squid', 6: 'clam', 9: 'swarm' }[L];   // the level that introduces an obstacle shows that obstacle alone
  if (only) { C.obstacles = 0; C.squid = only === 'squid' ? 1 : 0; C.clams = only === 'clam' ? 1 : 0; C.swarm = only === 'swarm'; }
  C.urchin = Math.ceil(C.obstacles / 2); C.jelly = Math.floor(C.obstacles / 2);   // the old code alternated urchin, jelly, urchin...
  C.autoPump = true; C.stuckDelay = 2.5; C.theme = null; C.tubeExtra = null; C.tubeWaves = null;
  return C;
}

const num = v => typeof v === 'number' && isFinite(v);
const pair = v => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);

export function cfgFromLevel(lv, L) {
  const C = defaultsFor(L);
  if (!lv) return C;
  if (num(lv.goal)) C.goal = lv.goal;
  if (num(lv.per)) C.per = lv.per;
  if (num(lv.species)) C.typesTotal = lv.species; else C.typesTotal = C.goal * 2;
  if (num(lv.decoyFish)) C.decoys = lv.decoyFish;
  if (num(lv.look)) C.look = lv.look;
  if (num(lv.sizeK)) C.sizeK = lv.sizeK;
  if (num(lv.speedK)) C.speedK = lv.speedK;
  if (num(lv.urchin) || num(lv.jelly)) { C.urchin = lv.urchin || 0; C.jelly = lv.jelly || 0; C.obstacles = C.urchin + C.jelly; }
  if (num(lv.squid)) C.squid = lv.squid;
  if (num(lv.clam)) C.clams = lv.clam;
  if (typeof lv.swarm === 'boolean') C.swarm = lv.swarm;
  if (Array.isArray(lv.bounty)) C.bounty = lv.bounty[0] || null;   // the game currently shows at most one bounty tank
  if (typeof lv.backup === 'boolean') C.backup = lv.backup;
  if (typeof lv.hint === 'boolean') C.hint = lv.hint;
  if (typeof lv.clear === 'boolean') C.clear = lv.clear;
  if (pair(lv.eventGap)) C.evGap = lv.eventGap;
  if (typeof lv.feed === 'boolean') C.feed = lv.feed;
  if (pair(lv.feedGap)) C.feedGap = lv.feedGap;
  if (pair(lv.swarmGap)) C.swarmGap = lv.swarmGap;
  if (typeof lv.startle === 'boolean') C.startle = lv.startle;
  if (pair(lv.startleGap)) C.startleGap = lv.startleGap;
  if (num(lv.theme)) C.theme = lv.theme;
  if (typeof lv.onlyFish === 'string') C.onlyFish = lv.onlyFish;   // every fish of the level is this 3D model (see MODEL_DEFS in main.js)
  const t = lv.tube;
  if (t) {
    if (typeof t.enabled === 'boolean') C.tube = t.enabled;
    if (num(t.extraFish)) C.tubeExtra = t.extraFish;
    if (Array.isArray(t.waves) && t.waves.length) C.tubeWaves = t.waves.filter(w => w && num(w.afterTanks));
    if (typeof t.autoPumpWhenStuck === 'boolean') C.autoPump = t.autoPumpWhenStuck;
    if (num(t.stuckDelaySec)) C.stuckDelay = t.stuckDelaySec;
  }
  return C;
}

export const LEVEL_SCHEMA = 'spot-a-fish-level';

// The built-in level L as a level file (used to create game/src/levels.json).
export function levelToJson(L) {
  const C = defaultsFor(L), pad = String(L).padStart(2, '0');
  const names = { 1: 'First catch', 2: 'Backup', 3: 'Squid', 4: 'Hint', 5: 'Clear Backup', 6: 'Clam', 7: 'Pump tube', 8: 'Camo bounty', 9: 'Swarm', 10: 'Fast bounty' };
  return {
    schema: LEVEL_SCHEMA, version: 1, id: 'L' + pad, name: names[L] || 'Level ' + L,
    status: 'Ready', difficulty: L <= 4 ? 'Easy' : L <= 10 ? 'Medium' : 'Hard', category: L === 1 ? 'Tutorial' : C.bounty ? 'Bounty' : 'Normal',
    refLevel: L, goal: C.goal, per: C.per, bounty: C.bounty ? [C.bounty] : [],
    species: C.typesTotal, decoyFish: C.decoys, look: C.look, sizeK: C.sizeK, speedK: C.speedK,
    urchin: C.urchin, jelly: C.jelly, squid: C.squid, clam: C.clams, swarm: !!C.swarm,
    tube: { enabled: !!C.tube, autoPumpWhenStuck: true, stuckDelaySec: 2.5 },
    backup: C.backup, hint: C.hint, clear: C.clear,
    eventGap: C.evGap, feed: !!C.feed, feedGap: C.feedGap, swarmGap: C.swarmGap, startle: !!C.startle, startleGap: C.startleGap
  };
}
