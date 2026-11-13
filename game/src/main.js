import * as THREE from 'three';
import { cfgFromLevel } from './levelcfg.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import LV from './levels.json';

/* ============================== constants ============================== */
let SHAPE = 'cyl', BOWL = false, PLAN = false, RB = 1;
const R = 3.25, TANK_H = 5.2, FLOOR_Y = 0.45, WATER_Y = 4.75, RF = 2.75, RK = R / 2.6; // tank radius, glass top, sand, water level, fish roam radius
let WALL_MAX = R;
/* ---- the shape of the tank. Six shapes, ten levels each: cylinder, bowl, rounded box, hexagon, flower, heart. The fish limits are radii, so shK(x, z, y) says how far the safe zone reaches in that direction (and at that height) compared with the cylinder's: every limit follows any shape that can be seen from its middle. ?shape=name locks one shape for testing. ---- */
const SHAPES = ['cyl', 'bowl', 'box', 'hex', 'flower', 'heart'], SHAPE_LOCK = (location.search.match(/[?&]shape=(\w+)/) || [])[1] || '';
const shapeForLevel = L => SHAPES.includes(SHAPE_LOCK) ? SHAPE_LOCK : SHAPES[Math.floor((Math.max(1, L) - 1) / 10) % SHAPES.length];
const NTAB = 720, WALL_RAW = new Float32Array(NTAB + 2), WALL_TAB = new Float32Array(NTAB + 2), WR = new Float32Array(180);
const sdBox = (x, z, o = 0) => { const a = 3.0 + o, c = 1.0 + o, qx = Math.abs(x) - (a - c), qz = Math.abs(z) - (a - c); return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - c; };
const sdHex = (x, z, r) => { const kx = -.8660254, ky = .5, kz = .5773503; x = Math.abs(x); z = Math.abs(z); const d = Math.min(kx * x + ky * z, 0); x -= 2 * d * kx; z -= 2 * d * ky; x -= Math.max(-kz * r, Math.min(kz * r, x)); z -= r; return Math.hypot(x, z) * Math.sign(z); };
const BOWL_YC = (FLOOR_Y + TANK_H) / 2, BOWL_H = (TANK_H - FLOOR_Y) / 2, bowlP = y => { const u = Math.min(1, Math.abs(y - BOWL_YC) / BOWL_H); return .62 + .38 * Math.sqrt(1 - u * u); };
function rawWall(id) {
  const bis = sd => { for (let i = 0; i <= NTAB + 1; i++) { const th = i / NTAB * Math.PI * 2, cx = Math.cos(th), sz = Math.sin(th); let lo = 0, hi = 9; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (sd(cx * m, sz * m) > 0) hi = m; else lo = m; } WALL_RAW[i] = lo; } };
  if (id === 'box') bis((x, z) => sdBox(x, z));
  else if (id === 'hex') bis((x, z) => sdHex(x, z, 2.85) - .3);
  else if (id === 'flower') for (let i = 0; i <= NTAB + 1; i++) { const th = i / NTAB * Math.PI * 2; WALL_RAW[i] = 3.1 + .5 * Math.cos(5 * th); }
  else if (id === 'heart') { WALL_RAW.fill(0); const pts = []; for (let i = 0; i < 6000; i++) { const t = i / 6000 * Math.PI * 2; pts.push([16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]); }
    let cx = 0, cz = 0; for (const q of pts) { cx += q[0]; cz += q[1]; } cx /= pts.length; cz /= pts.length; const sc = 3.5 / 16;
    for (const q of pts) { const x = (q[0] - cx) * sc, z = (q[1] - cz) * sc, th = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2), b = Math.round(th / (Math.PI * 2) * NTAB) % NTAB; WALL_RAW[b] = Math.max(WALL_RAW[b], Math.hypot(x, z)); }
    for (let i = 0; i < NTAB; i++) if (!WALL_RAW[i]) { let a = i, b = i; while (!WALL_RAW[((a % NTAB) + NTAB) % NTAB]) a--; while (!WALL_RAW[b % NTAB]) b++; const wa = WALL_RAW[((a % NTAB) + NTAB) % NTAB], wb = WALL_RAW[b % NTAB]; WALL_RAW[i] = wa + (wb - wa) * (i - a) / Math.max(1, b - a); }
    WALL_RAW[NTAB] = WALL_RAW[0]; WALL_RAW[NTAB + 1] = WALL_RAW[1]; }
}
function wallR(th, o = 0) { let a = th % (Math.PI * 2); if (a < 0) a += Math.PI * 2; const f = a / (Math.PI * 2) * NTAB, i = f | 0; return WALL_RAW[i] + (WALL_RAW[i + 1] - WALL_RAW[i]) * (f - i) + o; }
function erodeWall(m) {   // the safe zone: how far from the middle a point can be and still stay m away from the glass (along the real wall, not just along the radius), in units of RF
  const N = 160, P = []; for (let i = 0; i < N; i++) { const th = i / N * Math.PI * 2, w = wallR(th); P.push(Math.cos(th) * w, Math.sin(th) * w); }
  const dist = (x, z) => { let d = 1e9; for (let i = 0, j = N - 1; i < N; j = i++) { const ax = P[j * 2], az = P[j * 2 + 1], dx = P[i * 2] - ax, dz = P[i * 2 + 1] - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))), qx = x - ax - t * dx, qz = z - az - t * dz; d = Math.min(d, qx * qx + qz * qz); } return Math.sqrt(d); };
  for (let i = 0; i <= NTAB + 1; i++) { const th = i / NTAB * Math.PI * 2, cx = Math.cos(th), sz = Math.sin(th); let t = 0; while (t < 5 && dist(cx * (t + .04), sz * (t + .04)) >= m) t += .04; WALL_TAB[i] = t / RF; }
}
function shK(x, z, y) { if (BOWL) return bowlP(y === undefined ? WATER_Y - 1 : y); if (!PLAN) return 1; let a = Math.atan2(z, x); if (a < 0) a += Math.PI * 2; const f = a / (Math.PI * 2) * NTAB, i = f | 0; return WALL_TAB[i] + (WALL_TAB[i + 1] - WALL_TAB[i]) * (f - i); }
function clampXZ(v, lim) { const L = lim * shK(v.x, v.z, v.y), rr = Math.hypot(v.x, v.z); if (rr > L) { v.x *= L / rr; v.z *= L / rr; } }
function wallAt(x, z, y) { return PLAN ? wallR(Math.atan2(z, x)) : BOWL ? R * bowlP(y) : R; }
function ringK(y) { return PLAN ? WALL_MIN : BOWL ? bowlP(y) : 1; }
let WALL_MIN = 1;
function outlineXZ(o, n = 360) { const pts = []; for (let i = 0; i < n; i++) { const th = i / n * Math.PI * 2, w = wallR(th, o); pts.push([Math.cos(th) * w, Math.sin(th) * w]); } return pts; }
function slabGeo(o, h) { const sh = new THREE.Shape(); outlineXZ(o).forEach(([x, z], i) => i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)); const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 1 }); g.rotateX(-Math.PI / 2); g.translate(0, -h / 2, 0); return g; }
function flatGeo(o) { const sh = new THREE.Shape(); outlineXZ(o).forEach(([x, z], i) => i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)); return new THREE.ShapeGeometry(sh, 1).rotateX(-Math.PI / 2); }
function loopGeo(o, r, rs = 8) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outlineXZ(o, 240).map(([x, z]) => new THREE.Vector3(x, 0, z)), true), 480, r, rs, true); }
function wallGeo(h) { const n = 360, P = outlineXZ(0, n), pos = [], nor = [], idx = [];
  for (let i = 0; i <= n; i++) { const a = P[(i - 1 + n) % n], b = P[(i + 1) % n], c = P[i % n], tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1; for (const y of [-h / 2, h / 2]) { pos.push(c[0], y, c[1]); nor.push(tz / tl, 0, -tx / tl); } }
  for (let i = 0; i < n; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, c, b, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g; }
function bowlGlassGeo() { const pts = []; for (let k = 0; k <= 48; k++) { const y = FLOOR_Y + k / 48 * (TANK_H - FLOOR_Y); pts.push(new THREE.Vector2(R * bowlP(y), y - (TANK_H + FLOOR_Y) / 2)); } return new THREE.LatheGeometry(pts, 96); }
const GEO = {
  floor: () => PLAN ? flatGeo(-.03) : new THREE.CircleGeometry(R * RB - .03, 64).rotateX(-Math.PI / 2),
  stand: () => PLAN ? slabGeo(.23, FLOOR_Y) : new THREE.CylinderGeometry(R * RB + .18, R * RB + .28, FLOOR_Y, 64),
  rimTop: () => PLAN ? loopGeo(.02, .07) : new THREE.TorusGeometry(R * (BOWL ? bowlP(TANK_H) : 1) + .02, .07, 10, 80).rotateX(Math.PI / 2),
  rimBot: () => PLAN ? loopGeo(.02, .07) : new THREE.TorusGeometry(R * RB + .02, .07, 10, 80).rotateX(Math.PI / 2),
  plinth: () => PLAN ? slabGeo(.47, .26) : new THREE.CylinderGeometry(R * RB + .42, R * RB + .52, .26, 72),
  plTop: () => PLAN ? slabGeo(.36, .1) : new THREE.CylinderGeometry(R * RB + .3, R * RB + .42, .1, 72),
  glow: () => PLAN ? loopGeo(.5, .04) : new THREE.TorusGeometry(R * RB + .5, .04, 8, 96).rotateX(Math.PI / 2),
  glass: () => PLAN ? wallGeo(TANK_H - FLOOR_Y) : BOWL ? bowlGlassGeo() : new THREE.CylinderGeometry(R, R, TANK_H - FLOOR_Y, 72, 1, true)
};
const SHELL = {};
const WALL_GLSL = `uniform float uWr[180]; uniform float uSurfR; uniform float uMode; float wallRad(vec2 p){ float a=atan(p.y,p.x); if(a<0.) a+=6.2831853; float f=a/6.2831853*180.; int i=int(f); float t=f-float(i); int j=i+1; if(j>=180) j=0; return mix(uWr[i],uWr[j],t); }`;
function setShape(id) {   // switch the tank to another shape: the tables, the glass / base / sand / rims, the decor and the pipe follow
  if (!SHAPES.includes(id)) id = 'cyl'; if (id === SHAPE && SHELL.done) return false;
  if (SHELL.done) orbit.el = id === 'heart' ? Math.max(orbit.el, .6) : (SHAPE === 'heart' ? .3 : orbit.el);
  SHAPE = id; BOWL = id === 'bowl'; PLAN = !(id === 'cyl' || BOWL); RB = BOWL ? bowlP(FLOOR_Y) : 1;
  if (PLAN) { rawWall(id); erodeWall(R - RF + (id === 'heart' ? .3 : id === 'flower' ? .15 : 0)); let mx = 0, mi = 9; for (let i = 0; i < NTAB; i++) { mx = Math.max(mx, WALL_RAW[i]); mi = Math.min(mi, WALL_TAB[i]); } WALL_MAX = mx; WALL_MIN = mi; for (let i = 0; i < 180; i++) WR[i] = WALL_RAW[i * 4]; } else { WALL_MAX = R; WALL_MIN = 1; }
  if (SHELL.done) {
    const sw = (m, g) => { if (m) { m.geometry.dispose(); m.geometry = g; } }; for (const k of ['floor', 'stand', 'rimTop', 'rimBot', 'plinth', 'plTop', 'glow', 'glass']) sw(SHELL[k], GEO[k]());
    SHELL.surfU.uMode.value = PLAN ? 2 : BOWL ? 1 : 0; SHELL.surfU.uSurfR.value = R * (BOWL ? bowlP(WATER_Y) : 1);
    LENS.on = id === 'cyl' && (QP('lens') ? QP('lens') === '1' : !COARSE);
    replaceDecor(); resize();
  }
  return true;
}
function decorOverflow(fix) {   /* how far each decor piece sticks out through the glass (box corners against the wall at their height); with fix the piece is walked toward the middle until it fits */
  const bx = new THREE.Box3(), c = new THREE.Vector3(), s0 = tank.scale.clone(), p0 = tank.position.clone(); tank.scale.set(1, 1, 1); tank.position.set(0, 0, 0); tank.updateMatrixWorld(true);
  const out = [];
  for (let gi = 0; gi < themeG.length; gi++) for (const m of themeG[gi].children) { const pl = m.userData.pl; if (!pl) continue;
    if (fix) m.scale.copy(m.userData.s0 || (m.userData.s0 = m.scale.clone()));
    let r = pl[0] * shK(Math.cos(pl[1]), Math.sin(pl[1]), pl[2]), worst = -9, first = null;
    for (let it = 0; it < 16; it++) {
      if (fix) { m.position.x = Math.cos(pl[1]) * r; m.position.z = Math.sin(pl[1]) * r; } m.updateMatrixWorld(true); bx.setFromObject(m); worst = -9;
      for (let i = 0; i < 8; i++) { c.set(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z); const th = Math.atan2(c.z, c.x), wl = PLAN ? wallR(th) : BOWL ? R * bowlP(c.y) : R; worst = Math.max(worst, Math.hypot(c.x, c.z) - (wl - .05)); }
      if (first === null) first = worst;
      if (!fix || worst <= 0) break; r = Math.max(.15, r - Math.min(.5, worst * 1.05));
    }
    for (let k = 0; fix && worst > 0 && k < 8; k++) { m.scale.multiplyScalar(.88); m.updateMatrixWorld(true); bx.setFromObject(m); worst = -9; for (let i = 0; i < 8; i++) { c.set(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z); const th = Math.atan2(c.z, c.x), wl = PLAN ? wallR(th) : BOWL ? R * bowlP(c.y) : R; worst = Math.max(worst, Math.hypot(c.x, c.z) - (wl - .05)); } }
    if (first > 0) out.push({ theme: gi, over: +first.toFixed(2), fixed: worst <= 0 });
  }
  tank.scale.copy(s0); tank.position.copy(p0); tank.updateMatrixWorld(true); return out;
}
window.__decor = decorOverflow;
function separateDecor() {   /* solid decor pieces never overlap each other: biggest first, each later piece slides round the tank / in or out until its footprint is free (and still inside the glass); when no place is free it is left out */
  const bx = new THREE.Box3(), c = new THREE.Vector3(), def = THREE.Material.prototype.onBeforeCompile, s0 = tank.scale.clone(), p0 = tank.position.clone(); tank.scale.set(1, 1, 1); tank.position.set(0, 0, 0); tank.updateMatrixWorld(true);
  const solid = m => { let ok = false; m.traverse(n => { if (n.isMesh && n.material && n.material.onBeforeCompile === def && n.geometry.type !== 'PlaneGeometry' && n.geometry.type !== 'CircleGeometry') ok = true; }); return ok; };
  const area = m => { m.updateMatrixWorld(true); bx.setFromObject(m); return (bx.max.x - bx.min.x) * (bx.max.z - bx.min.z); };
  const glassWorst = m => { let w = -9; for (let i = 0; i < 8; i++) { c.set(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z); const th = Math.atan2(c.z, c.x), wl = PLAN ? wallR(th) : BOWL ? R * bowlP(c.y) : R; w = Math.max(w, Math.hypot(c.x, c.z) - (wl - .05)); } return w; };
  const over = (a, b, mg) => a[0] < b[2] + mg && a[2] > b[0] - mg && a[1] < b[3] + mg && a[3] > b[1] - mg;
  const stats = { moved: 0, cut: 0 };
  for (const g of themeG) {
    const items = g.children.filter(m => m.userData.pl); for (const m of items) m.visible = true;
    if (g.userData.houses) { if (!g.userData.hAll) g.userData.hAll = g.userData.houses.slice(); g.userData.houses.length = 0; g.userData.houses.push(...g.userData.hAll); }
    const sol = items.filter(solid).map(m => ({ m, ar: area(m) })).sort((a, b) => b.ar - a.ar), placed = [];
    for (const { m } of sol) {
      const pl = m.userData.pl, s0 = m.userData.s0 || m.scale.clone(); let done = false;
      for (const sf of [1, .85, .7]) { if (done) break; m.scale.copy(s0).multiplyScalar(sf);
      for (const da of [0, .12, -.12, .26, -.26, .42, -.42, .62, -.62, .9, -.9, 1.3, -1.3, 1.8, -1.8, 2.5, -2.5, 3.1]) { if (done) break;
        const a = pl[1] + da; for (const dr of [1, .84, 1.14, .7, 1.28]) {
          let r = pl[0] * shK(Math.cos(a), Math.sin(a), pl[2]) * dr, ok = false;
          for (let k = 0; k < 7; k++) { m.position.x = Math.cos(a) * r; m.position.z = Math.sin(a) * r; if (m.userData.face) m.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); m.updateMatrixWorld(true); bx.setFromObject(m); const w = glassWorst(m); if (w <= 0) { ok = true; break; } r = Math.max(.1, r - Math.max(.06, w)); }
          if (!ok) continue; const iw = (bx.max.x - bx.min.x) * .12, id = (bx.max.z - bx.min.z) * .12, rc = [bx.min.x + iw, bx.min.z + id, bx.max.x - iw, bx.max.z - id];
          if (placed.every(q => !over(rc, q, .1))) { placed.push(rc); done = true; if (da || dr !== 1 || sf !== 1) stats.moved++; break; } } } }
      if (!done) { m.scale.copy(s0); m.visible = false; stats.cut++; const hs = g.userData.houses; if (hs) for (let i = hs.length - 1; i >= 0; i--) if (hs[i].src && hs[i].src.g === m) hs.splice(i, 1); }
    }
  }
  tank.scale.copy(s0); tank.position.copy(p0); tank.updateMatrixWorld(true); return stats;
}
window.__sep = separateDecor;
function replaceDecor() {   // every decor piece keeps its polar place (radius, angle) and is set down again inside the new shape
  const Y = new THREE.Vector3(0, 1, 0);
  for (const g of themeG) { g.userData.cols = null; for (const m of g.children) { const pl = m.userData.pl; if (pl) { const r = pl[0] * shK(Math.cos(pl[1]), Math.sin(pl[1]), pl[2]); m.position.x = Math.cos(pl[1]) * r; m.position.z = Math.sin(pl[1]) * r; } }
    }
  decorOverflow(true); separateDecor();
  for (const g of themeG) for (const h of g.userData.houses || []) if (h.src) h.c.copy(h.src.lc).multiplyScalar(h.src.g.scale.x).applyAxisAngle(Y, h.src.g.rotation.y).add(h.src.g.position);
}
const BACKUP_MAX = 7, LEAP = .3, NT = 2;   // NT = how many target tanks are shown at once
const vib = p => { if (!save.noVib && navigator.vibrate) try { navigator.vibrate(p); } catch (e) { } };   // the vibration switch of the settings pop-up
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
// additive light that also works on the transparent canvas (colour adds, canvas alpha is left untouched, so it never darkens the page behind)
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const $ = id => document.getElementById(id);

/* ============================== save ============================== */
const SAVE_KEY = 'findfish_v1'; let resetting = false;
const PLAYTEST = /[?&]playtest=1/.test(location.search), ORIG_RANDOM = Math.random;   // opened by the level editor: nothing is saved, tutorials are skipped
const save = { unlocked: 1, last: 1, stars: {}, muted: false, noMusic: false, noVib: false, tut: false };   // muted = sound effects off, noMusic = music off, noVib = no vibration
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { }
if (PLAYTEST) Object.assign(save, { tut: true, unlocked: 99, g1: 1, gRot: 1, gZoom: 1, gTilt: 1, iBackup: 1, iHint: 1, iTank: 1, iClear: 1, iSquid: 1, iClam: 1, iSwarm: 1, iPump: 1 });
const persist = () => { if (resetting || PLAYTEST) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } };
const MAX_LV = LV.length;
/* ---- level loop: after the last level the game plays sets of levels 11..X (X = the highest level when the set was made), the 3 obstacle tutorials left out, shuffled. A set is fixed once made, so new levels only appear in the next set ---- */
const LOOP_SKIP = [11, 21, 31];
function srcLvl(L) {
  if (L <= MAX_LV || PLAYTEST || PLAY_OVERRIDE) return Math.min(L, MAX_LV);
  const sets = save.loop = Array.isArray(save.loop) ? save.loop : []; let end = MAX_LV;
  for (const q of sets) end = q.from + q.ord.length - 1;
  while (end < L) {
    const from = end + 1, ord = []; for (let n = 11; n <= MAX_LV; n++) if (!LOOP_SKIP.includes(n)) ord.push(n);
    let sd = (from * 2654435761) >>> 0; const rnd = () => { sd = (sd + 0x6D2B79F5) >>> 0; let t = sd; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    for (let i = ord.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ord[i], ord[j]] = [ord[j], ord[i]]; }
    const prev = sets.length ? sets[sets.length - 1].ord[sets[sets.length - 1].ord.length - 1] : MAX_LV; if (ord[0] === prev && ord.length > 1) [ord[0], ord[1]] = [ord[1], ord[0]];
    sets.push({ from, max: MAX_LV, ord }); end = from + ord.length - 1; persist();
  }
  const q = sets.find(z => L >= z.from && L < z.from + z.ord.length); return q ? q.ord[L - q.from] : MAX_LV;
}

/* ============================== sound (WebAudio synth) ============================== */
const Snd = (() => {
  let ctx = null, master = null, musicG = null, noiseBuf = null;
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = save.muted ? 0 : .66; master.connect(ctx.destination); musicG = ctx.createGain(); musicG.gain.value = save.noMusic ? 0 : 1; musicG.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    loadSamples();
  }
  /* recorded sounds (public/sfx/*.m4a): decoded once, played through the same master gain; the old synthesised sounds remain for events that have no recording */
  const VOICE = {}, SFX = {}, SAMPLES = ['bgm_ap', 'sfx_backup_break', 'sfx_bad', 'sfx_bubble_hit_gauge', 'sfx_clam_snap', 'sfx_clam_tap_open', 'sfx_combo_word_1', 'sfx_combo_word_2', 'sfx_combo_word_3', 'sfx_combo_word_4', 'sfx_curtain_close', 'sfx_curtain_open', 'sfx_gauge_fill', 'sfx_pearl_bounce', 'sfx_pipe_close', 'sfx_pipe_open', 'sfx_splash', 'sfx_tap_water', 'sfx_win_swirl', 'sfx_win_bubble_pop', 'sfx_fish_spawn', 'sfx_fish_tap', 'sfx_fish_to_backup', 'sfx_fish_to_tank_or_vice_versa', 'sfx_hint', 'sfx_level_start', 'sfx_lose', 'sfx_play_on', 'sfx_popup_close', 'sfx_popup_open', 'sfx_squid', 'sfx_tank_complete', 'sfx_win', 'ui_button_click'];
  let sampling = false, bgm = null, bgmWant = false, bgmDuck = 1;
  function loadSamples() {
    if (sampling) return; sampling = true;
    for (const n of SAMPLES) fetch(new URL('sfx/' + n + '.m4a', document.baseURI)).then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no))).then(buf => { SFX[n] = buf; if (n === 'bgm_ap' && bgmWant) bgmStart(); }).catch(e => console.warn('sound ' + n + ' not loaded', e));
  }
  function sfx(n, o = {}) {   // vol: 0..1, rate: playback speed (a little random rate keeps repeated sounds from sounding identical)
    if (!ctx || save.muted || !SFX[n]) return false; const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = SFX[n]; src.playbackRate.value = o.rate ?? 1; g.gain.value = o.vol ?? 1; src.connect(g); g.connect(master); src.start(ctx.currentTime + (o.at || 0));
    if (o.mono) { const pv = VOICE[n]; if (pv) { try { pv.g.gain.setTargetAtTime(0, ctx.currentTime, .02); pv.src.stop(ctx.currentTime + .12); } catch (e) { } } VOICE[n] = { src, g }; }   /* a chain of the same sound: the previous one is cut short, so each step is heard on its own */
    return true;
  }
  /* background music: starts from the beginning with every level, ducks to half while a pop-up is open and comes back gradually, fades out slowly when the win / lose pop-up comes */
  function bgmStart() {
    bgmWant = true; if (!ctx || !SFX.bgm_ap) return; bgmKill(0);
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = SFX.bgm_ap; src.loop = true; g.gain.value = .0001; src.connect(g); g.connect(musicG || master); src.start();
    g.gain.setTargetAtTime(.4 * bgmDuck, ctx.currentTime, .4); bgm = { src, g };
  }
  function bgmKill(fade) { if (!bgm) return; const b = bgm; bgm = null; if (fade > 0 && ctx) { b.g.gain.cancelScheduledValues(ctx.currentTime); b.g.gain.setTargetAtTime(.0001, ctx.currentTime, fade / 3); setTimeout(() => { try { b.src.stop(); } catch (e) { } }, fade * 1000 + 100); } else { try { b.src.stop(); } catch (e) { } } }
  function bgmDuckTo(k) { bgmDuck = k; if (bgm && ctx) { bgm.g.gain.cancelScheduledValues(ctx.currentTime); bgm.g.gain.setTargetAtTime(.4 * k, ctx.currentTime, k < 1 ? 1.1 : 1.4); } }   // slowly down to 50%, gradually back up
  function bgmStop(fade = 1.8) { bgmWant = false; bgmKill(fade); }
  function tone(f, dur, o = {}) {
    if (!ctx) return; const { type = 'sine', vol = .18, to = null, at = 0 } = o, t = ctx.currentTime + at;
    const osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(f, t); if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + dur + .05);
  }
  function noise(dur, o = {}) {
    if (!ctx) return; const { vol = .12, f = 900, f2 = null, at = 0, type = 'lowpass', q = 1 } = o, t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); src.connect(fl); fl.connect(g); g.connect(master); src.start(t); src.stop(t + dur + .05);
  }
  function ambient() {
    const amb = ctx.createGain(); amb.gain.value = .55; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; amb.connect(lp); lp.connect(master);
    [110, 164.81, 220, 261.63, 329.63].forEach(f => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * (1 + (Math.random() - .5) * .004); const g = ctx.createGain(); g.gain.value = .03;
      const lfo = ctx.createOscillator(); lfo.frequency.value = .05 + Math.random() * .1; const lg = ctx.createGain(); lg.gain.value = .025; lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(amb); o.start(); lfo.start(); });
    const nz = ctx.createBufferSource(); nz.buffer = noiseBuf; nz.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 260; const ng = ctx.createGain(); ng.gain.value = .05; nz.connect(nf); nf.connect(ng); ng.connect(master); nz.start();
    (function blip() { if (!save.muted) tone(rand(500, 1300), .09, { vol: .03, to: rand(900, 2000) }); setTimeout(blip, rand(900, 3600)); })();
  }
  const SFX_MAP = { ui: ['ui_button_click', { vol: .8 }], miss: ['sfx_tap_water'], tapwater: ['sfx_tap_water'], bad: ['sfx_bad'], splash: ['sfx_splash'], pipeopen: ['sfx_pipe_open'], pipeclose: ['sfx_pipe_close'], clamtap: ['sfx_clam_tap_open'], clamsnap: ['sfx_clam_snap'], pearl: ['sfx_pearl_bounce'], gaugehit: ['sfx_bubble_hit_gauge'], gaugefill: ['sfx_gauge_fill'], swirl: ['sfx_win_swirl'], winpop: ['sfx_win_bubble_pop', { vol: .75 }], curtainclose: ['sfx_curtain_close'], curtainopen: ['sfx_curtain_open'], win: ['sfx_win'], lose: ['sfx_lose'], hint: ['sfx_hint'], tankdone: ['sfx_tank_complete'], levelstart: ['sfx_level_start'], squid: ['sfx_squid'], ftap: ['sfx_fish_tap'], tobackup: ['sfx_bad'], totank: ['sfx_fish_to_tank_or_vice_versa'], spawn: ['sfx_fish_spawn', { vol: .7 }], bbreak: ['sfx_backup_break'], playon: ['sfx_play_on'], popopen: ['sfx_popup_open'], popclose: ['sfx_popup_close'] };
  const NO_SOUND = new Set(['scatter', 'land', 'good', 'complete', 'junk', 'plip', 'start']);
  const arp = (notes, step, o = {}) => notes.forEach((f, i) => tone(f, .22, { type: 'triangle', vol: .16, at: i * step, ...o }));
  function play(n, o) {
    if (window.__sndLog) window.__sndLog.push(o && o.step != null ? n + '+note' + o.step : o && o.rate ? n + ':' + o.rate.toFixed(2) : n);
    if (!ctx || save.muted) return;
    if (n === 'combo') { sfx('sfx_combo_word_' + o.n, { vol: 3.6 }); return; }   /* the recordings are quiet (peak 0.07 against 0.36 for a fish tap): lifted to match */
       /* a chain of correct fish steps up through four recordings, then starts again */
    if (n === 'splash') { const nw = performance.now(); if (nw - (play.sp || 0) < 160) return; play.sp = nw; }   /* a crowd of fish leaving or entering the water at once is one splash, not ten stacked on top of each other */
    if (NO_SOUND.has(n)) return;   /* no recording for these: the old synthesised bleeps are gone */
    if (SFX_MAP[n] && sfx(SFX_MAP[n][0], { ...SFX_MAP[n][1], ...o })) return;   // the recorded sound if it is loaded, otherwise the synthesised one below
    switch (n) {
      case 'ui': tone(700, .05, { type: 'square', vol: .05 }); break;
      case 'miss': tone(520, .1, { to: 240, vol: .1 }); noise(.08, { vol: .05, f: 1500, type: 'bandpass' }); break;
      case 'scatter': noise(.4, { vol: .1, f: 400, f2: 3500, type: 'bandpass', q: 1.5 }); tone(260, .3, { to: 900, vol: .07, type: 'triangle' }); break;
      case 'good': tone(660, .1, { type: 'triangle', vol: .16 }); tone(990, .14, { type: 'triangle', vol: .14, at: .07 }); break;
      case 'bad': tone(230, .25, { type: 'sawtooth', to: 110, vol: .1 }); noise(.12, { vol: .08, f: 600 }); break;
      case 'junk': tone(170, .32, { type: 'square', to: 70, vol: .09 }); noise(.2, { vol: .12, f: 400 }); break;
      case 'land': tone(900, .06, { vol: .09 }); break;
      case 'complete': arp([523, 659, 784, 1047], .08); break;
      case 'win': arp([523, 659, 784, 1047, 1319, 1568], .09); tone(1047, .8, { vol: .08, at: .55, type: 'sine' }); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(f, .3, { type: 'sawtooth', vol: .07, at: i * .16 })); break;
      case 'hint': tone(1200, .1, { vol: .1 }); tone(1700, .14, { vol: .1, at: .09 }); break;
      case 'splash': noise(.28, { vol: .11, f: 1200, f2: 3200, type: 'bandpass', q: .8 }); tone(720, .14, { to: 300, vol: .08 }); break;
      case 'plip': tone(1100, .09, { to: 520, vol: .09 }); noise(.07, { vol: .05, f: 2200, type: 'bandpass' }); break;
      case 'start': tone(440, .3, { to: 880, vol: .08, type: 'triangle' }); break;
    }
  }
  function setMuted(m) { save.muted = m; persist(); if (master) master.gain.value = m ? 0 : .66; }
  function setMusic(on) { save.noMusic = !on; persist(); if (musicG) musicG.gain.value = on ? 1 : 0; }
  return { init, play, setMuted, setMusic, sfx, bgmStart, bgmStop, bgmDuckTo };
})();
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => Snd.init(), { passive: true }));

/* ============================== species ============================== */
// body = [length, height, width] multipliers, pat = pattern on body texture
const SPECIES = []; let BASE_N = 0; const BASE = [];   // the species are the 3D models (the 49 fish of public/models/fish), added by loadFish; BASE_N counts them once they are all in (colour variants are added after that)
const FISHART = {};   // id -> { tex, geo, hx, hy, hz }
/* Fish are the supplied illustrations, "inflated" into real 3D: the alpha silhouette is turned into a puffy volume (thick in the middle,
   thin at fins and tail), the painting is mapped on both faces, and it is lit like any 3D model. */
function hueRGB(c, deg) {   // the same colour turn as hueRotate, for one colour (0-1 values)
  const rad = deg * Math.PI / 180, k = Math.cos(rad), n = Math.sin(rad), [r, g, b] = c, m = [.213 + k * .787 - n * .213, .715 - k * .715 - n * .715, .072 - k * .072 + n * .928, .213 - k * .213 + n * .143, .715 + k * .285 + n * .140, .072 - k * .072 - n * .283, .213 - k * .213 - n * .787, .715 - k * .715 + n * .715, .072 + k * .928 + n * .072];
  return [0, 1, 2].map(o => Math.max(0, Math.min(1, m[o * 3] * r + m[o * 3 + 1] * g + m[o * 3 + 2] * b)));
}
function hueRotate(cnv, deg) {   /* recolour a canvas: every hue is turned, AND the parts with almost no colour (a white or silver fish, grey stripes) are washed with a little of the new hue - turning the hue alone leaves a grey fish exactly as it was, so two copies of a white species stayed identical */
  const g = cnv.getContext('2d', { willReadFrequently: true }), d = g.getImageData(0, 0, cnv.width, cnv.height), p = d.data, rad = deg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
  const a0 = .213 + c * .787 - s * .213, a1 = .715 - c * .715 - s * .715, a2 = .072 - c * .072 + s * .928, b0 = .213 - c * .213 + s * .143, b1 = .715 + c * .285 + s * .140, b2 = .072 - c * .072 - s * .283, c0 = .213 - c * .213 - s * .787, c1 = .715 - c * .715 + s * .715, c2 = .072 + c * .928 + s * .072;
  const T = hueRGB([1, 0, 0], deg), Tl = Math.max(.05, .213 * T[0] + .715 * T[1] + .072 * T[2]), Tn = T.map(v => v / Tl), W = Math.min(.62, Math.abs(((deg % 360) + 360) % 360 - 180) / 180 * 0 + .62);   // the wash colour of this hue, at the brightness of the pixel it tints
  for (let i = 0; i < p.length; i += 4) { const r = p[i], g2 = p[i + 1], b = p[i + 2];
    let R = Math.max(0, Math.min(255, a0 * r + a1 * g2 + a2 * b)), G = Math.max(0, Math.min(255, b0 * r + b1 * g2 + b2 * b)), B = Math.max(0, Math.min(255, c0 * r + c1 * g2 + c2 * b));
    if (p[i + 3] > 8) { const mx = Math.max(R, G, B), mn = Math.min(R, G, B), sat = mx ? (mx - mn) / mx : 0, w = W * Math.max(0, 1 - sat / .3);   // only what has little colour of its own is washed; a bright red fin keeps its own turned hue
      if (w > .002) { const L = .213 * R + .715 * G + .072 * B; R += (Math.min(255, L * Tn[0]) - R) * w; G += (Math.min(255, L * Tn[1]) - G) * w; B += (Math.min(255, L * Tn[2]) - B) * w; } }
    p[i] = R; p[i + 1] = G; p[i + 2] = B; }
  g.putImageData(d, 0, 0);
}
function findEye(px, W, H, bw, bh) {   // the big white, round blob with a dark pupil
  const white = new Uint8Array(W * H), lab = new Int32Array(W * H);
  for (let k = 0; k < W * H; k++) { const r = px[k * 4], g = px[k * 4 + 1], b = px[k * 4 + 2], a = px[k * 4 + 3]; white[k] = a > 230 && r > 200 && g > 200 && b > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 40 ? 1 : 0; }
  let best = null, id = 0;
  for (let s = 0; s < W * H; s++) { if (!white[s] || lab[s]) continue; id++; const st = [s]; lab[s] = id; let area = 0, sx = 0, sy = 0, mnx = W, mxx = 0, mny = H, mxy = 0;
    while (st.length) { const k = st.pop(), x = k % W, y = (k / W) | 0; area++; sx += x; sy += y; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
      for (const n of [k - 1, k + 1, k - W, k + W]) if (n >= 0 && n < W * H && white[n] && !lab[n] && Math.abs((n % W) - x) < 2) { lab[n] = id; st.push(n); } }
    const w = mxx - mnx + 1, h = mxy - mny + 1, fill = area / (w * h), asp = w / h; if (area < 25 || fill < .18 || asp < .65 || asp > 1.5 || w < bw * .05 || w > bw * .4) continue;
    let dark = 0; for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) { const k = y * W + x; if (px[k * 4 + 3] > 200 && px[k * 4] + px[k * 4 + 1] + px[k * 4 + 2] < 210) dark++; } if (dark < area * .25) continue;
    if (!best || dark > best.dark) best = { dark, x: (mnx + mxx) / 2, y: (mny + mxy) / 2, r: Math.max(w, h) / 2 * 1.2 }; }
  if (!best) return null;
  let rs = 0, gs = 0, bs = 0, n = 0; for (let y = Math.max(0, best.y - best.r * 1.7 | 0); y < Math.min(H, best.y + best.r * 1.7); y++) for (let x = Math.max(0, best.x - best.r * 1.7 | 0); x < Math.min(W, best.x + best.r * 1.7); x++) { const d = Math.hypot(x - best.x, y - best.y), k = y * W + x; if (d > best.r * 1.2 && d < best.r * 1.7 && px[k * 4 + 3] > 220) { rs += px[k * 4]; gs += px[k * 4 + 1]; bs += px[k * 4 + 2]; n++; } }
  best.col = n > 8 ? [rs / n, gs / n, bs / n] : null; return best.col ? best : null;
}
function styleCanvas(c) {   // darker outline + a touch more contrast/saturation so the (soft, AI-made) art reads clearly against the water
  const W = c.width, H = c.height, o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d');
  const sil = document.createElement('canvas'); sil.width = W; sil.height = H; const sg = sil.getContext('2d'); try { sg.filter = `brightness(${FISH_LOOK.dark}) saturate(1.25)`; } catch (e) { } sg.drawImage(c, 0, 0); sg.filter = 'none'; sg.globalCompositeOperation = 'source-atop'; sg.fillStyle = 'rgba(8,28,54,.28)'; sg.fillRect(0, 0, W, H);   // outline = the fish's own colours, darkened (keeps it soft and 3D instead of a flat black line)
  const r = Math.max(3, Math.round(Math.max(W, H) * FISH_LOOK.outline));
  for (let i = 0; i < 24; i++) { const a = i / 24 * 6.2832; g.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r); g.drawImage(sil, Math.cos(a) * r * .55, Math.sin(a) * r * .55); }
  try { g.filter = `brightness(${FISH_LOOK.bright}) contrast(${FISH_LOOK.contrast}) saturate(${FISH_LOOK.sat})`; } catch (e) { }
  g.drawImage(c, 0, 0); try { g.filter = 'none'; } catch (e) { } return o;
}
const FISH_LOOK = { dark: .5, outline: .0045, contrast: 1.04, sat: .95, bright: .93 };   // tuning knobs for fish readability
// exact Euclidean distance transform (Felzenszwalb & Huttenlocher): squared distance from every cell to the nearest cell whose value is 0
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) { let sv; for (;;) { const p = v[k]; sv = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (sv <= z[k]) k--; else break; } k++; v[k] = q; z[k] = sv; z[k + 1] = 1e20; }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
}
function edt2d(f, W, H) {
  const out = new Float64Array(W * H), n = Math.max(W, H), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), col = new Float64Array(n);
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) col[y] = f[y * W + x]; edt1d(col, H, d, v, z); for (let y = 0; y < H; y++) out[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) col[x] = out[y * W + x]; edt1d(col, W, d, v, z); for (let x = 0; x < W; x++) out[y * W + x] = d[x]; }
  return out;
}
// Colour texture for the fish body: the picture painted over its own colours smeared outwards (no empty texels around the outline, so a mesh edge that bulges
// a little past the true outline never samples "transparent black"), plus a separate mask (a bit wider than the picture) that decides what is cut away.
function colorCanvas(c, avg) {
  const W = c.width, H = c.height, o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d');
  const f = document.createElement('canvas'); f.width = W; f.height = H; const fg = f.getContext('2d');
  try { fg.filter = `brightness(${FISH_LOOK.bright}) contrast(${FISH_LOOK.contrast}) saturate(${FISH_LOOK.sat})`; } catch (e) { } fg.drawImage(c, 0, 0); try { fg.filter = 'none'; } catch (e) { }
  g.fillStyle = `rgb(${avg[0] | 0},${avg[1] | 0},${avg[2] | 0})`; g.fillRect(0, 0, W, H);
  const rmax = Math.max(6, Math.round(Math.max(W, H) * .02));
  for (let r = rmax; r >= 2; r -= Math.max(2, rmax / 5)) for (let i = 0; i < 28; i++) { const a = i / 28 * 6.2832; g.drawImage(f, Math.cos(a) * r, Math.sin(a) * r); }
  g.drawImage(f, 0, 0); return o;
}
function maskCanvas(whiteSil) {   // black background, white silhouette grown by ~3 px (the grid mesh edge is made of straight chords)
  const W = whiteSil.width, H = whiteSil.height, o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); const r = Math.max(4, Math.max(W, H) * .009);   // wide enough to cover the chords of sharp tips (nose, tail)
  for (const rr of [r, r * .7, r * .4]) for (let i = 0; i < 16; i++) { const a = i / 16 * 6.2832; g.drawImage(whiteSil, Math.cos(a) * rr, Math.sin(a) * rr); }
  g.drawImage(whiteSil, 0, 0); return o;
}
function prepFish(sp, im) {
  if (sp.hue !== undefined) {   // look-alike colour variant: same body, different colours
    const bs = FISHART[sp.base], c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); hueRotate(c, sp.hue);
    const tex = new THREE.CanvasTexture(colorCanvas(c, bs.avg || [128, 128, 128])); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const sc2 = c.cloneNode ? c : c; THUMB[sp.id] = (() => { const t = document.createElement('canvas'); t.width = bs.bw; t.height = bs.bh; t.getContext('2d').drawImage(c, bs.x0, bs.y0, bs.bw, bs.bh, 0, 0, bs.bw, bs.bh); return t.toDataURL('image/png'); })();
    let eye = null; if (bs.eye) { const e = bs.eye; eye = Object.assign({}, e); const cc = document.createElement('canvas'); cc.width = 1; cc.height = 1; const gg = cc.getContext('2d'); gg.fillStyle = `rgb(${e.col[0] | 0},${e.col[1] | 0},${e.col[2] | 0})`; gg.fillRect(0, 0, 1, 1); const hc = document.createElement('canvas'); hc.width = hc.height = 1; hc.getContext('2d').drawImage(cc, 0, 0); hueRotate(hc, sp.hue); const pd = hc.getContext('2d').getImageData(0, 0, 1, 1).data; eye.col = [pd[0], pd[1], pd[2]]; }
    FISHART[sp.id] = Object.assign({}, bs, { tex, eye, sil: bs.sil }); return;
  }
  const W = im.width, H = im.height, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const px = g.getImageData(0, 0, W, H).data, A = (x, y) => px[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4 + 3];
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1; const eyeRaw = findEye(px, W, H, bw, bh);
  // cropped thumbnail for the UI
  const tc = document.createElement('canvas'); tc.width = bw; tc.height = bh; tc.getContext('2d').drawImage(c, x0, y0, bw, bh, 0, 0, bw, bh); THUMB[sp.id] = tc.toDataURL('image/png');
  // ---- body volume: ONE closed, welded surface that follows the true outline of the picture ----
  // The mask is the picture's own outline. The dark toon outline is NOT part of the volume (seen edge-on it showed up as a black, striped tear); a thin inverted hull draws it (see buildFish).
  const SA = A;
  const pad = 3, X0 = Math.max(0, x0 - pad), Y0 = Math.max(0, y0 - pad), X1 = Math.min(W - 1, x1 + pad), Y1 = Math.min(H - 1, y1 + pad), cw = X1 - X0 + 1, ch = Y1 - Y0 + 1;
  const ws = Math.min(1, 200 / Math.max(cw, ch)), Wd = Math.max(2, Math.round(cw * ws)), Hd = Math.max(2, Math.round(ch * ws));   // working resolution for the distance field
  const INF = 1e20, fin = new Float64Array(Wd * Hd), fout = new Float64Array(Wd * Hd), ins = new Uint8Array(Wd * Hd);
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) { const on = SA(Math.round(X0 + (i + .5) / ws - .5), Math.round(Y0 + (j + .5) / ws - .5)) > 127 ? 1 : 0, k = j * Wd + i; ins[k] = on; fin[k] = on ? INF : 0; fout[k] = on ? 0 : INF; }
  const dIn = edt2d(fin, Wd, Hd), dOut = edt2d(fout, Wd, Hd), sdf = new Float32Array(Wd * Hd);
  for (let k = 0; k < Wd * Hd; k++) sdf[k] = (ins[k] ? Math.sqrt(dIn[k]) - .5 : -(Math.sqrt(dOut[k]) - .5)) / ws;   // image pixels, + inside
  const sdAt = (X, Y) => { const u = Math.min(Wd - 1.001, Math.max(0, (X - X0) * ws - .5)), v = Math.min(Hd - 1.001, Math.max(0, (Y - Y0) * ws - .5)), i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * Wd + i;
    return (sdf[k] * (1 - fu) + sdf[k + 1] * fu) * (1 - fv) + (sdf[k + Wd] * (1 - fu) + sdf[k + Wd + 1] * fu) * fv; };
  const GN = 40, cell = Math.max(cw, ch) / GN, gx = Math.ceil(cw / cell) + 1, gy = Math.ceil(ch / cell) + 1;
  const sc = (sp.len || (Math.max(bw, bh) / Math.min(bw, bh) < 1.25 ? .46 : .58)) / Math.max(bw, bh), T = sp.thick || .085, Rr = Math.max(4, Math.max(bw, bh) * (sp.round || .22));
  const sdv = new Float32Array(gx * gy), vx = new Float32Array(gx * gy), vy = new Float32Array(gx * gy), real = new Uint8Array(gx * gy), onC = new Uint8Array(gx * gy), inX = new Float32Array(gx * gy), inY = new Float32Array(gx * gy);   // inX/inY: direction towards the inside, for the outline vertices
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) { const k = j * gx + i; vx[k] = X0 + i * cell; vy[k] = Y0 + j * cell; sdv[k] = sdAt(vx[k], vy[k]); real[k] = sdv[k] > 0 ? 1 : 0; }
  const nearReal = (i, j) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < gx && jj < gy && real[jj * gx + ii]) return true; } return false; };
  const e = cell * .3;
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {   // vertices outside (or hugging) the outline are moved onto the outline itself
    const k = j * gx + i, d = sdv[k]; if (d > cell * .55 || (d <= 0 && !nearReal(i, j))) continue;
    const gX = sdAt(vx[k] + e, vy[k]) - sdAt(vx[k] - e, vy[k]), gY = sdAt(vx[k], vy[k] + e) - sdAt(vx[k], vy[k] - e), gl = Math.hypot(gX, gY); if (gl < 1e-4) continue;
    vx[k] += gX / gl * -d; vy[k] += gY / gl * -d; sdv[k] = 0; onC[k] = 1; inX[k] = gX / gl; inY[k] = gY / gl;
  }
  const prof = u => { u = Math.min(1, Math.max(0, u)); return Math.sqrt(1 - (1 - u) * (1 - u)); };   // circular edge: the surface leaves the outline sideways, so front and back meet without a crease
  let hgt = new Float32Array(gx * gy); for (let k = 0; k < gx * gy; k++) hgt[k] = onC[k] || !real[k] ? 0 : prof(sdv[k] / Rr);
  { const nh = hgt.slice(); for (let j = 1; j < gy - 1; j++) for (let i = 1; i < gx - 1; i++) { const k = j * gx + i; if (onC[k] || !real[k]) continue; nh[k] = (hgt[k] * 4 + hgt[k - 1] + hgt[k + 1] + hgt[k - gx] + hgt[k + gx]) / 8; } hgt = nh; }
  const pos = [], uv = [], idx = [], vid = new Int32Array(gx * gy * 2).fill(-1), cx = bw / 2, cy = bh / 2;
  // The rounded edge is made of real rows of vertices (not one steep triangle): rows at these distances inside the outline, each lifted by the circular profile.
  const BV = [.02, .06, .12, .2, .3, .42].map(f => f * cell), innerRow = BV.length, bevV = new Map();
  // Near the edge the picture has a pale anti-aliased fringe; seen along the rim it would show as light bands. So vertices close to the edge read the picture a few pixels
  // further inside, fading smoothly to the normal mapping a short way in (no new seam).
  const uvShift0 = Math.max(4, Math.max(W, H) * .008), uvFade = cell * .9;
  const addRaw = (X, Y, z, sd) => {
    let U = X, V = Y;
    if (sd < uvFade) { const gX = sdAt(X + 1.5, Y) - sdAt(X - 1.5, Y), gY = sdAt(X, Y + 1.5) - sdAt(X, Y - 1.5), gl = Math.hypot(gX, gY); if (gl > 1e-4) { const f = uvShift0 * (1 - smooth01(sd / uvFade)); U += gX / gl * f; V += gY / gl * f; } }
    pos.push(-(X - x0 - cx) * sc, -(Y - y0 - cy) * sc, z); uv.push(U / W, 1 - V / H); return pos.length / 3 - 1;
  };
  const bev = (k, side, row) => { const key = k * 32 + (row === 0 ? 0 : (side > 0 ? row : 16 + row)); let v = bevV.get(key); if (v !== undefined) return v;   // row 0 = the outline itself, shared by the front and the back
    v = row === 0 ? addRaw(vx[k], vy[k], 0, 0) : addRaw(vx[k] + inX[k] * BV[row - 1], vy[k] + inY[k] * BV[row - 1], side * T * prof(BV[row - 1] / Rr), BV[row - 1]); bevV.set(key, v); return v; };
  const addV = (k, side) => { if (onC[k]) return bev(k, side, innerRow); const key = k * 2 + (side > 0 ? 0 : 1); if (vid[key] >= 0) return vid[key]; return (vid[key] = addRaw(vx[k], vy[k], hgt[k] * T * side, sdv[k])); };
  const cellKs = (i, j) => [j * gx + i, j * gx + i + 1, (j + 1) * gx + i, (j + 1) * gx + i + 1], okCell = new Uint8Array((gx - 1) * (gy - 1));
  for (let j = 0; j < gy - 1; j++) for (let i = 0; i < gx - 1; i++) {
    const ks = cellKs(i, j); let ok = true;
    if (ks.some(k => !real[k] && !onC[k]) || ks.every(k => !real[k])) ok = ks.every(k => real[k] || onC[k]) && ks.filter(k => onC[k]).length >= 3;   // thin parts (fins, tail tips) can be made of outline vertices only: keep those flat cells instead of leaving holes
    okCell[j * (gx - 1) + i] = ok ? 1 : 0;
  }
  const isOk = (i, j) => i >= 0 && j >= 0 && i < gx - 1 && j < gy - 1 && okCell[j * (gx - 1) + i] === 1, edges = [];
  for (let j = 0; j < gy - 1; j++) for (let i = 0; i < gx - 1; i++) {
    if (!isOk(i, j)) continue; const [k0, k1, k2, k3] = cellKs(i, j);
    for (const side of [1, -1]) { const a = addV(k0, side), b = addV(k1, side), c2 = addV(k2, side), d = addV(k3, side); if (side > 0) idx.push(a, b, d, a, d, c2); else idx.push(a, d, b, a, c2, d); }
    if (!isOk(i, j - 1) && onC[k0] && onC[k1]) edges.push([k0, k1]);   // edges on the border of the mesh get the rounded rim strip
    if (!isOk(i, j + 1) && onC[k2] && onC[k3]) edges.push([k2, k3]);
    if (!isOk(i - 1, j) && onC[k0] && onC[k2]) edges.push([k0, k2]);
    if (!isOk(i + 1, j) && onC[k1] && onC[k3]) edges.push([k1, k3]);
  }
  const pushTri = (a, b, c, ref) => {   // winding chosen so the face points the way `ref` does (outwards and towards the face side)
    const ux_ = pos[b * 3] - pos[a * 3], uy_ = pos[b * 3 + 1] - pos[a * 3 + 1], uz_ = pos[b * 3 + 2] - pos[a * 3 + 2], vx_ = pos[c * 3] - pos[a * 3], vy_ = pos[c * 3 + 1] - pos[a * 3 + 1], vz_ = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy_ * vz_ - uz_ * vy_, ny = uz_ * vx_ - ux_ * vz_, nz = ux_ * vy_ - uy_ * vx_;
    if (nx * ref[0] + ny * ref[1] + nz * ref[2] < 0) idx.push(a, c, b); else idx.push(a, b, c);
  };
  for (const [ka, kb] of edges) for (const side of [1, -1]) for (let r = 0; r < innerRow; r++) {
    const a0 = bev(ka, side, r), b0 = bev(kb, side, r), a1 = bev(ka, side, r + 1), b1 = bev(kb, side, r + 1), ref = [(inX[ka] + inX[kb]) * .5, (inY[ka] + inY[kb]) * .5, side * .8];
    pushTri(a0, b0, b1, ref); pushTri(a0, b1, a1, ref);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  let ar = 0, ag = 0, ab = 0, an = 0; for (let y = y0; y <= y1; y += 3) for (let x = x0; x <= x1; x += 3) { const k = (y * W + x) * 4; if (px[k + 3] > 200) { ar += px[k]; ag += px[k + 1]; ab += px[k + 2]; an++; } }
  const avg = an ? [ar / an, ag / an, ab / an] : [128, 128, 128];
  const tex = new THREE.CanvasTexture(colorCanvas(c, avg)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const sc2 = document.createElement('canvas'); sc2.width = W; sc2.height = H; { const sg = sc2.getContext('2d'); sg.drawImage(im, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#fff'; sg.fillRect(0, 0, W, H); }
  const sil = new THREE.CanvasTexture(sc2), mask = new THREE.CanvasTexture(maskCanvas(sc2)); mask.minFilter = THREE.LinearFilter; mask.generateMipmaps = false;
  let eye = null; if (eyeRaw) { eye = { x: -(eyeRaw.x - x0 - cx) * sc, y: -(eyeRaw.y - y0 - cy) * sc, r: eyeRaw.r * sc, z: prof(sdAt(eyeRaw.x, eyeRaw.y) / Rr) * T + .003, col: eyeRaw.col }; }
  let er = 0, eg = 0, eb = 0, en = 0; for (let y = y0; y <= y1; y += 3) for (let x = x0; x <= x1; x += 3) { const k = (y * W + x) * 4; if (px[k + 3] > 200) { er += px[k]; eg += px[k + 1]; eb += px[k + 2]; en++; } }
  const edge = en ? [er / en / 255 * .3, eg / en / 255 * .3, eb / en / 255 * .34] : [.05, .08, .12];   // outline colour: a dark shade of the fish's own colours
  FISHART[sp.id] = { tex, sil, mask, avg, geo, hx: bw * sc / 2, hy: bh * sc / 2, hz: T, eye, bw, bh, x0, y0, edge };
}
function hoverPad(a) { return Math.max(5, Math.round(Math.max(a.bw, a.bh) * .055)); }
function hoverRimTex(id) {   // a gold glowing silhouette of the fish, slightly bigger than it, drawn once per species (mirrored because the fish mesh is)
  const a = FISHART[id]; if (a.rimTex) return a.rimTex;
  const pad = hoverPad(a), CW = a.bw + 2 * pad, CH = a.bh + 2 * pad, src = a.sil.image;   // the white silhouette (the colour texture is opaque now)
  const t = document.createElement('canvas'); t.width = a.bw; t.height = a.bh; const tg = t.getContext('2d'); tg.drawImage(src, a.x0, a.y0, a.bw, a.bh, 0, 0, a.bw, a.bh); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#ffd21a'; tg.fillRect(0, 0, a.bw, a.bh);
  const c = document.createElement('canvas'); c.width = CW; c.height = CH; const g = c.getContext('2d'); g.translate(CW, 0); g.scale(-1, 1);
  for (let r = pad; r >= pad * .45; r -= pad * .11) { g.globalAlpha = r > pad * .7 ? .13 : .5; for (let k = 0; k < 28; k++) { const an = k / 28 * 6.2832; g.drawImage(t, pad + Math.cos(an) * r, pad + Math.sin(an) * r); } }   // soft outer glow fading in to a solid rim
  g.globalAlpha = 1; for (let k = 0; k < 28; k++) { const an = k / 28 * 6.2832, r = pad * .5; g.drawImage(t, pad + Math.cos(an) * r, pad + Math.sin(an) * r); }
  const t2 = document.createElement('canvas'); t2.width = a.bw; t2.height = a.bh; const t2g = t2.getContext('2d'); t2g.drawImage(t, 0, 0); t2g.globalCompositeOperation = 'source-in'; t2g.fillStyle = '#fff8d6'; t2g.fillRect(0, 0, a.bw, a.bh);   // thin warm-white core so the rim still reads on yellow/orange fish
  for (let k = 0; k < 28; k++) { const an = k / 28 * 6.2832, r = pad * .26; g.drawImage(t2, pad + Math.cos(an) * r, pad + Math.sin(an) * r); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return (a.rimTex = tex);
}
function artFor(list) {
  return Promise.all(list.map(i => new Promise(res => { const sp = SPECIES[i], im = new Image(); im.onload = () => { sp.img = im; try { prepFish(sp, im); } catch (e) { console.warn('no flat art for ' + sp.id, e); } res(); }; im.onerror = () => res(); im.src = THUMB[sp.id]; }))).then(() => { for (const i of list) if (!BASE.includes(i)) BASE.push(i); BASE_N = BASE.length; });
}
const FAM = {};
function famOf(i) {   // the colour family of a species (its texture's average hue): red, orange, yellow, green, cyan, blue or purple/pink
  const sp = SPECIES[i], key = sp && sp.model3d; if (!key) return 'x'; if (FAM[key]) return FAM[key];
  const im = MODEL3D[key] && MODEL3D[key].img; if (!im) return 'x';
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; let x = 0, y = 0, n = 0;
  for (let q = 0; q < d.length; q += 4) { if (d[q + 3] < 200) continue; const r = d[q] / 255, gg = d[q + 1] / 255, b = d[q + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0; if (sat < .3 || mx < .25) continue;
    const dd = mx - mn; let h = mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4; h *= 60; const w = sat * mx; x += Math.cos(h * Math.PI / 180) * w; y += Math.sin(h * Math.PI / 180) * w; n++; }
  const h = n ? (Math.atan2(y, x) * 180 / Math.PI + 360) % 360 : -1;
  return (FAM[key] = h < 0 ? 'x' : (h < 20 || h >= 340) ? 'red' : h < 45 ? 'orange' : h < 70 ? 'yellow' : h < 165 ? 'green' : h < 200 ? 'cyan' : h < 255 ? 'blue' : 'pink');
}
function diverse(list) {   // shuffle, then deal the species round by round from the colour families, so a level never piles up one colour (the first ones, the target species, always differ in colour)
  const by = {}; for (const i of shuffle(list)) (by[famOf(i)] = by[famOf(i)] || []).push(i);
  const out = []; let fams = Object.keys(by);
  while (fams.length) { for (const f of shuffle(fams)) out.push(by[f].shift()); fams = fams.filter(f => by[f].length); }
  return out;
}
function prepModelArt() {
  return artFor(SPECIES.map((_, i) => i));
}
function variantOf(typeIdx, deg) {   // a look-alike of a species with shifted colours (created on demand)
  if (SPECIES[typeIdx].model3d) return modelVariant(typeIdx, deg);
  const base = SPECIES[typeIdx], id = base.id + '_h' + Math.round(deg), k = SPECIES.findIndex(s => s.id === id); if (k >= 0) return k;
  const sp = { id, base: base.id, hue: deg, img: base.img }; SPECIES.push(sp); prepFish(sp, base.img); return SPECIES.length - 1;
}



/* ---- real 3D fish models: FBX with a skeleton and a swim clip. They are extra species ('m_<key>'), kept out of the random pool; a level picks one with `onlyFish`. ---- */
const MODEL3D = {}, MODEL_IDX = {};
// The FBX carries 8 skinned meshes, each with its own copy of the whole bone chain (121 nodes). Merge the meshes into one and drop the unused bone copies:
// 1 draw call, 1 skeleton and 14 bones per fish instead of 8, 8 and 121 (looks identical, far cheaper on phones).
function slimModel(obj) {
  const sk = []; obj.traverse(n => { if (n.isSkinnedMesh) sk.push(n); }); if (sk.length < 2) return;
  const skip = why => console.warn('3D fish: meshes were NOT merged (' + why + '): it still works but costs more draw calls. Keep the same export setup as Blue_white_babe.fbx.');
  const first = {}; obj.traverse(n => { if (n.isBone && !first[n.name]) first[n.name] = n; });
  const ref = sk.find(m => m.skeleton.bones.every(b => first[b.name] === b)); if (!ref) return skip('no mesh is bound to the outermost bones');   // the skeleton that sits on the outermost bones (the ones the clip drives)
  const names = ref.skeleton.bones.map(b => b.name).join(','), keys = Object.keys(ref.geometry.attributes).join(',');
  if (sk.some(m => m.geometry.index || m.skeleton.bones.map(b => b.name).join(',') !== names || Object.keys(m.geometry.attributes).join(',') !== keys || !m.bindMatrix.equals(ref.bindMatrix))) return skip('the meshes differ in bones, attributes or bind pose');
  let merged = mergeGeometries(sk.map(m => m.geometry), false); if (!merged) return skip('the geometries could not be combined');
  try { merged = mergeVertices(merged, 1e-4); } catch (e) { }   // index it: shared vertices are shaded and skinned once (the file stores 3 vertices for every triangle)
  const mesh = new THREE.SkinnedMesh(merged, ref.material); mesh.name = 'Fish'; mesh.position.copy(ref.position); mesh.quaternion.copy(ref.quaternion); mesh.scale.copy(ref.scale); mesh.bind(ref.skeleton, ref.bindMatrix);
  ref.parent.add(mesh); for (const m of sk) m.parent.remove(m);
  const keep = new Set(); for (const b of ref.skeleton.bones) for (let n = b; n && n !== obj; n = n.parent) keep.add(n);
  const rm = []; obj.traverse(n => { if (n.isBone && !keep.has(n)) rm.push(n); }); for (const n of rm) if (n.parent) n.parent.remove(n);
}
function scanEyeTex(img, loose, big) {   // finds every eye picture on a Tripo texture (a compact dark pupil with a small white highlight beside it) and returns a copy of the texture with those eyeballs painted over in the colour of the skin around them (the blink fades between the two), or null
  const DK = loose ? 128 : 95, WL = loose ? 195 : 222, WM = loose ? 160 : 195, S = 512, cv = document.createElement('canvas'); cv.width = S; cv.height = S; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, S, S);
  const D = cx.getImageData(0, 0, S, S).data, lum = new Float32Array(S * S), wh = new Uint8Array(S * S), lab = new Int32Array(S * S);
  for (let i = 0; i < S * S; i++) { const r = D[i * 4], g = D[i * 4 + 1], b = D[i * 4 + 2]; lum[i] = .299 * r + .587 * g + .114 * b; wh[i] = lum[i] > WL && Math.min(r, g, b) > WM ? 1 : 0; }
  const eyes = [], stack = []; let nl = 0;
  for (let i0 = 0; i0 < S * S; i0++) {
    if (lab[i0] || lum[i0] >= DK) continue; nl++; let a = 0, sx = 0, sy = 0, x0 = S, x1 = 0, y0 = S, y1 = 0; stack.push(i0); lab[i0] = nl;
    while (stack.length) { const i = stack.pop(), x = i % S, y = (i / S) | 0; a++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [i - 1, i + 1, i - S, i + S]) if (j >= 0 && j < S * S && !lab[j] && lum[j] < DK && !((j - i === 1 && x === S - 1) || (j - i === -1 && x === 0))) { lab[j] = nl; stack.push(j); } }
    const w = x1 - x0 + 1, h = y1 - y0 + 1; if (a < (big ? 1500 : 20) || a > (big ? 60000 : 2600) || Math.max(w, h) / Math.min(w, h) > (big ? 1.35 : 2) || a < (big ? .6 : .45) * w * h) continue;
    if (big) { eyes.push({ x: sx / a, y: sy / a, r: Math.sqrt(a / Math.PI), R: Math.sqrt(a / Math.PI) * 1.9 }); continue; }   // a big eyeball picture (the ChatGPT / Codex fish): a big round dark pupil, no small highlight to look for
   
    const ex = sx / a, ey = sy / a, r = Math.sqrt(a / Math.PI); let nw = 0, wmax = 0, wA = 0; const Rs = Math.ceil(r * 3.8);
    for (let y = Math.max(0, Math.floor(ey - Rs)); y <= Math.min(S - 1, Math.ceil(ey + Rs)); y++) for (let x = Math.max(0, Math.floor(ex - Rs)); x <= Math.min(S - 1, Math.ceil(ex + Rs)); x++) { const d = Math.hypot(x - ex, y - ey); if (d > Rs || !wh[y * S + x]) continue; if (d < r * 2.4) nw++; wA++; if (d > wmax) wmax = d; }
    if (nw < (loose ? 1 : 2) || nw > .5 * Math.PI * (r * 2.4) ** 2) continue;   // a highlight is a few white pixels, not a field of them (the white stripes of a fish)
    eyes.push({ x: ex, y: ey, r, R: Math.min(r * 4.2, Math.max(r * 2.5, wmax * 1.25)) });
  }
  if (!eyes.length) return null;
  const out = document.createElement('canvas'); out.width = img.width; out.height = img.height; const og = out.getContext('2d'); og.drawImage(img, 0, 0); const k = img.width / S;
  for (const e of eyes) {   // the skin colour: the average of the ring just outside the eyeball, without the white and dark pictures
    let sr = 0, sg = 0, sb = 0, n = 0; for (let t = 0; t < 40; t++) for (const f of [1.25, 1.5, 1.75]) { const x = Math.round(e.x + Math.cos(t / 40 * 6.283) * e.R * f), y = Math.round(e.y + Math.sin(t / 40 * 6.283) * e.R * f); if (x < 0 || y < 0 || x >= S || y >= S) continue; const i = y * S + x; if (wh[i] || lum[i] < DK) continue; sr += D[i * 4]; sg += D[i * 4 + 1]; sb += D[i * 4 + 2]; n++; }
    if (!n) continue; const c = `${Math.round(sr / n)},${Math.round(sg / n)},${Math.round(sb / n)}`, X = e.x * k, Y = e.y * k, R = e.R * k, gr = og.createRadialGradient(X, Y, R * .78, X, Y, R * 1.05); gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(1, `rgba(${c},0)`); og.fillStyle = gr; og.beginPath(); og.arc(X, Y, R * 1.05, 0, 6.2832); og.fill();
  }
  return { canvas: out, n: eyes.length, eyes: eyes.map(e => ({ u: e.x / S, v: e.y / S, R: e.R / S })) };
}
function scanEyeIslands(img, iris) {   // the eyeballs of some fish are cut into islands of the texture (white of the eye, iris, pupil, side by side on black): every island with white and a dark pupil is an eye; its closed lid is the island painted in the body colour (the average of the big islands)
  const S = 512, cv = document.createElement('canvas'); cv.width = S; cv.height = S; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, S, S);
  const D = cx.getImageData(0, 0, S, S).data, lab = new Int32Array(S * S), comps = [], stack = [], lum = i => .299 * D[i * 4] + .587 * D[i * 4 + 1] + .114 * D[i * 4 + 2];
  for (let i0 = 0; i0 < S * S; i0++) {
    if (lab[i0] || lum(i0) < 38) continue; const id = comps.length + 1, px = []; stack.push(i0); lab[i0] = id;
    while (stack.length) { const i = stack.pop(), x = i % S; px.push(i); for (const j of [x > 0 ? i - 1 : -1, x < S - 1 ? i + 1 : -1, i - S, i + S]) if (j >= 0 && j < S * S && !lab[j] && lum(j) >= 38) { lab[j] = id; stack.push(j); } }
    comps.push(px);
  }
  const eyes = [], body = [0, 0, 0, 0];
  for (const px of comps) {
    let w = 0, dk = 0, sx = 0, sy = 0; for (const i of px) { const l = lum(i); if (l > 200 && Math.min(D[i * 4], D[i * 4 + 1], D[i * 4 + 2]) > 185) w++; else if (l < 80) dk++; sx += i % S; sy += (i / S) | 0; }
    const a = px.length;
    if (iris) { let n2 = 0; for (const i of px) if (iris(D[i * 4], D[i * 4 + 1], D[i * 4 + 2])) n2++; if (n2 < 6) continue; }
    if (a >= 120 && a <= 1800 && w / a > .12 && w / a < .75 && dk / a > .04 && dk / a < .6) eyes.push({ px, x: sx / a, y: sy / a });
    else if (a > 1500) { for (const i of px) { body[0] += D[i * 4]; body[1] += D[i * 4 + 1]; body[2] += D[i * 4 + 2]; body[3]++; } }
  }
  if (!eyes.length || !body[3]) return null;
  const out = document.createElement('canvas'); out.width = img.width; out.height = img.height; const og = out.getContext('2d'); og.drawImage(img, 0, 0); const k = img.width / S;
  og.fillStyle = `rgb(${Math.round(body[0] / body[3])},${Math.round(body[1] / body[3])},${Math.round(body[2] / body[3])})`;
  for (const e of eyes) for (const i of e.px) { const x = (i % S) * k, y = ((i / S) | 0) * k; og.fillRect(x - 1, y - 1, k + 2, k + 2); }
  return { canvas: out, n: eyes.length, islands: true, eyes: eyes.map(e => ({ u: e.x / S, v: e.y / S })) };
}
const scanEyeTexAny = (img, key) => scanEyeTex(img) || scanEyeTex(img, true) || scanEyeTex(img, true, true) || scanEyeIslands(img, IRIS[key]);
const IRIS = { whale: (r, g, b) => r > 190 && g > 90 && g < 190 && b < 90 && r - b > 120 };   // the colour of the iris where the white-and-dark test alone also catches fin patches   // the strict reading first; the loose one for the fish whose eye picture is softer
/* ---- the fish: 49 static meshes without a skeleton (public/models/fish/<key>/model.fbx + tex.jpg, see scripts/prep-fish.py). A level names its fish in `fishKeys` and only those are loaded; the next level's are fetched in the background. ---- */
const FACES_Z = new Set(['abyss_tetra', 'blue_flash', 'blue_chunker', 'blue_chuppy', 'blue_striper', 'pinky_puffer', 'purple_wing']);
const FLIP_X = new Set(['sunset_puffer']);
const FISH_UPRIGHT = new Set(['sea_horse']);   // the body stands upright: its length is its height, the snout points to +x
const FISH_LEN = { whale: 1.15, shark: 1.0, sea_horse: .55 }, FISH_P = {};   // body length of the exceptions; every other fish is .62
function nearTris(geo, p, r, nrm) {   // the triangles of the body that lie within r of a point on the surface, facing the same way: the lid is made of the body's own skin there, so it moves with the body's wave exactly
  const P = geo.attributes.position, Nn = geo.attributes.normal, pos = [], nor = [], c = new THREE.Vector3(), r2 = r * r;
  for (let i = 0; i + 2 < P.count; i += 3) { c.set((P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, (P.getY(i) + P.getY(i + 1) + P.getY(i + 2)) / 3, (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3); if (c.distanceToSquared(p) > r2) continue; if (Nn && (Nn.getX(i) * nrm.x + Nn.getY(i) * nrm.y + Nn.getZ(i) * nrm.z) < .2) continue; for (let k = 0; k < 3; k++) { pos.push(P.getX(i + k), P.getY(i + k), P.getZ(i + k)); if (Nn) nor.push(Nn.getX(i + k), Nn.getY(i + k), Nn.getZ(i + k)); } }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor) };
}
const EYE_AT = { sunset_puffer: [142, 66, 6], whale: [146, 61, 5], red_fin: [161, 77, 5], rainbow_striper: [154, 74, 4], golden_spot: [152, 76, 4], green_beast: [158, 72, 5], perple_stripe_wing: [153, 80, 5], pinky_puffer: [155, 71, 7] };   // the pupil as seen from the +z side in a 200 x 160 side view (nose to the right): x, y, radius. For the fish whose eye the finder cannot find on its own; the other side is the mirror image
async function geoLid(n, M, sp) {   // a blink for the fish whose texture cannot be painted: a small skin-coloured lid (a disc lying on the eye) that closes over it. The eyes are found on a rendered side view (the dark pupil in the head area), put on the mesh with a ray, and the lid takes the colour of the skin round the eye
  M.lidGeo = null; const W = 480, H = 384, r = thumbR || (thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })); r.setPixelRatio(1); r.setSize(W, H, false); r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xdff4ff, 0x335577, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(2, 3, 4); sc.add(dl);
  const old = M.lid; M.lid = null; const b = buildAnyModel(sp); M.lid = old; sc.add(b.group); b.seek(0); b.update(0); b.openEyes(); b.group.updateMatrixWorld(true); const body = b.group.children[0], up = !!M.upright, found = [];
  for (const sg of [1, -1]) {
    const cam = new THREE.PerspectiveCamera(28, W / H, .05, 20); cam.position.set(0, 0, sg * M.len * 2.1); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); r.render(sc, cam);
    const im = new Image(); im.src = r.domElement.toDataURL('image/png'); await im.decode(); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0); const D = cx.getImageData(0, 0, W, H).data;
    const pre = EYE_AT[n]; let x0 = W, x1 = 0, y0 = H, y1 = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (D[(y * W + x) * 4 + 3] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0) return; const bw = x1 - x0, bh = y1 - y0, lum = i => .299 * D[i * 4] + .587 * D[i * 4 + 1] + .114 * D[i * 4 + 2];
    const inHead = (x, y) => up ? y < y0 + bh * .45 : (sg > 0 ? x > x0 + bw * .5 : x < x0 + bw * .5), seen = new Uint8Array(W * H); let best = null;
    for (let y = y0; y <= y1 && !pre; y++) for (let x = x0; x <= x1; x++) {
      const i0 = y * W + x; if (seen[i0] || !inHead(x, y) || D[i0 * 4 + 3] < 200 || lum(i0) > 70) continue;
      const st = [i0]; seen[i0] = 1; let a = 0, sx = 0, sy = 0, mx0 = x, mx1 = x, my0 = y, my1 = y;
      while (st.length) { const i = st.pop(), px = i % W, py = (i / W) | 0; a++; sx += px; sy += py; if (px < mx0) mx0 = px; if (px > mx1) mx1 = px; if (py < my0) my0 = py; if (py > my1) my1 = py; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && !seen[j] && D[j * 4 + 3] >= 200 && lum(j) <= 70) { seen[j] = 1; st.push(j); } }
      const w2 = mx1 - mx0 + 1, h2 = my1 - my0 + 1; if (a < 14 || a > W * H * .02 || Math.max(w2, h2) / Math.min(w2, h2) > 1.8 || a < .5 * w2 * h2) continue;
      const ccx = sx / a, ccy = sy / a, rp = Math.sqrt(a / Math.PI); let hi = 0; for (let dy = -rp * 2.6; dy <= rp * 2.6; dy++) for (let dx = -rp * 2.6; dx <= rp * 2.6; dx++) { const xx = Math.round(ccx + dx), yy = Math.round(ccy + dy); if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; if (dx * dx + dy * dy <= rp * rp * 6.8 && lum(yy * W + xx) > 215 && D[(yy * W + xx) * 4 + 3] > 200) hi++; }
      if (hi < 3) continue; const score = a * Math.min(hi, 40); if (!best || score > best.score) best = { ccx, ccy, rp, score };
    }
    if (pre) best = { ccx: sg > 0 ? pre[0] * 2.4 : W - pre[0] * 2.4, ccy: pre[1] * 2.4, rp: pre[2] * 2.4, score: 1 };
    if (!best) return;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(best.ccx / W * 2 - 1, -(best.ccy / H * 2 - 1)), cam); const hit = ray.intersectObject(body, false)[0]; if (!hit || !hit.face) return;
    const re = Math.max(8, best.rp * (pre ? 3.0 : 2.3)), world = 2 * hit.distance * Math.tan(14 * Math.PI / 180) / H, nrm = hit.face.normal.clone().transformDirection(body.matrixWorld);
    const R0 = [], G0 = [], B0 = []; for (let a = 0; a < 36; a++) for (const f of [2.0, 2.4, 2.9]) { const x = Math.round(best.ccx + Math.cos(a / 36 * 6.2832) * re * f), y = Math.round(best.ccy + Math.sin(a / 36 * 6.2832) * re * f); if (x < 0 || y < 0 || x >= W || y >= H) continue; const o = (y * W + x) * 4; if (D[o + 3] < 230) continue; R0.push(D[o]); G0.push(D[o + 1]); B0.push(D[o + 2]); }
    if (R0.length < 10) return; const med = a => a.sort((p, q) => p - q)[a.length >> 1]; found.push({ tri: nearTris(M.geo, hit.point, re * world * 1.1, nrm), p: hit.point.clone(), n: nrm, r: re * world, col: [med(R0), med(G0), med(B0)].map(v => Math.round(v * .86)) });
  }
  if (found.length === 2) M.lidGeo = found;
}
let LID_Q = Promise.resolve();   // the lids are worked out one fish at a time: they all draw on the same renderer
const NO_BLINK = new Set(['red_fin', 'peach_anthias', 'goldie_tot', 'pink_stripe']);   // checked by eye on the contact sheet: their lid came out on the wrong spot or left half the pupil
async function refineLid(n, M, sp) { await refineLidTex(n, M, sp); if (!M.lid) await geoLid(n, M, sp); }
async function refineLidTex(n, M, sp) {   // the blink of a fish: an eye is only trusted when it sits on the head (not on a fin or the belly), and the lid takes the colour of the skin around the eye as it is RENDERED, instead of a guess from the flat texture
  const lid = M.lid; if (!lid) return; if (NO_BLINK.has(n)) { M.lid = null; return; } if (lid.islands || !lid.eyes || !lid.eyes.length) { M.lid = null; return; }   // (eyes cut into pieces of the texture cannot be closed cleanly: those fish do not blink)
  const geo = M.geo, P = geo.attributes.position, U = geo.attributes.uv, N = P.count, len = M.len, up = !!M.upright, cand = [];
  (window.__lidDbg = window.__lidDbg || {})[n] = [];
  for (const e of lid.eyes) {
    const near = []; for (let i = 0; i < N; i++) { const d = Math.hypot(U.getX(i) - e.u, U.getY(i) - (1 - e.v)); if (d < .05) near.push([d, i]); }
    near.sort((a, b) => a[0] - b[0]); /* the nearest few vertices: the two sides of a fish often share one island of the texture, so a wider net would average the eye onto the middle of the body */ const idx = near.slice(0, 4).map(q => q[1]); if (idx.length < 3) { window.__lidDbg[n].push('few ' + idx.length); continue; }
    const c = new THREE.Vector3(); for (const i of idx) { c.x += P.getX(i); c.y += P.getY(i); c.z += P.getZ(i); } c.multiplyScalar(1 / idx.length);
    const head = up ? c.y > M.hy * .25 : c.x > len * .1, side = Math.abs(c.z) > M.hz * .25; window.__lidDbg[n].push([+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2), head, side]);
    if (head && side) cand.push({ e, c, idx, near10: near.slice(0, 14).map(q => q[1]), score: Math.abs(c.z) + (up ? c.y : c.x) });
  }
  const pick = []; for (const sg of [1, -1]) { const s2 = cand.filter(q => Math.sign(q.c.z) === sg).sort((a, b) => b.score - a.score)[0]; if (s2) pick.push(s2); }
  if (!pick.length) { M.lid = null; return; }
  const W = 480, H = 384, r = thumbR || (thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })); r.setPixelRatio(1); r.setSize(W, H, false); r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xdff4ff, 0x335577, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(2, 3, 4); sc.add(dl);
  const old = window.__blink; window.__blink = 0; const b = buildAnyModel(sp); window.__blink = old; sc.add(b.group); b.seek(0); b.update(0); b.openEyes();
  const out = document.createElement('canvas'); out.width = lid.canvas.width; out.height = lid.canvas.height; const kx = out.width, ky = out.height;
  const draw = list => { const og = out.getContext('2d'); og.clearRect(0, 0, kx, ky); og.drawImage(M.img, 0, 0, kx, ky);
    for (const q of list) { const X = q.e.u * kx, Y = q.e.v * ky, Rr = Math.max(q.e.R * kx, 8), gr = og.createRadialGradient(X, Y, Rr * .85, X, Y, Rr * 1.08); gr.addColorStop(0, `rgba(${q.col},1)`); gr.addColorStop(1, `rgba(${q.col},0)`); og.fillStyle = gr; og.beginPath(); og.arc(X, Y, Rr * 1.08, 0, 6.2832); og.fill(); } };
  const snap = async sg => { const cam = new THREE.PerspectiveCamera(28, W / H, .05, 20); cam.position.set(0, 0, sg * len * 2.1); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); r.render(sc, cam); const im = new Image(); im.src = r.domElement.toDataURL('image/png'); await im.decode(); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0); return { cam, cx, D: cx.getImageData(0, 0, W, H).data }; };
  const pr = (cam, v) => { const w = v.clone().project(cam); return [(w.x * .5 + .5) * W, (1 - (w.y * .5 + .5)) * H]; };
  for (const q of pick) {
    const sg = Math.sign(q.c.z), { cam, D } = await snap(sg), [sx, sy] = pr(cam, q.c); let re = 9;
    { const rat = []; for (const i of q.near10) { const [x, y] = pr(cam, new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i))), du = Math.hypot(U.getX(i) - q.e.u, U.getY(i) - (1 - q.e.v)); if (du > .0004) rat.push(Math.hypot(x - sx, y - sy) / du); }   // screen pixels per unit of texture, measured on the vertices next to the eye: the eye's size on the screen
      if (rat.length >= 3) { rat.sort((a, b) => a - b); re = Math.min(26, q.e.R * rat[rat.length >> 1]); } if (re < 11) re = 22; }
    const R0 = [], G0 = [], B0 = []; for (let a = 0; a < 36; a++) for (const f of [1.4, 1.8, 2.3]) { const x = Math.round(sx + Math.cos(a / 36 * 6.2832) * re * f), y = Math.round(sy + Math.sin(a / 36 * 6.2832) * re * f); if (x < 0 || y < 0 || x >= W || y >= H) continue; const o = (y * W + x) * 4; if (D[o + 3] < 230) continue; R0.push(D[o]); G0.push(D[o + 1]); B0.push(D[o + 2]); }
    if (R0.length < 8) continue; const med = a => a.sort((x, y) => x - y)[a.length >> 1]; q.col = `${med(R0)},${med(G0)},${med(B0)}`; q.sx = sx; q.sy = sy; q.sg = sg; q.eyeLike = (() => { let mn = 999; const rr = Math.max(5, re * .7); for (let dy = -rr; dy <= rr; dy += 1) for (let dx = -rr; dx <= rr; dx += 1) { if (dx * dx + dy * dy > rr * rr) continue; const x = Math.round(sx + dx), y = Math.round(sy + dy); if (x < 0 || y < 0 || x >= W || y >= H) continue; const o = (y * W + x) * 4; if (D[o + 3] < 200) continue; mn = Math.min(mn, .299 * D[o] + .587 * D[o + 1] + .114 * D[o + 2]); } return mn; })(); q.open = [...Array(3)].map((_, k) => D[(Math.round(sy) * W + Math.round(sx)) * 4 + k]);
  }
  const ready = pick.filter(q => q.col); if (!ready.length) { M.lid = null; return; }
  // check: with the lids painted and the eyes shut, the spot where the eye is must show the skin colour and must differ from the open eye; an eye that fails (a wrong spot in the texture) is dropped
  draw(ready); lid.canvas = out; lid.tex = null; window.__blink = 1; const b2 = buildAnyModel(sp); sc.remove(b.group); sc.add(b2.group); b2.seek(0); b2.update(0); b2.openEyes(); window.__blink = old;
  const centre = (D, q) => { let a = 0, bb = 0, c = 0, n2 = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const o = ((Math.round(q.sy) + dy) * W + Math.round(q.sx) + dx) * 4; a += D[o]; bb += D[o + 1]; c += D[o + 2]; n2++; } return [a / n2, bb / n2, c / n2]; };
  const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  for (const q of ready) { const { D } = await snap(q.sg), c1 = centre(D, q), want = q.col.split(',').map(Number); q.shut1 = c1; q.dOpen = diff(c1, q.open); q.finalCol = want.map(w => Math.round(w * .88)).join(','); }   // (the lid is lit again when drawn: a little darker texture colour comes out as the skin around it)
  for (const q of ready) q.col = q.finalCol;
  const good = ready.filter(q => q.dOpen > 60 && q.eyeLike < 90);   // and the spot must be an eye in the first place: a dark pupil is somewhere in it   // the eye must really change when the lid is drawn (a lid painted on a wrong spot of the texture leaves the open eye as it was)
  for (const q of ready) window.__lidDbg[n].push({ dOpen: Math.round(q.dOpen), col: q.col });
  if (!good.length) { M.lid = null; return; }
  draw(good); lid.canvas = out; lid.tex = null; lid.n = good.length; return;
}
function loadFish(keys) {
  const need = keys.filter(k => MODEL_IDX['fish_' + k] === undefined); if (!need.length) return Promise.resolve([]);
  return Promise.all(need.map(k => FISH_P[k] || (FISH_P[k] = loadOneFish(k)))).then(idx => { const add = idx.filter(i => i !== undefined); return artFor(add).then(() => add); });
}
async function loadOneFish(n) {
  const base = document.baseURI, tl = new THREE.TextureLoader(), L = FISH_LEN[n] || .62;
  try {
    const [obj, tex] = await Promise.all([new FBXLoader().loadAsync(new URL(`models/fish/${n}/model.fbx`, base).href), tl.loadAsync(new URL(`models/fish/${n}/tex.jpg`, base).href)]); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const lid = scanEyeTexAny(tex.image, n); const meshes = []; obj.updateWorldMatrix(true, true); obj.traverse(m => { if (m.isMesh) meshes.push(m); }); if (!meshes.length) throw new Error('no mesh');
    const gs = meshes.map(m => { const q = m.geometry.clone(); q.applyMatrix4(m.matrixWorld); for (const a of Object.keys(q.attributes)) if (a !== 'position' && a !== 'uv' && a !== 'normal') q.deleteAttribute(a); if (q.index) return q.toNonIndexed(); return q; });
    const g = gs.length > 1 ? mergeGeometries(gs, false) || gs[0] : gs[0]; if (FACES_Z.has(n)) g.rotateY(Math.PI / 2);   // these models face along z, not x
    g.computeBoundingBox(); const box = g.boundingBox, size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    g.translate(-ctr.x, -ctr.y, -ctr.z);
    // the nose is the end of the long axis (x) where the body is thicker (the tail is thin and flat)
    const P = g.attributes.position; let zl0 = 1e9, zl1 = -1e9, zr0 = 1e9, zr1 = -1e9; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); if (x < -size.x * .32) { zl0 = Math.min(zl0, z); zl1 = Math.max(zl1, z); } else if (x > size.x * .32) { zr0 = Math.min(zr0, z); zr1 = Math.max(zr1, z); } }
    let eyeFlip = null; if (lid && lid.eyes && lid.eyes.length) {   // the head is where the eyes are: the eyes' place on the texture gives their place on the body, and that must be on the +x side
      const U = g.attributes.uv; let sx = 0, n = 0; for (const e of lid.eyes) { const eu = e.u, ev = 1 - e.v; for (let q = 0; q < U.count; q++) { if (Math.hypot(U.getX(q) - eu, U.getY(q) - ev) < .018) { sx += P.getX(q); n++; } } }
      if (n > 3 && Math.abs(sx / n) > size.x * .04) eyeFlip = sx / n < 0; }
    const heurFlip = zl1 - zl0 > zr1 - zr0;
    if (heurFlip && !FISH_UPRIGHT.has(n)) g.rotateY(Math.PI);   // (the eye position was tried as a second opinion: it disagreed on one fish, which turned out wrong, so only the body shape decides)   // the nose must point to +x
    if (FLIP_X.has(n)) g.rotateY(Math.PI);   // (checked on the contact sheet: the nose test picked the wrong end of this fish)
    const up = FISH_UPRIGHT.has(n);
    if (up) g.rotateY(Math.PI);   // the sea horse's snout is on the -x side in the file (measured on the thumbnail: it swam backwards), so it is turned round once
    const k = up ? L / size.y : L / size.x, ky = up ? 1 : n === 'whale' || n === 'shark' ? 1 : .94, kz = up || n === 'whale' || n === 'shark' ? 1 : .82; g.scale(k, k * ky, k * kz);   // slimmer: the models are a little plump, so the body is narrowed by 18% and lowered by 6%
    const img = tex.image, vt = {};
    MODEL3D['fish_' + n] = { static: true, upright: up, lid, geo: g, tex, img, vt, len: L, hx: L / 2, hy: size.y * k * ky / 2, hz: size.z * k * kz / 2,
      hueTex(hue) { if (!hue) return this.tex; if (!vt[hue]) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); hueRotate(c, hue); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = tex.flipY; t.anisotropy = 4; vt[hue] = t; } return vt[hue]; } };
    const sp = { id: 'm_fish_' + n, model3d: 'fish_' + n, len: L }; SPECIES.push(sp); MODEL_IDX['fish_' + n] = SPECIES.length - 1; try { await (LID_Q = LID_Q.then(() => refineLid(n, MODEL3D['fish_' + n], sp))); } catch (e) { console.warn('lid', n, e); LID_Q = Promise.resolve(); } makeModelThumb(sp); return SPECIES.length - 1;
  } catch (e) { console.warn('fish ' + n + ' not loaded', e); return undefined; }
}
function buildStaticFish(sp) {   // same interface as buildModelFish (swim pose, hover glow, tap proxy) for a mesh without bones
  const M = MODEL3D[sp.model3d], tex = sp.hue ? M.hueTex(sp.hue) : M.tex, g = new THREE.Group(), uPh = { value: 0 }, uAmp = { value: .2 }, L = M.len;
  const AXN = M.upright ? 'y' : 'x', LEN = M.upright ? M.hy * 2 : L;
  const wave = sh => { sh.uniforms.uPh = uPh; sh.uniforms.uAmp = uAmp; sh.vertexShader = 'uniform float uPh; uniform float uAmp; varying vec3 vOP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `vOP = position; vec3 transformed = vec3( position ); float tl = clamp((${(LEN / 2).toFixed(4)} - transformed.${AXN}) / ${LEN.toFixed(4)}, 0., 1.); float env = .22 + .78 * pow(tl, 1.25), ph2 = uPh - tl * 5.6; transformed.z += uAmp * ${(LEN * .5).toFixed(4)} * env * sin(ph2) + uAmp * ${(LEN * .12).toFixed(4)} * sin(uPh * .5); float yaw = uAmp * env * cos(ph2) * .9; transformed.x += transformed.z * yaw * .0; transformed.${M.upright ? 'x' : 'y'} += uAmp * ${(LEN * .06).toFixed(4)} * tl * sin(ph2 - 1.2); ${M.upright ? '' : 'transformed.x *= 1. - .045 * abs(sin(ph2)) * tl;'}   // a wave that runs from the head to the tail: the whole body bends, the tail most, and the body rises and sinks a little with it`); };
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: .46, side: THREE.DoubleSide, fog: false }); const uBl = { value: 0 }; let lidTex = null;
  if (M.lid) { lidTex = M.lid.tex || (M.lid.tex = new THREE.CanvasTexture(M.lid.canvas)); lidTex.colorSpace = THREE.SRGBColorSpace; lidTex.flipY = tex.flipY; lidTex.anisotropy = 4; if (sp.hue) { const vk = 'v' + sp.hue; if (!M.lid[vk]) { const c = document.createElement('canvas'); c.width = M.lid.canvas.width; c.height = M.lid.canvas.height; c.getContext('2d').drawImage(M.lid.canvas, 0, 0); hueRotate(c, sp.hue); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = tex.flipY; t.anisotropy = 4; M.lid[vk] = t; } lidTex = M.lid[vk]; } }   // the same picture with the eyeballs painted over: the blink fades each eye into it
  const E = !!lidTex;
  mat.customProgramCacheKey = () => `fish|${AXN}|${LEN.toFixed(4)}|${E ? 'lid' : 'nolid'}`;   // the shader text holds this fish's length and axis and (when it blinks) the lid code: without its own key every fish reused the program of whichever fish was drawn first
  mat.onBeforeCompile = sh => { wave(sh); if (!E) return; Object.assign(sh.uniforms, { uBl, uLidMap: { value: lidTex } });
    sh.fragmentShader = 'uniform float uBl; uniform sampler2D uLidMap;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n vec3 lidC = texture2D(uLidMap, vMapUv).rgb; vec3 lidL = lidC; diffuseColor.rgb = mix(diffuseColor.rgb, lidL, uBl);').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = mix(totalEmissiveRadiance, lidL * emissive, uBl);'); };
  const body = new THREE.Mesh(M.geo, mat); body.frustumCulled = false; g.add(body);
  const LM = M.lidGeo && !E ? M.lidGeo.filter(q => q.tri.pos.length >= 9).map(q => { const c0 = q.col.map(v => v / 255), c1 = sp.hue ? hueRGB(c0, sp.hue) : c0, col = new THREE.Color().setRGB(c1[0], c1[1], c1[2], THREE.SRGBColorSpace), lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(q.tri.pos, 3)); if (q.tri.nor.length) lg.setAttribute('normal', new THREE.BufferAttribute(q.tri.nor, 3)); else lg.computeVertexNormals();
    const lm = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: .46, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    lm.customProgramCacheKey = () => `fishlid|${AXN}|${LEN.toFixed(4)}`; lm.onBeforeCompile = sh => { wave(sh); sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'transformed += normalize( normal ) * .006;\n#include <project_vertex>'); };
    const m = new THREE.Mesh(lg, lm); m.frustumCulled = false; m.visible = false; m.renderOrder = 3; g.add(m); return m; }) : null;   /* the lids of a fish whose texture cannot be painted (see geoLid): the body's own triangles round the eye, in the skin colour, fading in over the eye */
  let glows = null;
  const mkGlow = () => { glows = [[.025, 0xff9d00, .85], [.011, 0xffe36b, 1]].map(([off, col, kk]) => { const gm = new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }); gm.userData.k = kk;
    gm.onBeforeCompile = sh => { wave(sh); sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'transformed += normalize( normal ) * ' + off.toFixed(3) + ';\n#include <project_vertex>\n gl_Position.z += .004 * gl_Position.w;'); };
    const h = new THREE.Mesh(M.geo, gm); h.frustumCulled = false; h.visible = false; h.renderOrder = 6; g.add(h); return h; }); };
  const setGlow = v => { if (v > .01 && !glows) mkGlow(); if (glows) for (const h of glows) { h.visible = v > .01; h.material.opacity = v * h.material.userData.k; } };
  let bp = -1, bt = rand(.5, 4); const pose = (dt, o) => { if (E || LM) { bt -= dt; if (bp < 0 && bt <= 0) bp = 0; if (bp >= 0) { bp += dt / .3; uBl.value = Math.sin(Math.min(1, bp) * Math.PI) ** .7; if (bp >= 1) { bp = -1; bt = rand(1.8, 5); uBl.value = 0; } } if (window.__blink !== undefined) uBl.value = window.__blink; if (LM) for (const m of LM) { const u = Math.min(1, uBl.value * 1.4); m.visible = u > .03; m.material.opacity = u; } } if (!o) return; const boost = Math.min(o.boost || 0, 2), scared = boost > .8 || o.wiggle > 0; uPh.value = o.wph || 0; uAmp.value = (.2 + .08 * boost) * (scared ? 1.25 : 1) * 1.1; };
  const proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); proxy.scale.set(M.hx * .95, M.hy * .9, M.hz * .9); proxy.userData.pickOnly = true; g.add(proxy);
  const mats = { get emissiveIntensity() { return mat.emissiveIntensity; }, set emissiveIntensity(v) { mat.emissiveIntensity = v; } };
  return { openEyes() { }, seek() { }, group: g, body: { rotation: { y: 0 }, material: mats }, tail: { rotation: { y: 0 } }, hx: M.hx, hy: M.hy, hz: M.hz, blink: null, model3d: true, update: pose, setGlow, setBlink: v => { uBl.value = v; }, bounds: new THREE.Box3(new THREE.Vector3(-M.hx, -M.hy, -M.hz), new THREE.Vector3(M.hx, M.hy, M.hz)) };
}
const buildAnyModel = sp => (MODEL3D[sp.model3d].static ? buildStaticFish(sp) : buildModelFish(sp));
function modelVariant(baseIdx, deg) {   // the same 3D model with its colours turned by `deg` degrees: a species of its own, created on demand
  const b = SPECIES[baseIdx], key = b.model3d, hue = (((Math.round((b.hue || 0) + deg)) % 360) + 360) % 360, id = 'm_' + key + (hue ? '_h' + hue : ''), k = SPECIES.findIndex(q => q.id === id); if (k >= 0) return k;
  const sp = { id, model3d: key, len: b.len, hue }; SPECIES.push(sp); makeModelThumb(sp); return SPECIES.length - 1;
}
function buildModelFish(sp) {
  const M = MODEL3D[sp.model3d], tex = sp.hue ? M.hueTex(sp.hue) : M.tex, g = new THREE.Group(), holder = new THREE.Group(), root = SkeletonUtils.clone(M.obj), mats = [], skinned = [];
  holder.add(root); holder.rotation.y = Math.PI / 2; holder.scale.set(M.k * .88, M.k, M.k); holder.position.set(-M.ctr.z * M.k, -M.ctr.y * M.k, M.ctr.x * M.k); g.add(holder);   // +Z -> +X (the game's forward), centred on the origin
  const eyeU = M.eye ? { uBlink: { value: 0 }, uEye: { value: new THREE.Vector3(M.eye.u, M.eye.v, M.eye.r) }, uLid: { value: (lid => new THREE.Color().setRGB(lid[0], lid[1], lid[2], THREE.SRGBColorSpace))(sp.hue ? hueRGB(M.eye.lid, sp.hue) : M.eye.lid) } } : null;   // the Unity fish blink by turning their eye picture into the colour of the body next to it
  root.traverse(m => { if (m.isMesh) { m.frustumCulled = false; m.material = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: .46, alphaTest: M.cut, side: THREE.DoubleSide, fog: false }); mats.push(m.material); if (m.isSkinnedMesh) skinned.push(m);
    if (eyeU) m.material.onBeforeCompile = sh => { Object.assign(sh.uniforms, eyeU);
      sh.fragmentShader = 'uniform float uBlink; uniform vec3 uEye; uniform vec3 uLid;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n vec2 eD = vMapUv - uEye.xy; float eyeM = smoothstep(uEye.z, uEye.z * .8, length(eD)) * uBlink; float eyeL = smoothstep(uEye.z * .13, 0., abs(eD.y + uEye.z * .05)) * smoothstep(uEye.z, uEye.z * .6, abs(eD.x)) * 0. + smoothstep(uEye.z * .12, 0., abs(eD.y + uEye.z * .08)) * smoothstep(uEye.z * .95, uEye.z * .5, abs(eD.x)) * uBlink;\n diffuseColor.rgb = mix(diffuseColor.rgb, uLid, eyeM); diffuseColor.rgb = mix(diffuseColor.rgb, uLid * .55, eyeL * .8);').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = mix(totalEmissiveRadiance, uLid * emissive, eyeM);'); }; } });
  // bones we pose by code on top of the swim clip (same-name nodes are FBX helper nodes: the first one per name is the real bone)
  const B = {}; root.traverse(n => { if (n.isBone && !B[n.name]) B[n.name] = n; });
  const uni = !!B.Spine_1;   // the Unity rig: Spine_1..3 and Tail_1..2 swing sideways about their local z; fins are named Fin_1_*
  const SP = (uni ? ['Spine_1', 'Spine_2', 'Spine_3', 'Tail_1', 'Tail_2'] : ['Bone001', 'Bone002', 'Bone003', 'Bone004', 'Bone006']).map(n => B[n]).filter(Boolean), EYE = (uni ? [] : ['L_eye1', 'R_eye1']).map(n => B[n]).filter(Boolean);
  const FIN = (uni ? [['Fin_1_B_L', 1, 0], ['Fin_1_B_R', -1, 0], ['Fin_1_M_L', 1, 0], ['Fin_1_M_R', -1, 0], ['Fin_1_T_F', 1, 1], ['Fin_1_T_B', 1, 1], ['Fin_1_B', 1, 1]] : [['L_Fin_Bottom', 1, 0], ['R_Fin_Bottom', -1, 0], ['L_Fin_Top', 1, 1], ['R_Fin_Top', -1, 1]]).filter(f => B[f[0]]).map(([n, s, top]) => ({ b: B[n], s, top }));
  const rest = [...SP, ...EYE, ...FIN.map(f => f.b)].map(b => [b, b.quaternion.clone(), b.scale.clone()]);
  const ex = { wide: 0, sleepy: 0, flare: 0, bend: 0, blinkT: rand(1, 4), bp: -1 }, qa = new THREE.Quaternion(), ea = new THREE.Euler();
  const addRot = (b, x, y, z) => { ea.set(x, y, z); qa.setFromEuler(ea); b.quaternion.multiply(qa); };
  const mixer = new THREE.AnimationMixer(root); let act0 = null; if (M.clip) { act0 = mixer.clipAction(M.clip); act0.play(); act0.time = Math.random() * M.clip.duration; } mixer.update(0);
  const seek = t => { if (act0) { act0.time = t; mixer.update(0); } };   // jump the swim clip to a moment (thumbnails use the start: a random moment can catch the eye mid-blink, which shows as a dark hole)
  const pose = (dt, o) => {   // swim clip + a travelling body wave + bend into turns + fins + eyes (blink, wide, sleepy)
    for (const [b, q, s] of rest) { b.quaternion.copy(q); b.scale.copy(s); }
    mixer.update(dt);
    if (!o) return;
    const hv = o.hv || 0, boost = Math.min(o.boost || 0, 2), ph = o.wph || 0, k = 1 - Math.exp(-dt * 7);
    const scared = boost > .8 || o.wiggle > 0, wide = Math.max(hv * .3, scared ? .38 : 0), sleepy = o.mood === 1 ? .5 : 0;
    ex.wide += (wide - ex.wide) * k; ex.sleepy += (sleepy - ex.sleepy) * k; ex.flare += (((hv > .1 || scared) ? 1 : 0) - ex.flare) * k;
    ex.bend += (clamp(o.turnV || 0, -2.6, 2.6) * .3 - ex.bend) * (1 - Math.exp(-dt * 5));
    ex.blinkT -= dt; if (ex.blinkT < 0) { ex.bp = 0; ex.blinkT = rand(2.2, 5.5); }
    let bl = 0; if (ex.bp >= 0) { ex.bp += dt; const p = Math.min(1, ex.bp / .46), sm = x => x * x * (3 - 2 * x); bl = p < .36 ? sm(p / .36) : 1 - sm((p - .36) / .64); if (p >= 1) ex.bp = -1; }   // the lid comes down a little faster than it opens, both eased
    const amp = (.17 + .07 * boost) * (1 - .5 * ex.sleepy) * (scared ? 1.25 : 1);
    SP.forEach((b, i) => addRot(b, 0, 0, amp * (.55 + .45 * i) * Math.sin(ph - i * .9) + ex.bend * (i + 1) / 15));
    FIN.forEach((f, i) => { const fl = f.top ? .3 : .55; addRot(f.b, .22 * Math.sin(ph * .9 + i * 1.3), 0, f.s * (.2 * Math.sin(ph * .9 + .6) + fl * ex.flare)); });
    const sy = (1 + ex.wide) * (1 - .55 * ex.sleepy) * (1 - .93 * bl), sxz = 1 + ex.wide * .8; for (const b of EYE) b.scale.set(sxz, sy, sxz);
    if (eyeU) eyeU.uBlink.value = window.__blink ?? Math.min(1, bl * 1.15 + ex.sleepy * .5);
  };
  const proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); proxy.scale.set(M.hx * .95, M.hy * .9, M.hz * .9); proxy.userData.pickOnly = true; g.add(proxy);   // what a tap hits (the skinned meshes are not in the pick buffer)
  let glows = null;
  const mkGlow = () => {   // gold hover/hint glow: two additive copies of the skinned meshes, inflated along their normals (before skinning, so in model units)
    glows = [[.07, 0xff9d00, .85], [.03, 0xffe36b, 1]].map(([off, col, kk]) => {
      const gm = new THREE.MeshBasicMaterial({ map: M.sil, color: col, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }); gm.userData.k = kk;
      gm.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3( position ) + normalize( normal ) * ' + off.toFixed(3) + ';').replace('#include <project_vertex>', '#include <project_vertex>\n gl_Position.z += .004 * gl_Position.w;'); };
      const hs = skinned.map(m => { const h = new THREE.SkinnedMesh(m.geometry, gm); h.bind(m.skeleton, m.bindMatrix); h.position.copy(m.position); h.quaternion.copy(m.quaternion); h.scale.copy(m.scale); h.frustumCulled = false; h.visible = false; h.renderOrder = 6; return [m, h]; });
      for (const [m, h] of hs) m.parent.add(h); return hs.map(q => q[1]);
    }).flat();
  };
  const setGlow = v => { if (v > .01 && !glows) mkGlow(); if (glows) for (const h of glows) { h.visible = v > .01; h.material.opacity = v * h.material.userData.k; } };
  const mat = { get emissiveIntensity() { return mats[0].emissiveIntensity; }, set emissiveIntensity(v) { for (const m of mats) m.emissiveIntensity = v; } };
  const openEyes = () => { for (const [b, q, s2] of rest) if (EYE.includes(b)) { b.quaternion.copy(q); b.scale.copy(s2); } };   // for thumbnails: the swim clip can be caught mid-blink
  return { openEyes, seek, group: g, body: { rotation: { y: 0 }, material: mat }, tail: { rotation: { y: 0 } }, hx: M.hx, hy: M.hy, hz: M.hz, blink: null, model3d: true, update: pose, setGlow, bounds: new THREE.Box3(new THREE.Vector3(-M.hx, -M.hy, -M.hz), new THREE.Vector3(M.hx, M.hy, M.hz)) };
}
let thumbR = null;   // one renderer for all the thumbnails (a new one for each of 30 models would run out of WebGL contexts)
function makeModelThumb(sp, yaw = -.25, store = true) {   // a small side-view picture for the UI (target boards, intro cards)
  const M = MODEL3D[sp.model3d], r = thumbR || (thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })); r.setPixelRatio(1); r.setSize(200, 160, false); r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xdff4ff, 0x335577, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(2, 3, 4); sc.add(dl);
  const b = buildAnyModel(sp); sc.add(b.group); b.seek(0); b.update(0); b.openEyes(); b.group.rotation.y = yaw;
  const cam = new THREE.PerspectiveCamera(28, 200 / 160, .05, 20); cam.position.set(0, 0, M.len * 2.1); cam.lookAt(0, 0, 0); r.render(sc, cam);
  const url = r.domElement.toDataURL('image/png'); if (store) THUMB[sp.id] = url; return url;
}
function buildFish(sp) {
  if (sp.model3d) return buildAnyModel(sp);
  const art = FISHART[sp.id], g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ map: art.tex, alphaMap: art.mask, emissiveMap: art.tex, emissive: 0xffffff, emissiveIntensity: .46, alphaTest: .5, shininess: 24, specular: 0x1a2430, side: THREE.DoubleSide, fog: false });
  const uWag = { value: 0 };
  mat.onBeforeCompile = s => { s.uniforms.uWag = uWag; s.vertexShader = 'uniform float uWag;\n' + s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed=position; float tt=clamp((-position.x+.08)/.5,0.,1.); tt*=tt; transformed.z+=uWag*tt*.42; transformed.y+=uWag*tt*.08;'); };
  const body = new THREE.Mesh(art.geo, mat); g.add(body);
  // toon outline: the same body drawn inside-out and pushed outwards along its normals, in a dark shade of the fish's own colour; it follows the tail wag and the body sway
  { const ec = art.edge || [.05, .08, .12], hm = new THREE.MeshBasicMaterial({ alphaMap: art.mask, alphaTest: .5, color: new THREE.Color(ec[0], ec[1], ec[2]).convertSRGBToLinear(), side: THREE.BackSide, fog: false, polygonOffset: false });   // pushed back in depth: the body always wins where the two overlap
    hm.onBeforeCompile = s => { s.uniforms.uWag = uWag; s.vertexShader = 'uniform float uWag;\n' + s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed=position+normalize(normal)*.011; float tt=clamp((-position.x+.08)/.5,0.,1.); tt*=tt; transformed.z+=uWag*tt*.42; transformed.y+=uWag*tt*.08;').replace('#include <project_vertex>', '#include <project_vertex>\n gl_Position.z += .006 * gl_Position.w;'); };
    body.add(new THREE.Mesh(art.geo, hm)); }
  // hover glow: two additive hulls around the whole 3D body (a wide soft one and a thin bright rim), so it wraps the fish from every angle, head-on included
  const glows = [[.036, 0xff9d00, .75], [.013, 0xffe36b, 1]].map(([off, col, k]) => {
    const gm = new THREE.MeshBasicMaterial({ alphaMap: art.mask, color: col, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    gm.userData.k = k;
    gm.onBeforeCompile = s => { s.uniforms.uWag = uWag; s.vertexShader = 'uniform float uWag;\n' + s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed=position+normalize(normal)*' + off.toFixed(4) + '; float tt=clamp((-position.x+.08)/.5,0.,1.); tt*=tt; transformed.z+=uWag*tt*.42; transformed.y+=uWag*tt*.08;').replace('#include <project_vertex>', '#include <project_vertex>\n gl_Position.z += .004 * gl_Position.w;'); };
    const m = new THREE.Mesh(art.geo, gm); m.visible = false; m.renderOrder = 6; body.add(m); return m;
  });
  const tail = { rotation: { get y() { return uWag.value; }, set y(v) { uWag.value = v; } } };
  let lids = null;
  if (art.eye) { const e = art.eye, lm = new THREE.MeshPhongMaterial({ color: new THREE.Color(e.col[0] / 255, e.col[1] / 255, e.col[2] / 255).convertSRGBToLinear(), emissive: new THREE.Color(e.col[0] / 255, e.col[1] / 255, e.col[2] / 255).convertSRGBToLinear().multiplyScalar(.5), shininess: 30, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const lg = new THREE.CircleGeometry(e.r, 20); lg.translate(0, -e.r, 0); lids = []; for (const s of [1, -1]) { const l = new THREE.Mesh(lg, lm); l.position.set(e.x, e.y + e.r, e.z * s); l.scale.y = .001; g.add(l); lids.push(l); } }
  return { group: g, body, tail, glows, hx: art.hx, hy: art.hy, hz: art.hz, blink: lids ? (k => { for (const l of lids) l.scale.y = Math.max(.001, k); }) : null };
}

function buildUrchin() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(.26, 16, 12), new THREE.MeshPhongMaterial({ color: 0x2a1850, shininess: 60, emissive: 0x150a30 }));
  g.add(core);
  const spikeGeo = new THREE.ConeGeometry(.028, .4, 6); spikeGeo.translate(0, .26 + .2, 0);
  const sm = new THREE.MeshPhongMaterial({ color: 0x7a46c8, shininess: 50, emissive: 0x2a1060 });
  const tipM = new THREE.MeshBasicMaterial({ color: 0xff6ab0 });
  const n = 46;
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    const s = new THREE.Mesh(spikeGeo, sm); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); g.add(s);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.022, 6, 5), tipM); tip.position.copy(d).multiplyScalar(.26 + .4); g.add(tip);
  }
  return { group: g, kind: 'urchin' };
}

/* ============================== the jellyfish: one static FBX (bell, skirt, tentacles), moved by a vertex shader: the bell squeezes with each pulse, the tentacles trail and sway ============================== */
const JEL = { p: null, tpl: null, tex: null, ready: false, failed: false }, JEL_S = .0031;
function loadJelly() {
  if (JEL.p) return JEL.p;
  JEL.p = (async () => {
    const base = document.baseURI, [obj, tex] = await Promise.all([new FBXLoader().loadAsync(new URL('models/jelly/model.fbx', base).href), new THREE.TextureLoader().loadAsync(new URL('models/jelly/tex.png', base).href)]);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; JEL.tpl = obj; JEL.tex = tex; JEL.ready = true; if (THUMBS_MADE) makeThumbs();
  })().catch(e => { console.warn('jellyfish not loaded', e); JEL.p = null; JEL.failed = true; });
  return JEL.p;
}
let _jelId = 0;
const JEL_HUES = [0, 0, 0, 1.9, 1.05, -1.4, -2.9, -.5];   /* most jellyfish are blue; now and then one is pink, purple, green, orange or cyan (the hue turn applied to the blue picture) */
function buildJelly(hue) {
  if (hue === undefined) hue = JEL_HUES[(Math.random() * JEL_HUES.length) | 0];
  const g = new THREE.Group(), id = ++_jelId, ph = Math.random() * 6.28, bell = new THREE.Object3D(), uPulse = { value: 0 }, uPh = { value: ph }, uHue = { value: hue };   /* bell.scale is what the game sets for each pulse (as it did for the old jellyfish); the shader turns it into the squeeze */
  const mat = new THREE.MeshPhongMaterial({ map: JEL.tex, emissiveMap: JEL.tex, emissive: 0xffffff, emissiveIntensity: .55, transparent: true, opacity: .92, side: THREE.DoubleSide, shininess: 80, specular: 0x88aaff, depthWrite: false });
  const HUE = 'uniform float uHue; vec3 hueRot(vec3 c, float a) { vec3 k = vec3(.57735); return clamp(c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1. - cos(a)), 0., 1.); }\n';
  const mkMat = kind => {   /* one material per part: 0 = the bell, 1 = the tentacles, 2 = the skirt. The geometry is in the file's own small units (a bell ~3.7 wide, the tentacles ~0.5 long) */
    const m2 = mat.clone(); m2.map = JEL.tex; m2.emissiveMap = JEL.tex;
    m2.onBeforeCompile = sh => { sh.uniforms.uPulse = uPulse; sh.uniforms.uPh = uPh; sh.uniforms.uHue = uHue; sh.uniforms.uTime = U.uTime;
      sh.fragmentShader = HUE + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = hueRot(diffuseColor.rgb, uHue);').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = hueRot(totalEmissiveRadiance, uHue);');
      const body = kind === 0 ? 'transformed.xz *= 1. - .16 * uPulse; transformed.y *= 1. + .07 * uPulse;'
        : kind === 1 ? `float ty = clamp(-position.y / .75, 0., 1.), ty15 = pow(ty, 1.6), tp = atan(position.z, position.x) * 2.3 + uPh;
           float w = sin(uTime * 3. - position.y * 7. + tp) * ty15 * .22 + sin(uTime * 1.9 - position.y * 3.5 + uPh * 2.) * ty * .12 + sin(uTime * 5.5 - position.y * 14. + tp) * ty15 * .05;
           float w2 = cos(uTime * 2.6 - position.y * 6.5 + tp * 1.3) * ty15 * .2 + sin(uTime * 1.5 - position.y * 3. + uPh) * ty * .1;
           transformed.x += w; transformed.z += w2; transformed.xz *= 1. - .22 * uPulse * ty; transformed.y += ty * uPulse * .12;`
        : `/* the six thin tentacles: the mesh is turned on its side in the file, so they hang along its z axis (from .41 at the rim down to -1.83) and sway across x and y */
           float ty = clamp((.35 - position.z) / 1.5, 0., 1.), ty15 = pow(ty, 1.6), tp = uPh + sign(position.x) * 1.3 + floor(position.x * .9) * .8;   /* one phase per tentacle (not per vertex), so a tentacle bends as a whole and does not tear into slats */
           float w = sin(uTime * 3. - position.z * 4. + tp) * ty15 * .17 + sin(uTime * 1.9 - position.z * 2. + uPh * 2.) * ty * .1 + sin(uTime * 5.5 - position.z * 8. + tp) * ty15 * .02;
           float w2 = cos(uTime * 2.6 - position.z * 3.5 + tp * 1.3) * ty15 * .15 + sin(uTime * 1.5 - position.z * 1.8 + uPh) * ty * .08;
           transformed.x += w; transformed.y += w2; transformed.xy *= 1. - .18 * uPulse * ty;`;
      sh.vertexShader = 'uniform float uPulse; uniform float uPh; uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position);\n' + body); };
    m2.customProgramCacheKey = () => 'jelly' + id + 'k' + kind; return m2; };
  const mats = [mkMat(0), mkMat(1), mkMat(2)];
  const body = new THREE.Group(); body.scale.set(JEL_S * .9, JEL_S, JEL_S * .9); g.add(body);   /* 10% narrower */ body.position.y = .08;
  JEL.tpl.traverse(m => { if (!m.isMesh) return; const c = new THREE.Mesh(m.geometry, mats[m.name === 'Cube_Remeshed' ? 0 : m.name === 'Cube001' ? 2 : 1]); c.position.copy(m.position); c.rotation.copy(m.rotation); c.scale.copy(m.scale); c.frustumCulled = false; c.onBeforeRender = () => { uPulse.value = clamp((1 - bell.scale.y) / .22, 0, 1.2); }; body.add(c); });
  const proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); proxy.scale.set(.4, .5, .4); proxy.userData.pickOnly = true; g.add(proxy);   /* what a tap hits */
  return { group: g, kind: 'jelly', bell, tents: [], model: true, hue };
}

/* ============================== the octopus (it took the squid's place): one skinned FBX, its eight arms posed by code ============================== */
const OCT_TANK_K = 1.25;   /* the octopus in the tank is this much bigger than a fish of the level: with the Backup size it looked tiny in the water */
const OCT_REL = 2.43, OCT_LEN = 4 / 2.43 * .95;   /* OCT_REL: how thick it is (x a fish). OCT_LEN: it is made longer along its body, not fatter, while it lies in the Backup and flies to and from it: 3 cells long, as slim as the 2-cell one */   /* THE octopus size: its length is OCT_REL x a fish's length, everywhere (in the tank it is the fish scale of the level, in the flight and the Backup the fish's size) */
const OCT = { p: null, tpl: null, ready: false }, OCT_S = .0016, OCT_CY = .45;   /* OCT_S: the model is ~640 units tall; OCT_CY: where the middle of its body is above the tips of its arms */
const OCT_ARMS = [9, 24, 29, 34, 39, 44, 49, 54].map(n => [0, 1, 2, 3, 4].map(k => 'Bone' + String(n + k).padStart(3, '0')));
function loadOctopus() {
  if (OCT.p) return OCT.p;
  OCT.p = (async () => {
    const base = document.baseURI, [obj, tex] = await Promise.all([new FBXLoader().loadAsync(new URL('models/octopus/model.fbx', base).href), new THREE.TextureLoader().loadAsync(new URL('models/octopus/tex.jpg', base).href)]);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshPhongMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .4, shininess: 50, specular: 0x555555, side: THREE.DoubleSide });
    obj.traverse(m => { if (m.isMesh) { m.material = mat; m.frustumCulled = false; } });
    { const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'); g.drawImage(tex.image, 0, 0, 96, 96); const d = g.getImageData(0, 0, 96, 96).data; let r = 0, gg = 0, bb = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 100) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; } OCT.skin = n ? new THREE.Color(r / n / 255, gg / n / 255, bb / n / 255).convertSRGBToLinear() : new THREE.Color(0xd04030); }   /* the colour of its skin, for the eyelids */
    OCT.tpl = obj; OCT.ready = true; if (THUMBS_MADE) makeThumbs();   /* (the picture of it for the pop-ups and the Backup list) */
  })().catch(e => { console.warn('octopus not loaded', e); OCT.p = null; OCT.failed = true; });
  return OCT.p;
}
function buildSquid() {   /* (the name stays: the obstacle id is still 'squid') */
  const root = SkeletonUtils.clone(OCT.tpl), g = new THREE.Group(), body = new THREE.Group(), inner = new THREE.Group();
  { let mt = null; root.traverse(m => { if (m.isMesh) { mt = mt || m.material.clone(); m.material = mt; } }); }   /* every octopus has its OWN material: they used to share one, so fading the one in the Backup (while the camera moves) made the one in the tank invisible */
  root.scale.setScalar(OCT_S); root.position.y = -OCT_CY; inner.add(root); body.add(inner); g.add(body); g.updateMatrixWorld(true);
  let skel = null; root.traverse(m => { if (m.isSkinnedMesh && !skel) skel = m.skeleton; });
  const by = {}; for (const bn of skel.bones) by[bn.name] = bn;
  const up = new THREE.Vector3(0, 1, 0), spin = new THREE.Vector3(); by.Spin.getWorldPosition(spin);
  const arms = OCT_ARMS.map((names, i) => { const bs = names.map(n => by[n]), p = new THREE.Vector3(); bs[0].getWorldPosition(p); bs[4].scale.setScalar(.01); bs[3].scale.setScalar(.7);   /* the last bone of every arm is shrunk to nothing: the very thin tip of the mesh (which stretched into spikes) folds into the arm, which ends a little shorter and blunt */
    const rad = new THREE.Vector3(p.x - spin.x, 0, p.z - spin.z).normalize(), a1 = new THREE.Vector3().crossVectors(up, rad).normalize();
    return { rad, ang: Math.atan2(rad.x, rad.z), ph: i * 1.7, bones: bs.map(bn => { const wq = new THREE.Quaternion(); bn.getWorldQuaternion(wq); const inv = wq.clone().invert(); return { bn, rq: bn.quaternion.clone(), l1: a1.clone().applyQuaternion(inv), l2: up.clone().applyQuaternion(inv), b: 0, s: 0 }; }) }; });
  const ax = new THREE.Vector3(1, 0, 0), az = new THREE.Vector3(0, 0, 1), head = ['Spin', 'Spin1', 'Spin2'].map(n => { const bn = by[n], wq = new THREE.Quaternion(); bn.getWorldQuaternion(wq); const inv = wq.clone().invert(); return { bn, rq: bn.quaternion.clone(), lx: ax.clone().applyQuaternion(inv), lz: az.clone().applyQuaternion(inv), ly: new THREE.Vector3(0, 1, 0).applyQuaternion(inv), p: 0, r: 0, y: 0 }; });
  const proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); proxy.scale.set(.4, .5, .4); proxy.position.y = .05; proxy.userData.pickOnly = true; body.add(proxy);   /* what a tap hits (skinned meshes are not in the pick buffer) */
  const lids = [], lidMat = new THREE.MeshPhongMaterial({ color: OCT.skin || 0xd04030, emissive: OCT.skin || 0xd04030, emissiveIntensity: .35, shininess: 40, side: THREE.DoubleSide }), box = new THREE.Box3(), cc = new THREE.Vector3(), sz = new THREE.Vector3();
  g.updateMatrixWorld(true); const hb = by.Spin, hws = new THREE.Vector3(), hwq = new THREE.Quaternion(); hb.getWorldScale(hws); hb.getWorldQuaternion(hwq); const hinv = hwq.clone().invert();
  root.traverse(m => {   /* an eyelid per eye, fixed to the head bone (so it follows the head): a skin-coloured cap that comes down over the eye from above */
    if (!(m.isSkinnedMesh && /^Sphere/.test(m.name))) return; box.setFromObject(m); box.getCenter(cc); box.getSize(sz);
    const rr = (sz.x + sz.y + sz.z) / 6 * 1.15 / hws.x, fw = new THREE.Vector3(Math.sign(cc.x) * .2, .05, 1).normalize(), zl = fw.clone().applyQuaternion(hinv).normalize(), ul = new THREE.Vector3(0, 1, 0).applyQuaternion(hinv), xl = new THREE.Vector3().crossVectors(ul, zl).normalize(), yl = new THREE.Vector3().crossVectors(zl, xl).normalize();
    const pv = new THREE.Group(), lid = new THREE.Mesh(new THREE.SphereGeometry(rr, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, -rr, 0), lidMat);
    pv.position.copy(hb.worldToLocal(cc.clone())).addScaledVector(yl, rr); pv.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xl, yl, zl)); pv.add(lid); pv.scale.y = .001; pv.visible = false; hb.add(pv); lids.push(pv);
  });
  const mantle = new THREE.Object3D();
  return { group: g, kind: 'squid', body, inner, root, arms, head, lids, mantle, fins: [], tents: [], oct: true };
}
const _oq1 = new THREE.Quaternion(), _oq2 = new THREE.Quaternion();
const OCT_CR = [-.5, -.1, .06, .1, .12], OCT_WOFF = .4, OCT_FLY = .12;   /* OCT_CR: how the five bones of an arm bend when it lies flat on the sand or the glass; OCT_WOFF: how far its middle is from the glass; OCT_FLY: its middle above the sand */
function octoCycle(ph) {   /* one swim stroke, ph in 0..1: the arms FLARE open and curl (wind-up, the body hangs back), then SNAP: they whip together behind it and the body is thrown forward, then it glides while the arms slowly spread again */
  const bump = (x, a0, a1, k = 2) => { const u = (x - a0) / (a1 - a0); return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** k; };
  const flare = bump(ph, -.02, .4, 2), thrust = bump(ph, .36, .62, 1.4), glide = bump(ph, .5, 1.05) + bump(ph + 1, .5, 1.05);
  return { contract: flare * .35, flare, thrust, glide };
}
/* every bone follows its target through a low-pass filter, slower towards the tips: that is what makes the arms and the head trail behind the body and swing past (follow-through) instead of moving in lock-step */
function octoAnim(b, dt, P) {
  const fl = P.flare || 0, wt = P.wt, v = P.v, ink = P.ink || 0, ct = P.contract || 0, th = P.thrust || 0, gl = P.glide || 0, pk = P.pk || 0, walk = P.walk || 0, land = P.land || 0, gt = P.gait || 0, wind = P.wind || 0;
  b.arms.forEach((arm, i) => {
    const rx = arm.rad.x, rz = arm.rad.z;
    arm.bones.forEach((q, j) => {
      const k = j / 4, w = [.55, .4, .3, .2, .1][j];
      let fb = .1 + .045 * j + (ct * (.3 + .45 * k) + th * (.6 + 1.05 * k)) - gl * (.05 + .3 * k) - fl * (.55 + .95 * k) + (.4 + .3 * gl) * Math.sin(wt * 1.5 - j * .95 + arm.ph) * (.4 + .3 * j) - ink * (.55 + .12 * j) - wind * (.25 + .4 * k) - land * (.25 + .1 * j) + (P.kick || 0) * (.35 + .75 * k);   /* in the recoil the arms are pulled tight together and stream out behind it */
      let fs = (.5 * Math.sin(wt * 1.1 - j * .7 + arm.ph * 1.7) * (.3 + .3 * j)) * (1 + gl * .6 + fl * 1.2) + ink * .35 * Math.sin(wt * 8 + arm.ph + j) * (.3 + .2 * j);
      if (P.vyaw) fs += P.vyaw * (.12 + .06 * j) * (rz >= 0 ? 1 : -.6);   /* in a turn the arms swing out behind the body */
      if (v) { fb += (v.z * rz + v.x * rx) * w * .9 + v.y * (.18 + .1 * j) * .6; fs += (v.z * rx * -1 + v.x * rz) * w * .9; }   /* trailing: the arms are dragged back, to the side and down by the way it moves */
      /* crawling: the arms ripple like waves from the root to the tip (big sideways S-curves, the tips curl), and pull in turn: reaching ahead, then drawing back and carrying the body with them; nothing steps or lifts like a spider's leg */
      const pull = Math.sin(gt * 6.283 - j * .7 + arm.ph), rip = Math.sin(wt * 1.3 - j * .95 + arm.ph * 1.3);
      const cb = OCT_CR[j] + (.2 + .03 * j) * pull * walk * (.4 + .6 * Math.abs(rz)) + .1 * rip * (.4 + .08 * j) + land * .1, cs = (.5 * rip + .22 * pull * rx * -1) * (.3 + .12 * j) * (.5 + .5 * walk) + .06 * Math.sin(wt * .5 + arm.ph + j);
      const tipK = [1, 1, .9, .4, 0][j], cm = [1.8, 1.8, 1.6, 1.2, 1][j], fb2 = fb * cm, fs2 = fs * (1 + (cm - 1) * .6), lim = [.9, .9, .75, .3, 0][j], tb = clamp((fb2 + (cb - fb2) * pk) * tipK, -lim, lim), ts = clamp((fs2 + (cs - fs2) * pk) * tipK, -lim, lim), tau   /* no bone is ever bent past a limit (the thin tips stretch into spikes when they are) */   /* the last bone is never bent (it just follows the bone before it) and the one before only a little: bending the thin tip made the hooks and spikes */ = .06 + .07 * j, f = dt >= 5 ? 1 : 1 - Math.exp(-dt / tau);
      q.b += (tb - q.b) * f; q.s += (ts - q.s) * f;
      q.bn.quaternion.copy(q.rq).multiply(_oq1.setFromAxisAngle(q.l1, q.b)).multiply(_oq2.setFromAxisAngle(q.l2, q.s));
    });
  });
  b.head.forEach((h, k) => {   /* the head: three bones (the mantle) that nod and roll a little behind the body */
    const tp = (P.hp || 0) * [.3, .45, .6][k] + (pk ? Math.sin(wt * 1.5) * .05 * walk : 0), tr = (P.hr || 0) * [.3, .45, .6][k] + (pk ? Math.sin(wt * 1.5 + 1.4) * .07 * walk : 0) + Math.sin(wt * .7 + k) * .03, tau = .07 + .09 * k, f = dt >= 5 ? 1 : 1 - Math.exp(-dt / tau);
    const ty = (P.hy || 0) * [.3, .5, .7][k]; h.p += (tp - h.p) * f; h.r += (tr - h.r) * f; h.y += (ty - h.y) * f;
    h.bn.quaternion.copy(h.rq).multiply(_oq1.setFromAxisAngle(h.lx, h.p)).multiply(_oq2.setFromAxisAngle(h.lz, h.r)).multiply(_oq2.setFromAxisAngle(h.ly, h.y));
  });
}
function octoPose(b, wt, jet, pk, walk, ink = 0) { octoAnim(b, 10, { wt, contract: jet, pk, walk, ink }); }   /* a still pose (the picture of it) */
function octoBlink(b, dt) {
  const k = b.blk || (b.blk = { t: rand(1, 3), p: -1 }); k.t -= dt; if (k.p < 0 && k.t <= 0) k.p = 0;
  let v = 0; if (k.p >= 0) { k.p += dt / .24; v = k.p < .32 ? k.p / .32 : k.p < .5 ? 1 : Math.max(0, 1 - (k.p - .5) / .5); if (k.p >= 1) { k.p = -1; k.t = Math.random() < .25 ? .18 : rand(2, 5); v = 0; } }
  for (const pv of b.lids) { pv.scale.y = Math.max(.001, v); pv.visible = v > .03; }
}
function wallNormal(x, z, y, out) {   /* which way the glass faces at (x, z): out of the tank */
  const e = .05, f = (px, pz, py) => Math.hypot(px, pz) - wallAt(px, pz, py);   /* (the glass of a bowl leans in above and below the middle, so the normal has a vertical part) */
  out.set(f(x + e, z, y) - f(x - e, z, y), f(x, z, y + e) - f(x, z, y - e), f(x, z + e, y) - f(x, z - e, y)); if (out.lengthSq() < 1e-8) out.set(x, 0, z); return out.normalize();
}
function octoWallPos(S, out, k = 1) { const c = Math.cos(S.a), sn = Math.sin(S.a), wl = wallAt(c, sn, S.wy), off = S.woff === undefined ? OCT_WOFF * k + .3 : S.woff; return out.set(c * (wl - off), S.wy, sn * (wl - off)); }   /* S.woff: how far its middle is from the glass: found by measuring, so the tips of its arms really lie ON the glass */   /* (a little extra: its arms lie on a curved glass and would stick out through it) */
const _ow = new THREE.Vector3(), _on = new THREE.Vector3(), _ox = new THREE.Vector3(), _oy = new THREE.Vector3(), _om = new THREE.Matrix4(), _oQ = new THREE.Quaternion(), _oE = new THREE.Euler(), _ov = new THREE.Vector3(), _oiq = new THREE.Quaternion(), _opv = new THREE.Vector3(), _oz2 = new THREE.Vector3();
function squidUpdate(o, dt, t, age) {   /* the octopus: it swims in pushes (squeeze, thrust, glide), sprays ink (wind-up, burst), crawls on the sand and climbs the glass */
  const b = o.parts, S = o.oc || (o.oc = { mode: 'swim', t: 0, next: rand(6, 10), wt: rand(0, 6), ph: rand(0, 1), fk: 0, wk: 0, a: 0, wy: 2, wa: 0, wyT: 2, pk: 0, walk: 0, gait: 0, land: 0, wind: 0, ink: 0, lean: 0, fwp: new THREE.Vector3(), mv: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(), pp: o.pos.clone(), vyaw: 0, yawP: 0 });
  S.t += dt; o.dash = Math.max(0, (o.dash || 0) - dt);
  const fy = FLOOR_Y + (OCT_FLY + .3) * o.sz, wasFk = S.fk, wasWk = S.wk;
  if (S.mode !== 'swim' && S.t > S.next && S.wind <= 0) {   /* it has had enough of the sand / the glass: it pushes off and swims on */
    const was = S.mode; S.mode = 'swim'; S.t = 0; S.next = 0; S.cool = rand(14, 26); S.ph = 0; o.wp = new THREE.Vector3(o.pos.x * (was === 'wall' ? .45 : 1), clamp(o.pos.y + 1.6, FLOOR_Y + 1.6, WATER_Y - 1), o.pos.z * (was === 'wall' ? .45 : 1)); o.wpT = 8; o.dir.set(-o.pos.x * (was === 'wall' ? .5 : 0), .5, -o.pos.z * (was === 'wall' ? .5 : 0)).normalize();
  } else if (S.mode === 'swim') {   /* only when it happens to swim close to the sand or the glass, and only now and then, it settles there; otherwise it just swims */
    S.cool = Math.max(0, (S.cool === undefined ? rand(5, 10) : S.cool) - dt);
    if (S.cool <= 0 && S.wind <= 0 && age > 3) {
      const nearFloor = o.pos.y - FLOOR_Y < (OCT_FLY + .3) * o.sz + .7, nearWall = wallAt(o.pos.x, o.pos.z, o.pos.y) - Math.hypot(o.pos.x, o.pos.z) < OCT_WOFF * o.sz + .7;
      if (nearFloor && Math.random() < dt * .3) {   /* (climbing the glass was taken out: it only settles on the sand) */
        if (false) { S.mode = 'wall'; S.t = 0; S.next = rand(16, 24); S.a = Math.atan2(o.pos.z, o.pos.x); S.wy = clamp(o.pos.y, FLOOR_Y + 1, WATER_Y - 1.3); S.wa = S.a; S.wyT = S.wy; }
        else { S.mode = 'floor'; S.t = 0; S.next = rand(14, 22); S.fwp.copy(randomPoint(o)); S.fwp.y = fy; }
      }
    }
  }
  let cyc = { contract: 0, thrust: 0, glide: 0 };   /* the swim: one push every ~1.5 s */
  if (S.mode === 'swim') { S.ph = (S.ph + dt / (2.1 - Math.min(.7, o.dash * .8))) % 1; cyc = octoCycle(S.ph); }
  if (S.wind > 0) { S.wind -= dt; cyc.contract = Math.max(cyc.contract, smooth01(1 - S.wind / .4)); cyc.thrust = 0; if (S.wind <= 0) { S.ink = 1; { o.group.updateMatrixWorld(true); const mouth = o.group.localToWorld(new THREE.Vector3(0, -.28, 0)); if (S.wk > .5) mouth.lerp(new THREE.Vector3(0, mouth.y, 0), .18);
          const jd = o.group.localToWorld(new THREE.Vector3(0, -1, 0)).sub(o.group.position).normalize().multiplyScalar(.6).addScaledVector(o.dir, -.8); if (S.wk > .5) { wallNormal(o.pos.x, o.pos.z, o.pos.y, _on); jd.copy(_on).multiplyScalar(.9).add(new THREE.Vector3(0, -.4, 0)); } else if (S.fk > .85) jd.set(-o.dir.x * .5, -.9, -o.dir.z * .5); jd.normalize();
          S.kick = (S.kick || new THREE.Vector3()).copy(jd).multiplyScalar(-(S.mode === 'swim' ? 4.2 : 2.6)); S.kickT = 0; sprayInk({ pos: mouth }, jd); if (S.mode === 'wall') { S.mode = 'swim'; S.cool = rand(14, 26); S.ph = .2; o.dir.copy(S.kick).normalize(); } }   /* it jets the ink out of its funnel one way and is thrown the other: a hard kick that fades away (recoil) */   /* the ink leaves from underneath it, where the arms start (its funnel), not from the middle of the body */ o.inkT = rand(13, 19); if (S.mode === 'swim') { o.dash = .9; S.ph = .2; o.wp = randomPoint(o); o.wp.y = clamp(o.wp.y, FLOOR_Y + 1.2, WATER_Y - .8); o.wpT = rand(6, 10); o.dir.lerp(dTmp.subVectors(o.wp, o.pos).normalize(), .8).normalize(); } } }
  let moving = 0;
  if (S.mode === 'swim') {
    if (o.pos.distanceTo(o.wp) < .4 || o.wpT <= 0) { o.wp = randomPoint(o); o.wp.y = clamp(o.wp.y, FLOOR_Y + 1.2, WATER_Y - .8); o.wpT = rand(6, 12); } o.wpT -= dt;
    dTmp.subVectors(o.wp, o.pos).normalize(); o.dir.lerp(dTmp, 1 - Math.exp(-dt * (.5 + .9 * cyc.thrust))).normalize(); separate(o, dt);
    S.sp = (S.sp || 0) + (o.speed * 1.9 * (.08 + 3.4 * cyc.thrust + .5 * cyc.glide + o.dash * 2) - (S.sp || 0)) * (1 - Math.exp(-dt * (cyc.thrust > .05 ? 9 : 2.2))); o.pos.addScaledVector(o.dir, S.sp * dt); moving = 1;   /* it speeds up and slows down smoothly with each push */
    { const rr = Math.hypot(o.pos.x, o.pos.z), lim = (RF - .1) * shK(o.pos.x, o.pos.z, o.pos.y); if (rr > lim) { o.pos.x *= lim / rr; o.pos.z *= lim / rr; o.dir.x -= o.pos.x / lim * .5; o.dir.z -= o.pos.z / lim * .5; o.dir.normalize(); } o.pos.y = clamp(o.pos.y, FLOOR_Y + .6, WATER_Y - .7); }
    S.fk = Math.max(0, S.fk - dt * 1.5); S.wk = Math.max(0, S.wk - dt * 1.5);
  } else if (S.mode === 'floor') {
    if (Math.hypot(S.fwp.x - o.pos.x, S.fwp.z - o.pos.z) < .35) { S.fwp.copy(randomPoint(o)); S.fwp.y = fy; }
    dTmp.set(S.fwp.x - o.pos.x, 0, S.fwp.z - o.pos.z).normalize(); S.fk = 1 - clamp((o.pos.y - fy) / 1.4, 0, 1);
    if (S.fk > .85) { o.dir.lerp(dTmp, 1 - Math.exp(-dt * 2.2)); o.dir.y = 0; } else { dTmp.y = -.55; o.dir.lerp(dTmp, 1 - Math.exp(-dt * 2)); S.ph = (S.ph + dt / 1.5) % 1; cyc = octoCycle(S.ph); }
    o.dir.normalize(); const sp = S.fk > .85 ? .42 * (.55 + .45 * Math.sin(S.gait * 6.283 * 2 + 1)) : .32 * (.2 + 3 * cyc.thrust); o.pos.x += o.dir.x * sp * dt; o.pos.z += o.dir.z * sp * dt; o.pos.y += (fy - o.pos.y) * (1 - Math.exp(-dt * 1.4)); moving = S.fk > .85 ? 1 : .3;   /* on the sand it advances with each step */
    { const rr = Math.hypot(o.pos.x, o.pos.z), lim = (RF - .1) * shK(o.pos.x, o.pos.z, o.pos.y); if (rr > lim) { o.pos.x *= lim / rr; o.pos.z *= lim / rr; } }
    S.wk = Math.max(0, S.wk - dt * 1.5);
  } else {   /* the glass */
    octoWallPos(S, _ow, o.sz); const dist = o.pos.distanceTo(_ow);
    if (S.wk < .98) { S.ph = (S.ph + dt / 1.7) % 1; cyc = octoCycle(S.ph); dTmp.subVectors(_ow, o.pos).normalize(); o.dir.lerp(dTmp, 1 - Math.exp(-dt * 2)).normalize(); S.sp = (S.sp || 0) + (Math.min(dist * 1.4, .28 + 1.4 * cyc.thrust) - (S.sp || 0)) * (1 - Math.exp(-dt * 3)); o.pos.addScaledVector(o.dir, Math.min(S.sp * dt, dist)); S.wk = Math.max(S.wk, 1 - clamp((dist - .12) / 1.0, 0, 1)); if (dist < .1) S.wk = 1; moving = .4; }   /* it swims over to the glass with its own pushes, then settles on it */
    else {
      S.wk = 1; const rr = Math.hypot(o.pos.x, o.pos.z) || 1, da = Math.atan2(Math.sin(S.wa - S.a), Math.cos(S.wa - S.a)), dy = S.wyT - S.wy;
      if (Math.abs(da) * rr < .35 && Math.abs(dy) < .3) { S.wa = S.a + rand(-1.8, 1.8); S.wyT = rand(FLOOR_Y + 1, WATER_Y - 1.3); }   /* it keeps going: a new place is chosen before it gets to the last one */
      const v = .34 * (.55 + .45 * Math.sin(S.gait * 6.283 * 2 + 1)), sa = clamp(da * rr, -1, 1), sy = clamp(dy, -1, 1); S.a += sa * v * dt / rr; S.wy += sy * v * dt; octoWallPos(S, _ow, o.sz); _ov.subVectors(_ow, o.pos); o.pos.copy(_ow);
      if (_ov.lengthSq() > 1e-8) S.mv.lerp(_ov.normalize(), 1 - Math.exp(-dt * 3)).normalize(); moving = 1;
    }
    S.fk = Math.max(0, S.fk - dt * 1.5);
  }
  if ((wasFk <= .85 && S.fk > .85) || (wasWk < .98 && S.wk >= .98)) S.land = 1;   /* touch down: a little squash and the arms splay */
  if (S.kick && S.kick.lengthSq() > .01) {   /* the recoil: thrown away from the jet, then it drifts to a stop; it also swings the body round (the funnel end goes the other way) */
    S.kickT += dt; o.pos.addScaledVector(S.kick, dt); S.kick.multiplyScalar(Math.exp(-dt * 2.4));
    if (S.mode === 'swim') { o.dir.lerp(_ov.copy(S.kick).normalize(), 1 - Math.exp(-dt * 6)).normalize(); o.pos.y = clamp(o.pos.y, FLOOR_Y + .6, WATER_Y - .7); { const rr = Math.hypot(o.pos.x, o.pos.z), lim = (RF - .1) * shK(o.pos.x, o.pos.z, o.pos.y); if (rr > lim) { o.pos.x *= lim / rr; o.pos.z *= lim / rr; } } }
    else if (S.mode === 'floor') o.pos.y = Math.max(o.pos.y, fy - .05);
    cyc.thrust = Math.max(cyc.thrust, Math.min(1, S.kick.length() / 3.2));
  }
  S.land = Math.max(0, S.land - dt / .6);
  S.walk += ((moving > .5 && (S.fk > .85 || S.wk > .95) ? 1 : 0) - S.walk) * (1 - Math.exp(-dt * 3)); S.pk += (Math.max(S.fk > .6 ? 1 : 0, S.wk > .5 ? 1 : 0) - S.pk) * (1 - Math.exp(-dt * 2.5));
  S.wt += dt * 2.2; S.gait = (S.gait + dt * .6 * S.walk) % 1; S.ink = Math.max(0, S.ink - dt / 1.3); const inkK = S.ink * S.ink * (3 - 2 * S.ink);
  _ov.subVectors(o.pos, S.pp).divideScalar(Math.max(dt, 1e-3)); S.pp.copy(o.pos); S.v.lerp(_ov, 1 - Math.exp(-dt * 8)); _oiq.copy(o.group.quaternion).invert(); _opv.copy(S.v).applyQuaternion(_oiq).multiplyScalar(.9);   /* how fast it really moves, seen from its own side: the arms are dragged by it and the head swings behind it */
  const want = Math.atan2(o.dir.x, o.dir.z), turn = Math.atan2(Math.sin(want - S.yawP), Math.cos(want - S.yawP)), step = turn * (1 - Math.exp(-dt * (1.6 + 1.6 * cyc.thrust + .8 * S.walk))); S.yawP += step; const yawNow = S.yawP; S.vyaw += (clamp(step / Math.max(dt, 1e-3), -3, 3) - S.vyaw) * (1 - Math.exp(-dt * 6));   /* the body turns more slowly than the direction it wants: the head looks ahead, the arms swing out, it banks into the turn */
  const km = S.kick ? Math.min(1, S.kick.length() / 3.6) : 0;   /* how hard it is still being thrown by the last jet */
  octoAnim(b, dt, { wt: S.wt, flare: cyc.flare, contract: cyc.contract, thrust: cyc.thrust, glide: cyc.glide, pk: S.pk, walk: S.walk, gait: S.gait, ink: inkK * (km > .05 ? smooth01((S.kickT - .3) / .35) : 1), kick: km, wind: S.wind > 0 ? smooth01(1 - S.wind / .4) : 0, land: S.land, v: _opv, vyaw: S.vyaw, hy: clamp(turn * .9, -.9, .9), hp: -.25 * cyc.flare + .3 * cyc.thrust - _opv.z * .4 + .55 * km - (S.wind > 0 ? .35 : 0), hr: -S.vyaw * .12 + Math.sin(S.wt * .8 + o.phase) * .04 });
  octoBlink(b, dt);
  S.lean += ((S.mode === 'swim' ? .12 + .3 * cyc.thrust - .08 * cyc.contract + .75 * km : 0) - S.lean) * (1 - Math.exp(-dt * (3.5 + 4 * km)));   /* it points its head along the way it is thrown, arms trailing */   /* its attitude: floating = facing where it goes, leaning into each push; on the sand = low, facing where it walks; on the glass = flat on it, face out, head up */
  let tq = _oQ.setFromEuler(_oE.set(S.lean - o.dir.y * .5, yawNow, -S.vyaw * .1, 'YXZ')).clone();
  if (S.wk > .5) { wallNormal(o.pos.x, o.pos.z, o.pos.y, _on); _oy.copy(_on).negate(); _ox.copy(S.mv).addScaledVector(_on, -S.mv.dot(_on)); if (_ox.lengthSq() < 1e-4) _ox.set(0, 1, 0); _ox.normalize(); _oz2.crossVectors(_oy, _ox).normalize(); _om.makeBasis(_oz2, _oy, _ox); tq = new THREE.Quaternion().setFromRotationMatrix(_om); }   /* on the glass: the arms are the part that touches it, spread flat, and the head sticks out into the tank; it goes the way its front points */
  o.group.quaternion.slerp(tq, 1 - Math.exp(-dt * 4));
  if (S.wk > .9 && S.mode === 'wall') {   /* touch the glass: measure how far the nearest arm tip is from it and move the body until that is just a skin's thickness */
    let gap = 9; for (const arm of b.arms) { arm.bones[4].bn.getWorldPosition(_ow); gap = Math.min(gap, wallAt(_ow.x, _ow.z, _ow.y) - Math.hypot(_ow.x, _ow.z)); }
    S.woff = clamp((S.woff === undefined ? OCT_WOFF * o.sz + .3 : S.woff) - (gap - .02) * Math.min(1, dt * 3), .05, 1.6);
  } else if (S.mode !== 'wall') S.woff = undefined;
  b.body.position.y += (-.08 * S.fk - b.body.position.y) * (1 - Math.exp(-dt * 4));
  const sqz = cyc.thrust * .1 + cyc.contract * .04 + inkK * .05 + S.land * .1 + (S.wind > 0 ? .05 : 0);   /* the body squeezes on each push and bounces back */
  b.inner.scale.set(1 - sqz * .8, 1 + cyc.thrust * .14 + cyc.contract * .05 + inkK * .07 - S.land * .12, 1 - sqz * .8);
  b.inner.rotation.z = Math.sin(t * 1.1 + o.phase) * .06 * (1 - S.pk); b.inner.rotation.x = Math.sin(t * .8 + o.phase * 2) * .05 * (1 - S.pk);
  if (o.inkT === undefined) o.inkT = rand(5, 9); o.inkT -= dt;
  if (o.inkT <= 0 && age > 1 && S.wind <= 0) S.wind = .4;   /* wind up first: it draws in, then it bursts */
}
let _lock = null; function lockTex() {
  if (_lock) return _lock; const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
  g.lineWidth = 11; g.strokeStyle = '#7a3a00'; g.beginPath(); g.arc(48, 38, 18, Math.PI, 0); g.lineTo(66, 50); g.moveTo(30, 38); g.lineTo(30, 50); g.stroke();
  g.lineWidth = 6; g.strokeStyle = '#ffe27a'; g.beginPath(); g.arc(48, 38, 18, Math.PI, 0); g.lineTo(66, 50); g.moveTo(30, 38); g.lineTo(30, 50); g.stroke();
  g.fillStyle = '#ffc21a'; g.strokeStyle = '#7a3a00'; g.lineWidth = 7; g.beginPath(); g.roundRect(18, 48, 60, 40, 10); g.fill(); g.stroke();
  g.fillStyle = '#fff1a8'; g.beginPath(); g.roundRect(24, 53, 48, 10, 5); g.fill();
  g.fillStyle = '#7a3a00'; g.beginPath(); g.arc(48, 66, 6, 0, 6.283); g.fill(); g.fillRect(45, 66, 6, 13);
  _lock = new THREE.CanvasTexture(c); _lock.colorSpace = THREE.SRGBColorSpace; return _lock;
}
const heldTex = {};
function buildClamOld() {   /* the first, hand-made clam (kept as the fallback if the model does not load) */
  const g = new THREE.Group();
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64; { const x = sc.getContext('2d'); const N = 10; for (let i = 0; i < N; i++) { const g = x.createLinearGradient(i * 256 / N, 0, (i + 1) * 256 / N, 0); g.addColorStop(0, '#ff7fbd'); g.addColorStop(.45, '#ffc3de'); g.addColorStop(.62, '#ffd9ea'); g.addColorStop(1, '#ff6aae'); x.fillStyle = g; x.fillRect(i * 256 / N, 0, 256 / N + 1, 64); } }
  const shellTex = new THREE.CanvasTexture(sc); shellTex.colorSpace = THREE.SRGBColorSpace; shellTex.wrapS = THREE.RepeatWrapping;
  const shell = new THREE.MeshPhongMaterial({ map: shellTex, color: 0xffffff, emissive: 0x6a2a58, shininess: 90, specular: 0xffffff, side: THREE.DoubleSide });
  const rimM = new THREE.MeshPhongMaterial({ color: 0xffd6ea, emissive: 0x8a4a70, shininess: 60 });
  const bot = new THREE.Mesh(new THREE.SphereGeometry(.34, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shell); bot.scale.set(1.1, .6, .9); g.add(bot);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(.33, 24).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xffe9f3, emissive: 0x9a5a80 })); pad.scale.set(1.1, 1, .9); pad.position.y = -.005; g.add(pad);
  const pivot = new THREE.Group(); pivot.position.set(0, 0, -.3); g.add(pivot);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(.34, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell); lid.scale.set(1.1, .6, .9); lid.position.z = .3; pivot.add(lid);
  for (const z of [0, .3]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(.34, .022, 8, 32).rotateX(Math.PI / 2), rimM); rim.scale.set(1.1, 1, .9); rim.position.z = z; (z ? pivot : g).add(rim); }
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(.1, 16, 12), new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0xa0a0c0, shininess: 140, specular: 0xffffff })); pearl.position.set(0, .07, .02); g.add(pearl);
  const sprMat = (map, extra = {}) => new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, fog: false, ...extra });
  const lock = new THREE.Sprite(sprMat(lockTex())); lock.renderOrder = 30; lock.scale.set(.4, .4, 1); lock.position.y = .55; lock.visible = false; g.add(lock);
  const held = new THREE.Sprite(sprMat(null, { opacity: .85, color: 0x9fb8ff })); held.renderOrder = 30; held.position.y = 1; held.visible = false; g.add(held);   // silhouette of the fish inside
  const pc = document.createElement('canvas'); pc.width = 128; pc.height = 40; const pipsTex = new THREE.CanvasTexture(pc);
  const pips = new THREE.Sprite(sprMat(pipsTex)); pips.renderOrder = 30; pips.scale.set(.5, .156, 1); pips.position.y = .3; pips.visible = false; g.add(pips);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe27a, transparent: true, depthWrite: false, fog: false, ...ADD, opacity: .4 })); glow.scale.set(1.3, 1.3, 1); glow.position.y = .15; g.add(glow);
  return { group: g, kind: 'clam', lid: pivot, pearl, lock, held, pips, pipsCanvas: pc, pipsTex, glow, open: .5 };
}
/* ============================== the clam: the artist's model (two shell halves and a pearl, no bones). The top half hangs on a pivot at the hinge and the game turns it; the old code only needed .lid, .pearl and the little sprites, so those are kept ============================== */
const CLAM = { p: null, tpl: null, tex: null, ready: false, failed: false }, CLAM_S = .0058;   /* bigger than a fish: it has to be able to swallow one */
function smoothNormals(geo, cos = .55) {   /* the model's faces were each lit flat (that is the rough, faceted look): the normal of every corner becomes the average of the normals of the corners that share its place and lean about the same way (creases that are really sharp stay) */
  if (geo._smooth) return; geo._smooth = true; if (!geo.attributes.normal) geo.computeVertexNormals(); const P = geo.attributes.position, N = geo.attributes.normal, n = P.count, key = new Map(), q = 1e3;
  for (let i = 0; i < n; i++) { const k = Math.round(P.getX(i) * q) + ',' + Math.round(P.getY(i) * q) + ',' + Math.round(P.getZ(i) * q); let a = key.get(k); if (!a) key.set(k, a = []); a.push(i); }
  const out = new Float32Array(n * 3);
  for (const a of key.values()) for (const i of a) { let x = 0, y = 0, z = 0; const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i); for (const j of a) { const jx = N.getX(j), jy = N.getY(j), jz = N.getZ(j); if (jx * nx + jy * ny + jz * nz > cos) { x += jx; y += jy; z += jz; } } const l = Math.hypot(x, y, z) || 1; out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l; }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}
function loadClam() {
  if (CLAM.p) return CLAM.p;
  CLAM.p = (async () => {
    const base = document.baseURI, [obj, tex] = await Promise.all([new FBXLoader().loadAsync(new URL('models/clam/model.fbx', base).href), new THREE.TextureLoader().loadAsync(new URL('models/clam/tex.png', base).href)]);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; obj.traverse(m => { if (m.isMesh) smoothNormals(m.geometry); }); CLAM.tpl = obj; CLAM.tex = tex; CLAM.ready = true; if (THUMBS_MADE) makeThumbs();
  })().catch(e => { console.warn('clam not loaded', e); CLAM.p = null; CLAM.failed = true; });
  return CLAM.p;
}
function buildClam() {
  const b = buildClamOld(); if (!CLAM.ready) return b;
  for (const ch of b.group.children.slice()) if (!ch.isSprite) b.group.remove(ch);   /* out with the hand-made shell: only the sprites (lock, held fish, pips, glow) stay */
  const mat = new THREE.MeshPhongMaterial({ map: CLAM.tex, emissiveMap: CLAM.tex, emissive: 0xffffff, emissiveIntensity: .32, shininess: 70, specular: 0x886688, side: THREE.DoubleSide });   /* its own material: they are faded one by one */
  const M = new THREE.Group(), root = CLAM.tpl.clone(true); root.updateMatrixWorld(true); M.add(root);
  M.scale.setScalar(CLAM_S); M.position.set(0, 35 * CLAM_S, 252.5 * CLAM_S);   /* the seam of the shell is at the origin */
  let top = null, bottom = null, pearl = null; root.traverse(m => { if (!m.isMesh) return; m.material = mat; m.frustumCulled = false; if (m.name === 'Cube_Remeshed') top = m; else if (m.name === 'Cube_Remeshed001') bottom = m; else pearl = m; });
  const pivot = new THREE.Group(); pivot.position.set(0, -35, -347); root.add(pivot); root.updateMatrixWorld(true); if (top) pivot.attach(top);   /* the hinge: the back edge on the seam */
  if (pearl) {   /* the pearl is small compared with the shell: shrunk about ITS OWN centre (the mesh's vertices sit in shell space, so scaling the mesh itself pulled the pearl into the shell and it vanished) */
    pearl.geometry = pearl.geometry.clone(); pearl.geometry.computeBoundingBox(); const pc = pearl.geometry.boundingBox.getCenter(new THREE.Vector3()); pearl.geometry.translate(-pc.x, -pc.y, -pc.z);
    pearl.position.add(pc.clone().multiply(pearl.scale).applyQuaternion(pearl.quaternion)); pearl.scale.multiplyScalar(.5); }
  b.group.add(M); b.lid = pivot; b.pearl = pearl || new THREE.Object3D(); b.open = .5; b.model = true;
  return b;
}
function drawPips(p, n, total) {
  const c = p.pipsCanvas, g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  for (let i = 0; i < total; i++) { const x = c.width / 2 + (i - (total - 1) / 2) * 34; g.beginPath(); g.arc(x, 20, 12, 0, 6.283); g.fillStyle = i < n ? '#ffd23a' : 'rgba(255,255,255,.25)'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#7a3a00'; g.stroke(); }
  p.pipsTex.needsUpdate = true;
}

/* ============================== thumbnails ============================== */
const THUMB = {}; // id -> dataURL
function makeThumbs() {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(200, 160, false); r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xdff4ff, 0x335577, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(2, 3, 4); sc.add(dl);
  const cam = new THREE.PerspectiveCamera(28, 200 / 160, .1, 20);
  const hand = buildHand(); hand.rotation.set(0, 0, 0); hand.userData.body.rotation.z = .75;
  { const pm = new THREE.MeshPhongMaterial({ color: 0xffb347, emissive: 0x803000 }); for (let i = 0; i < 9; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), pm); p.position.set(-.55 - (i % 3) * .1, -.1 - (i % 4) * .12, rand(-.08, .08)); hand.add(p); } }
  const clam = buildClam().group; clam.children.filter(c => c.isSprite).forEach(c => clam.remove(c)); clam.children.find(c => c.isGroup).rotation.x = -.65;
  const items = [{ id: 'urchin', obj: buildUrchin().group, rot: [.3, .5] }, ...(JEL.ready ? [{ id: 'jelly', obj: buildJelly().group, rot: [.1, .4] }] : []), ...(OCT.ready ? [(() => { const sq = buildSquid(); octoPose(sq, 1, 0, 0, 0); return { id: 'squid', obj: sq.group, rot: [.1, .3] }; })()] : []), { id: 'clam', obj: clam, rot: [.9, .5] }, { id: 'hand', obj: hand, rot: [0, .35] }];
  for (const it of items) {
    it.obj.rotation.set(it.rot[0] * .5, it.rot[1], it.rot[0] * .3, 'YXZ');  // fish: flat side view
    sc.add(it.obj);
    const box = new THREE.Box3().setFromObject(it.obj), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    it.obj.position.sub(ctr);
    const need = Math.max(size.x / (200 / 160), size.y) * 1.25;
    cam.position.set(0, 0, need / (2 * Math.tan(THREE.MathUtils.degToRad(14))) + size.z * .5); cam.lookAt(0, 0, 0);
    const fitCrop = (W, H) => { const src = document.createElement('canvas'); src.width = W; src.height = H; const q = src.getContext('2d'); q.drawImage(r.domElement, 0, 0, W, H); const d = q.getImageData(0, 0, W, H).data; let x0 = W, x1 = -1, y0 = H, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } if (x1 <= x0) return r.domElement.toDataURL('image/png'); const w = x1 - x0 + 1, h = y1 - y0 + 1, k = Math.min(W * .94 / w, H * .94 / h), out = document.createElement('canvas'); out.width = W; out.height = H; out.getContext('2d').drawImage(src, x0, y0, w, h, (W - w * k) / 2, (H - h * k) / 2, w * k, h * k); return out.toDataURL('image/png'); };   /* the jellyfish picture is cropped to the jellyfish: it sat small in a big empty frame */
    r.render(sc, cam); THUMB[it.id] = it.id === 'jelly' ? fitCrop(200, 160) : r.domElement.toDataURL('image/png');
    r.setSize(640, 512, false); r.render(sc, cam); THUMB[it.id + '_big'] = it.id === 'jelly' ? fitCrop(640, 512) : r.domElement.toDataURL('image/png'); r.setSize(200, 160, false);   // a large copy for the first-time pop-ups
    sc.remove(it.obj);
  }
  if (OCT.ready) {   /* a wide picture of the octopus spread out, for the three Backup cells it takes (the Out of space pop-up) */
    const sq = buildSquid(); octoAnim(sq, 10, { wt: 1, contract: .2, glide: .3 }); sq.group.scale.set(1, OCT_LEN, 1); sq.group.rotation.set(0, 0, Math.PI / 2); sc.add(sq.group); sq.group.updateMatrixWorld(true); r.setSize(600, 360, false);
    const bb = new THREE.Box3().setFromObject(sq.group), sz2 = bb.getSize(new THREE.Vector3()), ct = bb.getCenter(new THREE.Vector3()), asp = 600 / 360; cam.aspect = asp; cam.updateProjectionMatrix();
    const fv = THREE.MathUtils.degToRad(cam.fov), dist = Math.max(sz2.x / (2 * Math.tan(fv / 2) * asp), sz2.y / (2 * Math.tan(fv / 2))) * 1.04 + sz2.z / 2;   /* it fills the picture: the popup draws it at the width of its two cells */
    sq.group.position.sub(ct); cam.position.set(0, 0, dist); cam.lookAt(0, 0, 0); r.render(sc, cam); { const src = document.createElement('canvas'); src.width = 600; src.height = 360; const g2 = src.getContext('2d'); g2.drawImage(r.domElement, 0, 0, 600, 360); const d = g2.getImageData(0, 0, 600, 360).data; let x0 = 600, x1 = -1, y0 = 360, y1 = -1; for (let y = 0; y < 360; y++) for (let x = 0; x < 600; x++) if (d[(y * 600 + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 > x0 && y1 > y0) { const w = x1 - x0 + 1, h = y1 - y0 + 1, out = document.createElement('canvas'); out.width = w; out.height = h; out.getContext('2d').drawImage(src, x0, y0, w, h, 0, 0, w, h); THUMB.squid_wide = out.toDataURL('image/png'); THUMB.squid_wide_ar = String(w / h); } else THUMB.squid_wide = r.domElement.toDataURL('image/png'); }   /* cropped to the octopus itself, so it can be drawn as wide as its two cells */
    sc.remove(sq.group);
  }
  r.dispose(); r.forceContextLoss(); THUMBS_MADE = true;
}
let THUMBS_MADE = false;

/* ============================== three scene ============================== */
const canvas = $('c');
const QP = k => (location.search.match(new RegExp('[?&]' + k + '=([^&]*)')) || [])[1], COARSE = matchMedia('(pointer:coarse)').matches;   // test switches for phones: ?aa=0 / ?aa=1 (smoothing of edges), ?lens=0 (no glass bending)
const AA_MAIN = QP('aa') ? QP('aa') === '1' : true, AA_OV = QP('aa') ? QP('aa') === '1' : !COARSE;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: AA_MAIN, alpha: true, powerPreference: 'high-performance' });
const QCAP = [2, 1.5], RES_OVR = +((location.search.match(/[?&]res=([\d.]+)/) || [])[1] || 0); let qLevel = 0; const PIX_BUDGET = 3.6e6, prFor = () => { const dpr = window.devicePixelRatio || 1; if (RES_OVR) return Math.min(dpr, RES_OVR); const w = Math.min(window.innerWidth, window.innerHeight * 9 / 16), h = window.innerHeight; return Math.max(1, Math.min(dpr, QCAP[qLevel], Math.sqrt(PIX_BUDGET / Math.max(1, w * h)))); };   // the render scale is also capped so the 3D canvas never has more than about 3.6 million pixels (a 540 x 960 phone screen at dpr 2 is 2.1 million, a 1200 px tall window 3.2 million: full sharpness; only very big windows are scaled down): a big window at dpr 2 (5 million) made the win animation drop frames   // ?res=2 pins the render scale (no automatic step-down) to compare sharpness between devices   // render resolution steps down by itself when the frame rate is low
renderer.setPixelRatio(prFor());
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x45c6f2, 8, 17);
const cam = new THREE.PerspectiveCamera(36, 1, .05, 60);
const U = { uTime: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uWater: { value: new THREE.Vector3(.1, .55, .8) } };

const PIPE_L = 5, SHELL_LAYER = 3;   // the glass wall, rims, stand and plinth: drawn AFTER the water lens, so only what is inside the water is refracted
const hemi = new THREE.HemisphereLight(0xf0fbff, 0x4aa6d8, 2.2); scene.add(hemi); hemi.layers.enable(SHELL_LAYER);
const sun = new THREE.DirectionalLight(0xfff4dc, 2.8); sun.position.set(2.5, 9, 4); scene.add(sun); sun.layers.enable(SHELL_LAYER);
const fillL = new THREE.PointLight(0x7fe4ff, 22, 10, 1.5); fillL.position.set(0, 1.2, 0); scene.add(fillL); fillL.layers.enable(SHELL_LAYER);

let glowRing; const tank = new THREE.Group(); scene.add(tank);   // everything that squashes / bounces
const fishRoot = new THREE.Group(); tank.add(fishRoot);

/* --- sand floor with caustics --- */
{
  const mat = new THREE.ShaderMaterial({
    uniforms: U, fog: false,
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uTint; varying vec3 vP;
      float caus(vec2 p,float t){ float v=abs(sin(p.x*2.7+t)+sin(p.y*2.9-t*1.1)+sin((p.x+p.y)*2.1+t*.7)+sin((p.x-p.y)*3.3-t*.6)); return smoothstep(.0,.55,.62-v*.5); }
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 p=vP.xz;
        vec3 sand=mix(vec3(.78,.68,.46),vec3(.92,.84,.6),h(floor(p*38.))*.55);
        float c=caus(p*1.1,uTime*.7)*.6+caus(p*1.6+3.,-uTime*.55)*.5;
        float d=length(p)/${R.toFixed(2)};
        vec3 col=sand*vec3(.85,1.,1.04)*uTint+vec3(.6,1.,1.)*c*.5;
        col*=mix(1.,.62,smoothstep(.55,1.,d));
        gl_FragColor=vec4(col,1.);
      }`
  });
  const floor = new THREE.Mesh(GEO.floor(), mat); SHELL.floor = floor; floor.position.y = FLOOR_Y; tank.add(floor);
  // base / stand
  const stand = new THREE.Mesh(GEO.stand(), new THREE.MeshPhongMaterial({ color: 0x2a5a8e, shininess: 90, specular: 0x6aa8ff })); SHELL.stand = stand; stand.position.y = FLOOR_Y / 2 - .02; tank.add(stand); stand.layers.set(SHELL_LAYER);
  const rimMat = new THREE.MeshPhongMaterial({ color: 0xcfe8ff, shininess: 120, specular: 0xffffff, emissive: 0x24445f });
  const rimTop = new THREE.Mesh(GEO.rimTop(), rimMat); SHELL.rimTop = rimTop; rimTop.position.y = TANK_H; tank.add(rimTop); rimTop.layers.set(SHELL_LAYER);
  const rimBot = new THREE.Mesh(GEO.rimBot(), rimMat); SHELL.rimBot = rimBot; rimBot.position.y = FLOOR_Y; tank.add(rimBot); rimBot.layers.set(SHELL_LAYER);
  const plinth = new THREE.Mesh(GEO.plinth(), new THREE.MeshPhongMaterial({ color: 0x4a86c4, shininess: 100, specular: 0x7fc4ff, emissive: 0x08182c })); SHELL.plinth = plinth;
  plinth.position.y = -.17; tank.add(plinth); plinth.layers.set(SHELL_LAYER);
  const plTop = new THREE.Mesh(GEO.plTop(), new THREE.MeshPhongMaterial({ color: 0x3c6aa0, shininess: 120, specular: 0xffffff, emissive: 0x0c2240 })); SHELL.plTop = plTop;
  plTop.position.y = -.01; tank.add(plTop); plTop.layers.set(SHELL_LAYER);
  glowRing = new THREE.Mesh(GEO.glow(), new THREE.MeshBasicMaterial({ color: 0x59e4ff, transparent: true, opacity: .8, ...ADD, fog: false }));
  SHELL.glow = glowRing; glowRing.position.y = -.2; tank.add(glowRing); glowRing.layers.set(SHELL_LAYER);
  // soft ground shadow
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 10, 64, 64, 64); rg.addColorStop(0, 'rgba(0,10,30,.7)'); rg.addColorStop(1, 'rgba(0,10,30,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.7, R * 2.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false })); sh.position.y = -.29; scene.add(sh); sh.layers.set(SHELL_LAYER);
}

let HOUSES = [];   // places fish like to swim through (of the active theme): { c, axis, door }
const THEME_N = 5, themeG = [], themeEmit = [];
/* --- decor: one set per level theme (reef / ruins / shipwreck / kelp forest / atlantis); newLevel shows one --- */
{
  const Yax = new THREE.Vector3(0, 1, 0); let cur = null;
  for (let i = 0; i < THEME_N; i++) { const g = new THREE.Group(); g.visible = false; g.userData.houses = []; g.userData.emit = []; tank.add(g); themeG.push(g); }
  const place = (m, r, a, y = FLOOR_Y) => { r *= RK; m.userData.pl = [r, a, y]; r *= shK(Math.cos(a), Math.sin(a), y); m.position.set(Math.cos(a) * r, y, Math.sin(a) * r); cur.add(m); return m; };
  const faceCenter = (g, a) => { g.userData.face = true; g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); };
  const reg = (g, lc, la, door = false) => { const c = lc.clone().multiplyScalar(g.scale.x).applyAxisAngle(Yax, g.rotation.y).add(g.position); cur.userData.houses.push({ c, axis: la.clone().applyAxisAngle(Yax, g.rotation.y), door, src: { g, lc: lc.clone() } }); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const mat = (c, e = .3, o = {}) => new THREE.MeshPhongMaterial(Object.assign({ color: c, emissive: new THREE.Color(c).multiplyScalar(e), flatShading: true, shininess: 40 }, o));
  const wm = col => { const m = new THREE.MeshPhongMaterial({ color: col, side: THREE.DoubleSide, shininess: 30, emissive: new THREE.Color(col).multiplyScalar(.2) });
    m.onBeforeCompile = s => { s.uniforms.uTime = U.uTime; s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>',
      `vec3 transformed=position; float ph=modelMatrix[3].x*1.7+modelMatrix[3].z*1.3; float hh=position.y; transformed.x+=sin(uTime*1.4+hh*1.8+ph)*.16*hh*hh*.5; transformed.z+=cos(uTime*1.1+hh*1.5+ph)*.1*hh*hh*.5;`); }; return m; };
  const addRocks = (n, cols) => { for (let i = 0; i < n; i++) { const s = rand(.22, .5), m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat(pick(cols), .15, { shininess: 25 })); m.scale.set(rand(1, 1.5), rand(.5, .8), rand(1, 1.4)); m.rotation.y = rand(0, 6); place(m, rand(1.3, 2.3), rand(0, 6.28), FLOOR_Y + s * .25); } };
  const addCorals = (n, cols) => { for (let k = 0; k < n; k++) { const cm = mat(cols[k % cols.length], .35, { shininess: 50 }); const grp = new THREE.Group(), ang = k / n * 6.28 + rand(-.3, .3);
    for (let b = 0; b < 5; b++) { const h = rand(.4, .95), br = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, h, 7), cm); br.position.set(rand(-.18, .18), h / 2, rand(-.18, .18)); br.rotation.set(rand(-.35, .35), 0, rand(-.35, .35)); grp.add(br);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), cm); tip.position.set(br.position.x + Math.sin(br.rotation.z) * -h / 2, h + .02, br.position.z); grp.add(tip); }
    place(grp, rand(1.75, 2.25), ang); } };
  const addKelp = (n, h0, h1, cols) => { for (let i = 0; i < n; i++) { const h = rand(h0, h1), geo = new THREE.CylinderGeometry(.02, .08, h, 8, 14); geo.translate(0, h / 2, 0); geo.scale(1.8, 1, .75); const m = new THREE.Mesh(geo, wm(pick(cols))); m.rotation.y = rand(0, 3.14); place(m, rand(1.5, 2.15), rand(0, 6.28)); } };   /* kept inside the glass: the leaning blades must not reach the wall */
  const addAnemones = n => { for (let k = 0; k < n; k++) { const col = pick([0xff6ac8, 0xb07cff, 0x4af0c8]), mt = wm(col); mt.emissive = new THREE.Color(col).multiplyScalar(.45); const ag = new THREE.Group();
    for (let b = 0; b < 16; b++) { const h = rand(.4, .7), geo = new THREE.CylinderGeometry(.012, .035, h, 5); geo.translate(0, h / 2, 0); const tn = new THREE.Mesh(geo, mt); const aa = rand(0, 6.28), rr = rand(0, .2); tn.position.set(Math.cos(aa) * rr, 0, Math.sin(aa) * rr); tn.rotation.set(rand(-.3, .3), 0, rand(-.3, .3)); ag.add(tn); }
    place(ag, rand(1.2, 2.2), rand(0, 6.28)); } };
  const addFans = (n, cols) => { };
  const addStars = n => { };
  const archOf = (stone, a, scale = 1.15) => { const g = new THREE.Group(), m = mat(stone, .15, { shininess: 20 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.13, .16, 1.0, 8), m); p.position.set(s * .55, .5, 0); g.add(p); }
    const top = new THREE.Mesh(new THREE.TorusGeometry(.55, .13, 8, 16, Math.PI), m); top.position.set(0, 1.0, 0); g.add(top); place(g, 1.55, a); faceCenter(g, a); g.scale.setScalar(scale); reg(g, V(0, .9, 0), V(0, 0, 1)); return g; };
  const emitAt = (x, y, z) => cur.userData.emit.push(new THREE.Vector3(x, y, z));

  // ===== 0: coral reef =====
  cur = themeG[0];
  addRocks(9, [0x5b6b86, 0x6c5b86, 0x4d7a86, 0x86705b]); addCorals(6, [0xff5d8f, 0xff9a3c, 0xb05cff, 0x3ce0c4]); addKelp(16, 1.1, 2.4, [0x1fae5a, 0x2ed07a, 0x17995a, 0x4fd86a]); addAnemones(4); addFans(4, [0xff4a7a, 0xb05cff, 0xff9a3c]); addStars(4);
  { const g = new THREE.Group(), stone = mat(0xffb6cf, .25, { shininess: 30 }), roof = mat(0x7a5cff, .3, { shininess: 50 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, .62, .7), stone); base.position.y = .31; g.add(base);
    for (const s of [-1, 1]) { const tw = new THREE.Mesh(new THREE.CylinderGeometry(.2, .23, 1.05, 10), stone); tw.position.set(s * .6, .52, 0); g.add(tw); const rf = new THREE.Mesh(new THREE.ConeGeometry(.27, .4, 10), roof); rf.position.set(s * .6, 1.25, 0); g.add(rf); }
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(.18, .2, .45, 10), stone); mid.position.set(0, .83, 0); g.add(mid); const rf2 = new THREE.Mesh(new THREE.ConeGeometry(.24, .36, 10), roof); rf2.position.set(0, 1.28, 0); g.add(rf2);
    const dm = new THREE.MeshBasicMaterial({ color: 0x0b2c5c }); const door = new THREE.Mesh(new THREE.CircleGeometry(.2, 16, 0, Math.PI), dm); door.position.set(0, .2, .355); g.add(door); const door2 = new THREE.Mesh(new THREE.PlaneGeometry(.4, .2), dm); door2.position.set(0, .1, .355); g.add(door2);
    const a = .35; place(g, 1.75, a); faceCenter(g, a); g.scale.setScalar(1.05); reg(g, V(0, .35, .25), V(0, 0, 1), true); }
  { const pts = [[0, 0], [.16, .02], [.27, .16], [.24, .36], [.13, .52], [.15, .6], [.1, .62]].map(p => new THREE.Vector2(p[0], p[1]));
    const am = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), mat(0xff9a5c, .25, { side: THREE.DoubleSide })); am.rotation.z = Math.PI / 2 - .2; am.rotation.y = 1; place(am, 1.2, 4.9, FLOOR_Y + .26); }
  { const bc = new THREE.Mesh(new THREE.IcosahedronGeometry(.42, 2), mat(0xff7aa8, .3)); bc.scale.set(1.1, .7, 1); place(bc, 1.9, 5.5, FLOOR_Y + .1);
    }

  // ===== 1: ancient ruins =====
  cur = themeG[1];
  addRocks(8, [0x6a7a98, 0x7a6a98, 0x5a8a98]); addKelp(7, 1.1, 2.2, [0x2a9e6a, 0x1f8a5a]); addFans(2, [0xff9a3c, 0xff6a8a]); addStars(3); addCorals(2, [0x3ce0c4, 0xb05cff]);
  archOf(0xf0dcb4, 2.5, 1.2); archOf(0xd8e0f0, 5.6, .95);
  for (let k = 0; k < 4; k++) { const g = new THREE.Group(), m = mat(0xeee6d4, .15, { shininess: 15 }), h = rand(.7, 1.5); const c = new THREE.Mesh(new THREE.CylinderGeometry(.17, .2, h, 10), m); c.position.y = h / 2; g.add(c);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(.5, .1, .5), m); cap.position.y = h + .05; if (k < 3) g.add(cap); const base = new THREE.Mesh(new THREE.BoxGeometry(.5, .1, .5), m); base.position.y = .05; g.add(base); place(g, rand(1.6, 2.3), 0.4 + k * 1.4 + rand(-.2, .2)); if (k === 3) { g.rotation.z = 1.35; g.position.y = FLOOR_Y + .2; } }
  { const g = new THREE.Group(), m = mat(0xc8d2dc, .2, { shininess: 20 }); const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.5, 1), m); head.scale.set(.9, 1.2, .85); head.position.y = .62; g.add(head);
    const eye = mat(0x0a2a50, 0); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), eye); e.position.set(s * .17, .78, .38); g.add(e); } const nose = new THREE.Mesh(new THREE.BoxGeometry(.1, .3, .12), m); nose.position.set(0, .62, .45); g.add(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(.3, .05, .06), eye); mouth.position.set(0, .4, .42); g.add(mouth); const a = 3.9; place(g, 1.7, a); faceCenter(g, a); }
  { const g = new THREE.Group(), m = mat(0xe4d8bc, .15, { shininess: 15 }); for (let s = 0; s < 3; s++) { const st = new THREE.Mesh(new THREE.BoxGeometry(1.5 - s * .3, .12, .9 - s * .15), m); st.position.y = .06 + s * .12; g.add(st); } const a = 1.3; place(g, 1.7, a); faceCenter(g, a); }

  // ===== 2: shipwreck =====
  cur = themeG[2];
  addRocks(7, [0x6a6a72, 0x7a6a5a, 0x5a6a7a]); addKelp(6, 1.0, 2.0, [0x6aa84a, 0x4a8a3a]); addStars(5); addFans(2, [0xff8a5a, 0xffc23a]); addCorals(2, [0xff7a4a, 0xffc23a]);
  { const g = new THREE.Group(), wood = mat(0x9a6a3a, .2, { shininess: 15, side: THREE.DoubleSide }), dark = mat(0x5a3a1a, .1, { side: THREE.DoubleSide });
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), wood); hull.scale.set(1.45, .7, .75); hull.position.y = .55; g.add(hull);
    for (let k = -2; k <= 2; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(.72, .035, 6, 14, Math.PI), dark); rib.rotation.set(0, Math.PI / 2, 0); rib.rotation.z = Math.PI; rib.position.set(k * .5, .95, 0); rib.scale.set(1, .9, 1); g.add(rib); }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, .06, .9), dark); deck.position.y = .55 + .0; deck.scale.set(.95, 1, .7); g.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 1.7, 7), dark); mast.position.set(.1, 1.3, 0); mast.rotation.z = -.3; g.add(mast);
    const a = 2.4; place(g, 1.5, a, FLOOR_Y + .05); g.rotation.z = .1; g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI / 2; g.scale.setScalar(.95);
    reg(g, V(0, .85, 0), V(1, 0, 0)); }
  { const g = new THREE.Group(), wood = mat(0x8a5a2a, .15), gold = mat(0xffd23a, .6, { shininess: 90 }); const box = new THREE.Mesh(new THREE.BoxGeometry(.6, .32, .4), wood); box.position.y = .16; g.add(box);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .6, 10, 1, false, 0, Math.PI), wood); lid.rotation.set(0, 0, Math.PI / 2); lid.rotation.y = 0; lid.position.set(0, .45, -.25); lid.rotation.x = -.9; g.add(lid);
    const heap = new THREE.Mesh(new THREE.SphereGeometry(.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), gold); heap.scale.set(1, .5, .65); heap.position.y = .3; g.add(heap);
    for (let c = 0; c < 6; c++) { const coin = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .015, 10), gold); coin.position.set(rand(-.25, .25), .32 + rand(0, .08), rand(-.1, .15)); coin.rotation.set(rand(0, 1), 0, rand(0, 1)); g.add(coin); }
    const a = 5.3; place(g, 1.7, a); faceCenter(g, a); g.scale.setScalar(1.1); emitAt(g.position.x, FLOOR_Y + .55, g.position.z); }
  for (let k = 0; k < 3; k++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .38, 12), mat(0x9a6a3a, .2)); place(br, rand(1.2, 2.2), 0.3 + k * .5, FLOOR_Y + .19); }


  // ===== 3: kelp forest =====
  cur = themeG[3];
  addRocks(9, [0x4d6a60, 0x5a7a6a, 0x4a5a70]); addKelp(20, 1.5, 2.8, [0x1fae5a, 0x2ed07a, 0x17995a, 0x7be060]); addStars(4); addFans(3, [0xffc23a, 0x7be060]);
  { const g = new THREE.Group(), rm = mat(0x5a7a70, .15, { shininess: 15 }); for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.45, 1), rm); b.scale.set(.9, 1.5, .9); b.position.set(s * .6, .55, 0); g.add(b); }
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(.5, 1), rm); top.scale.set(1.9, .55, .8); top.position.set(0, 1.15, 0); g.add(top); const a = 3.3; place(g, 1.6, a); faceCenter(g, a); g.scale.setScalar(1.1); reg(g, V(0, .6, 0), V(0, 0, 1)); }
  { const g = new THREE.Group(), rm = mat(0x6a7a68, .15); for (let s = 0; s < 3; s++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.4 - s * .06, 1), rm); b.position.set(s * .3 - .3, .3 + s * .22, 0); g.add(b); } const hole = new THREE.Mesh(new THREE.CircleGeometry(.17, 12), new THREE.MeshBasicMaterial({ color: 0x0a3a30 })); hole.position.set(0, .5, .33); g.add(hole);
    const a = 0.5; place(g, 1.8, a); faceCenter(g, a); g.scale.setScalar(1.1); reg(g, V(0, .35, .2), V(0, 0, 1), true); }
  for (let k = 0; k < 5; k++) { const orb = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc8ffb0 })); place(orb, rand(1.3, 2.3), rand(0, 6.28), FLOOR_Y + rand(.3, 2.6)); orb.userData.bob = rand(0, 6); }

  // ===== 4: atlantis =====
  cur = themeG[4];
  addRocks(5, [0x8a7ac0, 0x7a8ac8]); addFans(4, [0xff8ad8, 0xb08aff, 0x8ad8ff]); addStars(3); addAnemones(3);
  for (let k = 0; k < 7; k++) { const col = pick([0xb06cff, 0x4af0ff, 0xff6ad8]); const g = new THREE.Group(); const n = 2 + (k % 3); for (let c = 0; c < n; c++) { const h = rand(.45, 1.1), cr = new THREE.Mesh(new THREE.ConeGeometry(.12, h, 6), mat(col, .9, { transparent: true, opacity: .88, shininess: 120 })); cr.position.set(rand(-.2, .2), h / 2, rand(-.2, .2)); cr.rotation.set(rand(-.3, .3), 0, rand(-.3, .3)); g.add(cr); }
    place(g, rand(1.5, 2.3), k / 7 * 6.28 + rand(-.2, .2)); }
  for (let k = 0; k < 3; k++) { const g = new THREE.Group(), sh = mat(0xffe8f4, .4, { shininess: 90, side: THREE.DoubleSide }); for (const s of [0, 1]) { const half = new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), sh); half.scale.set(1, .5, 1); half.rotation.x = s ? Math.PI - .5 : 0; half.position.y = s ? .13 : 0; g.add(half); }
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); pearl.position.y = .12; g.add(pearl); place(g, rand(1.3, 2.2), 1 + k * 2.1, FLOOR_Y + .02); }
  for (let k = 0; k < 4; k++) { const g = new THREE.Group(), m = mat(0xf4f0ff, .35, { shininess: 80 }), h = rand(1.0, 1.8); const c = new THREE.Mesh(new THREE.CylinderGeometry(.14, .17, h, 12), m); c.position.y = h / 2; g.add(c);
    const rg = new THREE.Mesh(new THREE.TorusGeometry(.2, .035, 6, 16), new THREE.MeshBasicMaterial({ color: 0x8af0ff })); rg.rotation.x = Math.PI / 2; rg.position.y = h; g.add(rg); place(g, rand(1.9, 2.3), 0.5 + k * 1.6 + rand(-.2, .2)); }
  { const g = archOf(0xfff0c8, 2.6, 1.2); }

}

/* --- glass wall, water surface, light rays --- */
const sloshV = new THREE.Vector2(0, 0), sloshS = new THREE.Vector2(0, 0);
const ripples = [new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0)];
let ripIdx = 0;
const VORT = { v: new THREE.Vector4(0, 0, 0, 0) };   // x = strength of the whirl while the fish wind up through the tank, y = its turn
const surfU = { uTime: U.uTime, uWater: U.uWater, uRip: { value: ripples }, uSlosh: { value: sloshS }, uVort: { value: VORT.v }, uWr: { value: WR }, uSurfR: { value: R }, uMode: { value: 0 } }; SHELL.surfU = surfU;
{
  const glassMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vW; varying float vY; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); vY=position.y; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uWater; varying vec3 vN; varying vec3 vW; varying float vY;
      void main(){
        vec3 V=normalize(cameraPosition-vW); vec3 N=normalize(vN)*(gl_FrontFacing?1.:-1.);
        float f=pow(1.-abs(dot(N,V)),2.2);
        vec3 L=normalize(vec3(.4,.7,.5)); vec3 Hh=normalize(L+V);
        float spec=pow(max(dot(N,Hh),0.),60.);
        float spec2=pow(max(dot(N,normalize(vec3(-.6,.3,-.3)+V)),0.),90.)*.6;
        float depth=1.-clamp((vY-${FLOOR_Y.toFixed(2)})/${(TANK_H - FLOOR_Y).toFixed(2)},0.,1.);
        vec3 col=mix(uWater,vec3(.85,1.,1.),clamp(f*.8+spec+spec2,0.,1.));
        float a=.07+depth*.07+f*.4+spec*.55+spec2*.4+.02*sin(vY*9.+uTime*1.5+atan(vW.z,vW.x)*4.);
        gl_FragColor=vec4(col,clamp(a,0.,.9));
      }`
  });
  const glass = new THREE.Mesh(GEO.glass(), glassMat); SHELL.glass = glass;
  glass.position.y = (TANK_H + FLOOR_Y) / 2; glass.renderOrder = 10; tank.add(glass); glass.layers.set(SHELL_LAYER);

  const surfMat = new THREE.ShaderMaterial({
    uniforms: surfU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `uniform float uTime; uniform vec4 uRip[4]; uniform vec2 uSlosh; uniform vec4 uVort; varying vec3 vW; varying vec2 vL; varying vec3 vNm;
      ${WALL_GLSL}
      float vort(vec2 q){ float r=length(q); float a=atan(q.y,q.x); return uVort.x*(-.3*exp(-r*r*.9)+.085*sin(a*3.-r*5.+uVort.y)*smoothstep(0.,.7,r)*exp(-r*.45)); }   // a soft funnel in the middle with three spiral arms that turn with the fish
      float rip(vec2 q){ float h=0.; for(int i=0;i<4;i++){ float age=uTime-uRip[i].z; if(age>0. && age<3.2){ float d=length(q-uRip[i].xy); float front=age*2.6; float m=smoothstep(front+.15,front-.35,d); h+=uRip[i].w*sin(d*10.-age*9.)*exp(-age*1.5)*exp(-d*.35)*m; } } return h; }
      void main(){
        vec3 p=position; vL=p.xz; vec2 q=p.xz; float e=.05;
        float wr0 = uMode>1.5 ? wallRad(q) : (uMode>.5 ? uSurfR : ${R.toFixed(3)}); float tilt = min(1., ${R.toFixed(3)} / max(wr0, .5));   // the water tilts less where the wall is far from the middle (the corners of a square tank, the points of a heart): its height at the wall is the same as in a round tank, so it never rises above the glass
        float c1=cos(q.x*2.5+uTime*1.6), c2=cos(q.y*3.1-uTime*1.3), c3=cos((q.x+q.y)*5.+uTime*2.4);
        float h=.035*sin(q.x*2.5+uTime*1.6)+.03*sin(q.y*3.1-uTime*1.3)+.018*sin((q.x+q.y)*5.+uTime*2.4)+(uSlosh.x*q.x+uSlosh.y*q.y)*tilt;
        vec2 gr=vec2(.0875*c1+.09*c3+uSlosh.x*tilt, .093*c2+.09*c3+uSlosh.y*tilt);   // analytic slope of the base waves (no extra samples)
        bool act=false; for(int i=0;i<4;i++){ float age=uTime-uRip[i].z; if(age>0. && age<3.2) act=true; }
        if(uVort.x>.001){ h+=vort(q); gr+=vec2(vort(q+vec2(e,0.))-vort(q-vec2(e,0.)), vort(q+vec2(0.,e))-vort(q-vec2(0.,e)))/(2.*e); }
        if(act){ h+=rip(q); gr+=vec2(rip(q+vec2(e,0.))-rip(q-vec2(e,0.)), rip(q+vec2(0.,e))-rip(q-vec2(0.,e)))/(2.*e); }
        vec3 n=vec3(-gr.x*3.2,1.,-gr.y*3.2); vNm=normalize(mat3(modelMatrix)*n);
        p.y+=h; vec4 w=modelMatrix*vec4(p,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uWater; varying vec3 vW; varying vec2 vL; varying vec3 vNm;
      ${WALL_GLSL}
      void main(){
        float wr = uMode>1.5 ? wallRad(vL) : (uMode>.5 ? uSurfR : ${R.toFixed(3)});
        if(length(vL)>wr-.02) discard;
        /* CARTOON WATER: a flat turquoise with a web of white caustic lines, a toon glint and a foam ring at the glass. The ripples, slosh and whirl still show: they bend the web and the light. */
        float t=uTime*.32; vec2 uv=vL*1.25+vNm.xz*1.6;
        float d1=9., d2=9.; vec2 rn=vec2(0.); float hn=0.;
        vec2 ip=floor(uv), fp=fract(uv);
        for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(float(i),float(j)); vec2 id=ip+g;
          vec2 o=fract(sin(vec2(dot(id,vec2(127.1,311.7)),dot(id,vec2(269.5,183.3))))*43758.5453); o=.5+.42*sin(t*2.+6.2831*o);
          vec2 r=g+o-fp; float d=dot(r,r); if(d<d1){ d2=d1; d1=d; rn=r; hn=fract(sin(dot(id,vec2(41.3,289.1)))*917.7); } else if(d<d2) d2=d; }
        float web=1.-smoothstep(.02,.2,sqrt(d2)-sqrt(d1)); float web2=1.-smoothstep(.0,.07,sqrt(d2)-sqrt(d1));   /* (a soft wide line and a crisp thin one on top of it) */
        vec3 V=normalize(cameraPosition-vW); vec3 N=normalize(vNm); if(dot(N,V)<0.) N=-N;
        float nv=max(dot(N,V),0.); float fr=smoothstep(.46,.56,pow(1.-nv,1.6));
        vec3 L=normalize(vec3(.4,.8,.5)); float lit=dot(N,L);
        float glint=smoothstep(.93,.95,pow(max(dot(reflect(-L,N),V),0.),12.));
        vec3 deep=uWater*1.15+vec3(.04,.14,.16), shallow=vec3(.5,.93,1.);
        vec3 col=mix(deep,shallow,.6+.2*step(.8,lit)+.15*fr); col=mix(col,vec3(.62,.98,1.),.35*smoothstep(.2,.9,.5+.5*sin(vL.x*2.2+vL.y*1.6+uTime*.6)));   /* a bright turquoise with a flat lighter band moving through it */
        col=mix(col,vec3(1.),web*.4+web2*.4);
        col+=glint*.55;
        float bl=smoothstep(.9,1.,sin(uTime*1.5+hn*6.2831)); float star=exp(-abs(rn.x)*38.)*exp(-abs(rn.y)*7.)+exp(-abs(rn.y)*38.)*exp(-abs(rn.x)*7.); col+=vec3(1.)*star*bl*.95;   /* little four-point sparkles that wink on and off */
        col+=vec3(.12,.2,.16)*smoothstep(.0,1.,.5+.5*sin(vL.x*1.7-vL.y*1.1+uTime*.5));   /* a slow wide band of light drifting over the surface */
        float rr=length(vL); float foam=smoothstep(wr-.2,wr-.07,rr)*(.65+.35*sin(atan(vL.y,vL.x)*9.+uTime*1.4));
        col=mix(col,vec3(1.),foam*.85);
        float edge=smoothstep(wr-.02,wr-.25,rr);
        gl_FragColor=vec4(col,clamp(.68+web*.12+fr*.1+glint*.3+foam*.2,0.,.95)*(.6+.4*edge)); }`
  });
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2, 60, 60).rotateX(-Math.PI / 2), surfMat);
  surf.position.y = WATER_Y; surf.renderOrder = 11; tank.add(surf);

  const rayMat = ph => new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPh: { value: ph } }, transparent: true, depthWrite: false, ...ADD, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec3 vN; varying vec3 vW; varying float vT; void main(){ vT=uv.y; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform float uPh; varying vec3 vN; varying vec3 vW; varying float vT;
      void main(){ vec3 V=normalize(cameraPosition-vW); float e=pow(abs(dot(normalize(vN),V)),1.6); float a=pow(vT,1.6)*.16*e*(.65+.35*sin(uTime*.9+uPh)); gl_FragColor=vec4(vec3(.6,.95,1.)*a,a); }`
  });
  for (let i = 0; i < 5; i++) {
    const ray = new THREE.Mesh(new THREE.CylinderGeometry(rand(.12, .3), rand(.6, 1.1), 4.1, 20, 1, true), rayMat(i * 1.7));
    ray.position.set(rand(-1.6, 1.6) * RK, WATER_Y - 2.05, rand(-1.6, 1.6) * RK); ray.rotation.z = rand(-.18, .18); ray.rotation.x = rand(-.18, .18); ray.renderOrder = 9; tank.add(ray);
  }
}

/* --- bubbles, glitter, burst particles --- */
function dotTex(ring) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  if (ring) { rg.addColorStop(0, 'rgba(255,255,255,.05)'); rg.addColorStop(.7, 'rgba(255,255,255,.18)'); rg.addColorStop(.88, 'rgba(255,255,255,.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.35, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); }
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const bubbles = (() => {
  const N = 70, pos = new Float32Array(N * 3), data = [];
  for (let i = 0; i < N; i++) data.push({ x: 0, y: 0, z: 0, s: 0, w: 0 });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex(true), size: .2, transparent: true, depthWrite: false, ...ADD, opacity: .9 }));
  pts.frustumCulled = false; tank.add(pts);
  const reset = (d, init) => { const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * (R - .3) * shK(Math.cos(a), Math.sin(a), FLOOR_Y + .2); d.x = Math.cos(a) * r; d.z = Math.sin(a) * r; d.y = init ? rand(FLOOR_Y, WATER_Y) : FLOOR_Y + rand(0, .3); d.s = rand(.25, .7); d.w = rand(0, 6); };
  data.forEach(d => reset(d, true));
  return { pts, update(dt, t) { for (let i = 0; i < N; i++) { const d = data[i]; d.y += d.s * dt; d.x += Math.sin(t * 1.5 + d.w) * .12 * dt; if (d.y > WATER_Y - .05) reset(d, false); pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z; } geo.attributes.position.needsUpdate = true; } };
})();
const glitter = (() => {
  const N = 140, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), ph = [];
  for (let i = 0; i < N; i++) { const a = rand(0, 6.28), yy = rand(FLOOR_Y + .1, WATER_Y - .1), r = Math.sqrt(Math.random()) * (R - .2) * shK(Math.cos(a), Math.sin(a), yy); pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = yy; pos[i * 3 + 2] = Math.sin(a) * r; ph.push(rand(0, 6.28)); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex(false), size: .09, vertexColors: true, transparent: true, depthWrite: false, ...ADD }));
  pts.frustumCulled = false; tank.add(pts);
  return { update(dt, t) { for (let i = 0; i < N; i++) { const v = Math.pow(Math.max(0, Math.sin(t * 1.8 + ph[i])), 3); col[i * 3] = .6 * v; col[i * 3 + 1] = .95 * v; col[i * 3 + 2] = v; pos[i * 3 + 1] += Math.sin(t * .5 + ph[i]) * .02 * dt; pos[i * 3] += Math.cos(t * .3 + ph[i]) * .02 * dt; } geo.attributes.color.needsUpdate = true; geo.attributes.position.needsUpdate = true; } };
})();
const burstFx = (() => {
  const N = 260, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), base = new Float32Array(N * 3); let head = 0;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex(false), size: .13, vertexColors: true, transparent: true, depthWrite: false, ...ADD }));
  pts.frustumCulled = false; scene.add(pts);
  return {
    emit(p, color, n, spd = 1.6) { const c = new THREE.Color(color); for (let k = 0; k < n; k++) { const i = head; head = (head + 1) % N; pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        const d = new THREE.Vector3(rand(-1, 1), rand(-.4, 1), rand(-1, 1)).normalize().multiplyScalar(rand(.4, 1) * spd); vel[i * 3] = d.x; vel[i * 3 + 1] = d.y; vel[i * 3 + 2] = d.z; life[i] = rand(.5, 1); base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b; } },
    update(dt) { for (let i = 0; i < N; i++) { if (life[i] <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; } life[i] -= dt * 1.1; const l = Math.max(life[i], 0);
        vel[i * 3] *= .96; vel[i * 3 + 1] = vel[i * 3 + 1] * .96 + .6 * dt; vel[i * 3 + 2] *= .96; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        col[i * 3] = base[i * 3] * l; col[i * 3 + 1] = base[i * 3 + 1] * l; col[i * 3 + 2] = base[i * 3 + 2] * l; } geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; }
  };
})();
// water disturbance behind swimming fish: pale specks left at the tail that drift and fade; the faster the fish, the more and the brighter
const wakeFx = (() => {
  const N = 520, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), br = new Float32Array(N); let head = 0;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex(false), size: .17, vertexColors: true, transparent: true, depthWrite: false, ...ADD }));
  pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
  return {
    emit(x, y, z, vx, vy, vz, b) { const i = head; head = (head + 1) % N; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz; life[i] = rand(.55, 1); br[i] = b; },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { if (col[i * 3 + 2] !== 0) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        life[i] -= dt * 1.25; const l = Math.max(life[i], 0), f = l * l * br[i];
        vel[i * 3] *= .94; vel[i * 3 + 1] = vel[i * 3 + 1] * .94 + .12 * dt; vel[i * 3 + 2] *= .94; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        col[i * 3] = .55 * f; col[i * 3 + 1] = .85 * f; col[i * 3 + 2] = f;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    }
  };
})();
// water pushed aside by a fish launching into a dash: no drawn ring, the view of the water itself is bent by an expanding swell (a refraction wave in the lens pass), plus a few specks thrown outward
const ringFx = (() => {
  const pool = []; for (let i = 0; i < 6; i++) pool.push({ p: new THREE.Vector3(), d: new THREE.Vector3(1, 0, 0), t: 1, size: 1, str: 0 }); let h = 0; const q = new THREE.Vector3(), ndc = new THREE.Vector3(), n2 = new THREE.Vector3();
  return {
    emit(p, size, str, dir) { const e = pool[h++ % pool.length]; e.p.copy(p); if (dir) e.d.copy(dir); else e.d.set(0, 0, 0); e.t = 0; e.size = size; e.str = str; for (let k = 0; k < 6; k++) { const a = rand(0, 6.28), v = rand(.25, .6) * (.6 + str * 2), dx = dir ? -dir.x : 0, dz = dir ? -dir.z : 0; wakeFx.emit(p.x, p.y + rand(-.1, .1), p.z, (dx * .9 + Math.cos(a) * .45) * v, rand(-.1, .25), (dz * .9 + Math.sin(a) * .45) * v, .1 + str * .5); } },
    update(dt) {
      const arr = lensMat.uniforms.uPush.value, arD = lensMat.uniforms.uPushD.value, asp = lensSz.x / Math.max(1, lensSz.y), cm = cam.matrixWorld.elements;
      for (let i = 0; i < pool.length; i++) {
        const e = pool[i], u = arr[i]; if (e.t >= 1) { u.w = 0; continue; } e.t += dt / .85; if (e.t >= 1) { u.w = 0; continue; }
        const k = 1 - Math.pow(1 - e.t, 2), R = e.size * (.05 + .4 * k); ndc.copy(e.p).project(cam); q.copy(e.p).addScaledVector(q.set(cm[0], cm[1], cm[2]), R).project(cam);
        n2.copy(e.p).addScaledVector(e.d, .5).project(cam); let bx = -(n2.x - ndc.x) * asp, by = -(n2.y - ndc.y); const bl = Math.hypot(bx, by); if (bl > .004) { bx /= bl; by /= bl; } else { bx = by = 0; } arD[i].set(bx, by);   // the push goes out behind the fish, as seen on screen
        u.set(ndc.x * .5 + .5, ndc.y * .5 + .5, Math.abs(q.x - ndc.x) * .5 * asp, e.str * smooth01(e.t / .2) * Math.pow(1 - e.t, 2) * .012);
      }
    }
  };
})();
const _wk = new THREE.Vector3();
function wakeTrail(o, dt) {   // called once per frame for a swimming fish, after it moved
  if (dt <= 0) return; o.wkRT = (o.wkRT || 0) - dt; if (o.boost >= 1 && o.boost > (o.wkB || 0) + .6 && o.wkRT <= 0) { ringFx.emit(o.pos, .4 * (o.sz || 1), .22, o.dir); o.wkRT = 1.5; }   // a sudden dash: a ring from the spot it launched from
  o.wkB = o.boost;
  if (!o.wkP) { o.wkP = o.pos.clone(); o.wkAcc = 0; o.wkV = 0; return; }
  const v = o.pos.distanceTo(o.wkP) / dt; o.wkP.copy(o.pos); o.wkV += (v - o.wkV) * (1 - Math.exp(-dt * 6));
  const k = clamp((o.wkV - .08) / 1.1, 0, 1); if (k <= 0) { o.wkAcc = 0; return; }
  o.wkAcc += dt * (1.5 + 7 * k + 5 * k * k); const back = (o.parts.hx || .5) * (o.sz || 1) * .9;
  while (o.wkAcc >= 1) { o.wkAcc -= 1; wakeFx.emit(o.pos.x - o.dir.x * back + rand(-.05, .05), o.pos.y - o.dir.y * back + rand(-.05, .05), o.pos.z - o.dir.z * back + rand(-.05, .05), -o.dir.x * .25 * k + rand(-.12, .12) * (.4 + k), rand(-.05, .1), -o.dir.z * .25 * k + rand(-.12, .12) * (.4 + k), .07 + .17 * k); }
}
const dropFx = (() => {
  const N = 720, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N); let head = 0;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex(false), size: .13, vertexColors: true, transparent: true, depthWrite: false, ...ADD }));
  pts.frustumCulled = false; scene.add(pts);
  return {
    emit(p, v) { const i = head; head = (head + 1) % N; pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z; life[i] = rand(.7, 1.1); },
    update(dt) { for (let i = 0; i < N; i++) { if (life[i] <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; } life[i] -= dt;
      vel[i * 3 + 1] -= 9 * dt; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < WATER_Y - .02 && vel[i * 3 + 1] < 0) life[i] = 0; // falls back into the water
      const l = Math.min(1, life[i] * 2.2); col[i * 3] = .75 * l; col[i * 3 + 1] = .95 * l; col[i * 3 + 2] = l; } geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; }
  };
})();
const _v3 = new THREE.Vector3();
function surfaceSplash(x, z, s = 1, quiet = false) {
  const P = new THREE.Vector3(x, WATER_Y, z);
  for (let k = 0; k < 30; k++) { const a = rand(0, 6.283), sp = rand(.3, 1.8) * (k < 10 ? 1.6 : 1); dropFx.emit(P, _v3.set(Math.cos(a) * sp, rand(2.6, 5.4) * s, Math.sin(a) * sp)); }
  burstFx.emit(P.clone().setY(WATER_Y - .2), 0xffffff, 8, 1.2);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.18, .2, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: .9, ...ADD, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  ring.position.set(x, WATER_Y + .03, z); ring.userData = { t: 0, s, ring: true, maxS: Math.max(1.4, (wallAt(x, z, WATER_Y) * .96 - Math.hypot(x, z)) / .2) }; ring.renderOrder = 13; scene.add(ring); shocks.push(ring);
  addRipple(x, z, .16 * s); kick(1.6); if (!quiet) Snd.play('splash');
}
function exitSpray(x, z, vel) {   // a fish bursting out of the water: a crown of drops all round, a jet thrown the way it goes, and a thump on the surface
  const P = new THREE.Vector3(x, WATER_Y, z), vl = Math.min(7, vel.length());
  for (let k = 0; k < 34; k++) { const a = rand(0, 6.283), sp = rand(.7, 2.3); dropFx.emit(P, _v3.set(Math.cos(a) * sp, rand(2.2, 4.8), Math.sin(a) * sp)); }
  for (let k = 0; k < 26; k++) dropFx.emit(P, _v3.set(vel.x * rand(.15, .5) + rand(-.7, .7), Math.max(2.6, vel.y * rand(.3, .7)) + rand(0, 2), vel.z * rand(.15, .5) + rand(-.7, .7)));
  const ring = new THREE.Mesh(new THREE.RingGeometry(.18, .2, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: .8, ...ADD, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  ring.position.set(x, WATER_Y + .03, z); ring.userData = { t: 0, s: 1.15, ring: true, maxS: Math.max(1.4, (wallAt(x, z, WATER_Y) * .96 - Math.hypot(x, z)) / .2) }; ring.renderOrder = 13; scene.add(ring); shocks.push(ring); addRipple(x, z, .1 + .02 * vl);
}
function addRipple(x, z, amp = .09) { const r = ripples[ripIdx++ % 4]; r.set(x, z, U.uTime.value, amp); }


/* ============================== aquarium hall (3D surroundings) ============================== */
const FLOOR = -.62, HALL_R = 17, WALL_H = 15;
const hv = (r, g, b) => ({ value: new THREE.Vector3(r, g, b) });
const HB = { fk: { value: 1 }, f0: hv(.05, .24, .46), f1: hv(.08, .4, .7), f2: hv(.25, .7, 1), f3: hv(.2, .85, 1), f4: hv(.35, .85, 1), f5: hv(.2, .5, .85), wt: hv(.42, .9, 1), wm: hv(.12, .66, .98), wb: hv(.06, .34, .66), wr: hv(.55, .95, 1), wc: hv(.5, .9, 1), ws: hv(.5, .47, .34), spot: hv(.55, .9, 1) };   // the colours of the hall behind the tank: one set per level theme (see THEMES / applyHallTheme)
const HBO = { strips: [], frames: [], cr: [], stage: null, wallCv: null, wallTex: null };
const hall = new THREE.Group(); scene.add(hall);
const hallWin = [], hallProps = []; let glowRing2, hallDust;
{
  const VS = 'varying vec3 vP; varying vec2 vUv; void main(){ vP=position; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
  const CAUS = 'float caus(vec2 p,float t){ float v=abs(sin(p.x*2.7+t)+sin(p.y*2.9-t*1.1)+sin((p.x+p.y)*2.1+t*.7)+sin((p.x-p.y)*3.3-t*.6)); return smoothstep(.0,.5,.55-v*.5); }';
  // floor: glossy dark tiles, a pool of light under the tank, glowing LED rings
  const floorMat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, { uFk: HB.fk, uF0: HB.f0, uF1: HB.f1, uF2: HB.f2, uF3: HB.f3, uF4: HB.f4, uF5: HB.f5 }), fog: false, vertexShader: VS, fragmentShader: `uniform float uTime; uniform float uFk; uniform vec3 uF0, uF1, uF2, uF3, uF4, uF5; varying vec3 vP; ${CAUS}
    void main(){ vec2 p=vP.xz; float r=length(p);
      vec3 col=uF0;
      vec2 g=abs(fract(p/2.2)-.5); float grid=smoothstep(.478,.5,max(g.x,g.y))*mix(.1,1.,uFk);
      float pool=exp(-r*r/70.);
      col+=uF1*pool*1.2+uF2*grid*pool*.9;
      float ring=0.; ring+=smoothstep(.06,.0,abs(r-4.55)); ring+=smoothstep(.05,.0,abs(r-6.3))*.7; ring+=smoothstep(.05,.0,abs(r-9.5))*.5;
      col+=uF3*ring*uFk*(.55+.45*sin(uTime*1.6-r*.7));
      col+=uF4*caus(p*.45,uTime*.5)*.2*pool;
      float ang=atan(p.y,p.x); col+=uF5*pow(max(0.,sin(ang*7.+uTime*.08)),14.)*.1*smoothstep(3.,10.,r)*exp(-r*r/220.);
      vec2 tid=floor(p/2.2); float th=fract(sin(dot(tid,vec2(12.9898,78.233)))*43758.5453); col*=1.+(1.-uFk)*(th-.5)*.34; col+=(1.-uFk)*uF2*.08*smoothstep(.5,.0,abs(fract(p.x/2.2)-.5)*2.-.96)*pool;   // (a polished stone floor when uFk is 0: big tiles, each a little different, faint joints)
      col*=smoothstep(46.,16.,r);
      gl_FragColor=vec4(col,1.); }` });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 96).rotateX(-Math.PI / 2), floorMat); floor.position.y = FLOOR; hall.add(floor); HBO.floor = floor;
  // raised stage under the tank
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(4.35, 4.6, .34, 80), new THREE.MeshPhongMaterial({ color: 0x3a74b8, shininess: 90, specular: 0xaee0ff, fog: false, emissive: 0x0c2c58 })); stage.position.y = FLOOR + .17; hall.add(stage); HBO.stage = stage;
  glowRing2 = new THREE.Mesh(new THREE.TorusGeometry(4.36, .045, 8, 120).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x59e4ff, transparent: true, opacity: .85, ...ADD, fog: false })); glowRing2.position.y = FLOOR + .35; hall.add(glowRing2);
  // curved wall
  const gc = document.createElement('canvas'); gc.width = 4; gc.height = 256; const gg = gc.getContext('2d'); const gr = gg.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#0a3a78'); gr.addColorStop(.3, '#0f5aa6'); gr.addColorStop(.62, '#1e86d0'); gr.addColorStop(.9, '#46b6ec'); gr.addColorStop(1, '#8fdcff'); gg.fillStyle = gr; gg.fillRect(0, 0, 4, 256);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(HALL_R, HALL_R, WALL_H, 96, 1, true), new THREE.MeshBasicMaterial({ map: (HBO.wallTex = new THREE.CanvasTexture(gc)), side: THREE.BackSide, fog: false })); HBO.wallCv = gc;
  wall.position.y = FLOOR + WALL_H / 2; hall.add(wall);
  // big viewing windows with moving sea life
  const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 256; const sg = sc.getContext('2d'); sg.fillStyle = 'rgba(8,60,120,.6)';
  const fishS = (x, y, k, f = 1) => { sg.beginPath(); sg.ellipse(x, y, 16 * k, 7 * k, 0, 0, 7); sg.fill(); sg.beginPath(); sg.moveTo(x - 14 * k * f, y); sg.lineTo(x - 26 * k * f, y - 9 * k); sg.lineTo(x - 26 * k * f, y + 9 * k); sg.fill(); };
  sg.beginPath(); sg.ellipse(190, 140, 110, 17, 0, 0, 7); sg.fill(); sg.beginPath(); sg.moveTo(85, 140); sg.lineTo(30, 98); sg.lineTo(45, 140); sg.lineTo(30, 178); sg.fill(); sg.beginPath(); sg.moveTo(170, 126); sg.lineTo(190, 92); sg.lineTo(215, 128); sg.fill(); sg.beginPath(); sg.moveTo(215, 150); sg.lineTo(250, 190); sg.lineTo(240, 150); sg.fill(); // shark
  sg.beginPath(); sg.moveTo(640, 80); sg.quadraticCurveTo(700, 40, 770, 78); sg.quadraticCurveTo(715, 92, 700, 112); sg.quadraticCurveTo(675, 92, 640, 80); sg.fill(); sg.beginPath(); sg.moveTo(700, 110); sg.lineTo(704, 165); sg.lineTo(698, 165); sg.fill(); // manta
  for (let i = 0; i < 22; i++) fishS(840 + Math.random() * 150, 120 + Math.random() * 100, .55 + Math.random() * .4);
  for (let i = 0; i < 9; i++) fishS(380 + Math.random() * 190, 60 + Math.random() * 130, .7 + Math.random() * .5, 1);
  const creatureTex = new THREE.CanvasTexture(sc); creatureTex.wrapS = THREE.RepeatWrapping;
  const N = 8, TL = .68;
  for (let i = 0; i < N; i++) {
    const th0 = i * Math.PI * 2 / N + .13, y = FLOOR + 4.5;
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(HALL_R - .01, HALL_R - .01, 8.2, 28, 1, true, th0 - .035, TL + .07), new THREE.MeshBasicMaterial({ color: 0x16407a, side: THREE.BackSide, fog: false })); frame.position.y = y; hall.add(frame); HBO.frames.push(frame);
    for (const dy of [-4.1, 4.1]) { const strip = new THREE.Mesh(new THREE.CylinderGeometry(HALL_R - .03, HALL_R - .03, .09, 28, 1, true, th0 - .035, TL + .07), new THREE.MeshBasicMaterial({ color: 0x59e4ff, side: THREE.BackSide, fog: false })); strip.position.y = y + dy; hall.add(strip); HBO.strips.push(strip); }
    const wm = new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uSeed: { value: i * 1.7 }, uWT: HB.wt, uWM: HB.wm, uWB: HB.wb, uWR: HB.wr, uWC: HB.wc, uWS: HB.ws }, side: THREE.BackSide, fog: false, vertexShader: VS, fragmentShader: `uniform float uTime; uniform float uSeed; uniform vec3 uWT, uWM, uWB, uWR, uWC, uWS; varying vec2 vUv; ${CAUS}
      void main(){ float y=vUv.y; vec3 top=uWT, mid=uWM, bot=uWB;
        vec3 col= y>.45 ? mix(mid,top,(y-.45)/.55) : mix(bot,mid,y/.45);
        float ray=pow(max(0.,sin(vUv.x*20.+uSeed+sin(uTime*.25+uSeed)*1.6)),7.)*pow(y,1.5)*.4; col+=uWR*ray;
        col+=uWC*caus(vUv*vec2(10.,5.5)+uSeed,uTime*.55)*.14*y;
        float sand=smoothstep(.17,.09,y+sin(vUv.x*14.+uSeed)*.018); col=mix(col,uWS*.65,sand);
        vec2 e=abs(vUv-.5)*2.; col*=mix(.62,1.,smoothstep(1.,.74,max(e.x,e.y)));
        gl_FragColor=vec4(col,1.); }` });
    const win = new THREE.Mesh(new THREE.CylinderGeometry(HALL_R - .06, HALL_R - .06, 7.6, 28, 1, true, th0, TL), wm); win.position.y = y; hall.add(win); (HBO.wins = HBO.wins || []).push({ mesh: win, mat: wm, i, th0, TL });
    const tex = creatureTex.clone(); tex.needsUpdate = true; tex.repeat.set(1.4, 1); tex.wrapS = THREE.RepeatWrapping; tex.offset.x = i * .37;
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(HALL_R - .1, HALL_R - .1, 7.6, 28, 1, true, th0, TL), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false, opacity: .85 })); cr.position.y = y; hall.add(cr); HBO.cr.push(cr);
    hallWin.push({ tex, sp: (i % 2 ? 1 : -1) * (.004 + (i % 3) * .002) });
  }
  // ceiling spotlights onto the tank (volumetric cones)
  const spotMat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, { uSpot: HB.spot }), transparent: true, depthWrite: false, ...ADD, side: THREE.DoubleSide, fog: false,
    vertexShader: 'varying vec3 vN; varying vec3 vW; varying float vT; void main(){ vT=uv.y; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'uniform float uTime; uniform vec3 uSpot; varying vec3 vN; varying vec3 vW; varying float vT; void main(){ vec3 V=normalize(cameraPosition-vW); float e=pow(abs(dot(normalize(vN),V)),1.4); float a=pow(vT,1.3)*.1*e*(.85+.15*sin(uTime*.7+vW.x)); gl_FragColor=vec4(uSpot*a,a); }' });
  for (let i = 0; i < 3; i++) {
    const ang = i * 2.094 + .4, src = new THREE.Vector3(Math.cos(ang) * 6.5, 14, Math.sin(ang) * 6.5), dst = new THREE.Vector3(Math.cos(ang) * 1.2, FLOOR, Math.sin(ang) * 1.2);
    const dir = src.clone().sub(dst), len = dir.length(); const cone = new THREE.Mesh(new THREE.CylinderGeometry(.25, 3.2, len, 28, 1, true), spotMat);
    cone.position.copy(src.clone().add(dst).multiplyScalar(.5)); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); cone.renderOrder = 8; hall.add(cone); (HBO.cones = HBO.cones || []).push(cone);
  }
  // props on the floor: rocks, corals, kelp
  const place = (m, r, a, y = FLOOR) => { m.position.set(Math.cos(a) * r, y, Math.sin(a) * r); hall.add(m); if (r < 8) hallProps.push(m); return m; };
  for (let i = 0; i < 0; i++) { const sz = rand(.3, .7), m = new THREE.Mesh(new THREE.IcosahedronGeometry(sz, 1), new THREE.MeshPhongMaterial({ color: pick([0x3a4f78, 0x4a3f78, 0x2f6478]), flatShading: true, shininess: 30, fog: false })); m.scale.set(rand(1, 1.5), rand(.5, .8), rand(1, 1.3)); m.rotation.y = rand(0, 6); place(m, rand(5.4, 7.0), rand(0, 6.283), FLOOR + sz * .2); }
  const cc = [0xff5d8f, 0xff9a3c, 0xb05cff, 0x3ce0c4];
  for (let k = 0; k < 0; k++) {
    const col = cc[k % 4], cm = new THREE.MeshPhongMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(.3), shininess: 50, flatShading: true, fog: false }); const g = new THREE.Group(); const sc2 = rand(.9, 1.4);
    for (let b = 0; b < 6; b++) { const h = rand(.5, 1.2) * sc2, br = new THREE.Mesh(new THREE.CylinderGeometry(.06 * sc2, .11 * sc2, h, 7), cm); br.position.set(rand(-.3, .3) * sc2, h / 2, rand(-.3, .3) * sc2); br.rotation.set(rand(-.4, .4), 0, rand(-.4, .4)); g.add(br); const tip = new THREE.Mesh(new THREE.SphereGeometry(.11 * sc2, 8, 6), cm); tip.position.set(br.position.x + Math.sin(br.rotation.z) * -h / 2, h + .02, br.position.z); g.add(tip); }
    place(g, rand(5.4, 6.9), k / 9 * 6.283 + rand(-.25, .25));
  }
  const kelpMat = col => { const m = new THREE.MeshPhongMaterial({ color: col, side: THREE.DoubleSide, shininess: 30, emissive: 0x062a18, fog: false });
    m.onBeforeCompile = sh => { sh.uniforms.uTime = U.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed=position; float ph=modelMatrix[3].x*1.7+modelMatrix[3].z*1.3; float hh=position.y; transformed.x+=sin(uTime*1.2+hh*1.4+ph)*.2*hh*hh*.35; transformed.z+=cos(uTime*.9+hh*1.2+ph)*.12*hh*hh*.35;'); }; return m; };
  for (let i = 0; i < 0; i++) { const h = rand(3, 6), geo = new THREE.PlaneGeometry(.5, h, 1, 12); geo.translate(0, h / 2, 0); const pos = geo.attributes.position; for (let v = 0; v < pos.count; v++) pos.setX(v, pos.getX(v) * (1 - pos.getY(v) / h * .8));
    const m = new THREE.Mesh(geo, kelpMat(pick([0x1fae5a, 0x2ed07a, 0x17995a]))); m.rotation.y = rand(0, 3.14); place(m, rand(13.2, 15.6), rand(0, 6.283)); }
  // glowing bokeh dust floating in the hall
  const N2 = 200, dp = new Float32Array(N2 * 3); for (let i = 0; i < N2; i++) { const a = rand(0, 6.283), r = rand(3, 14); dp[i * 3] = Math.cos(a) * r; dp[i * 3 + 1] = rand(FLOOR + .3, 9); dp[i * 3 + 2] = Math.sin(a) * r; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  hallDust = new THREE.Points(dg, new THREE.PointsMaterial({ map: dotTex(false), size: .22, color: 0x7fd8ff, transparent: true, opacity: .5, depthWrite: false, ...ADD, fog: false })); hallDust.frustumCulled = false; hall.add(hallDust);
}
const STATIC_BG = {};   // looks whose background is one painted 3D-style picture behind the tank (the hall is not drawn)
const PANO_LOOKS = new Set(), PIC_LOOKS = new Set(), HALL3D = new Set([1, 2, 3, 4, 5]);   // HALL3D: looks whose hall is rebuilt in code with a painted sea behind the windows (public/ui/hall/seaN.jpg)   // looks with a painted 360 panorama on the hall wall / with a flat painted picture behind the tank

function tileTex(im, frac = .12) {   // a picture made seamless (its end fades into its start) as a repeating texture
  const w = im.width, h = im.height, f = Math.round(w * frac), W2 = w - f, c = document.createElement('canvas'); c.width = W2; c.height = h; const g = c.getContext('2d'); g.drawImage(im, f, 0, W2, h, 0, 0, W2, h);
  const t = document.createElement('canvas'); t.width = f; t.height = h; const q = t.getContext('2d'); q.drawImage(im, 0, 0, f, h, 0, 0, f, h); q.globalCompositeOperation = 'destination-in'; const gr = q.createLinearGradient(0, 0, f, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); q.fillStyle = gr; q.fillRect(0, 0, f, h); g.drawImage(t, W2 - f, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 4; return tex;
}
function hall3d(idx, b) {   // the hall rebuilt in code in the style of the painted halls: white glossy pillars between the windows, a ribbed dome with light ripples, glass windows that show a painted sea
  const on = HALL3D.has(idx); HB.fk.value = on ? 0 : 1; if (HBO.h3) HBO.h3.visible = on;
  for (const w of HBO.wins || []) { w.mesh.material = on && w.sea ? w.sea : w.mat; }
  if (HBO.cr) HBO.cr.forEach(m => { m.visible = !on; }); HBO.strips.forEach(m => { m.visible = !on; }); if (HBO.frames) HBO.frames.forEach(m => { m.visible = !on; });
  if (!on) return;
  if (!HBO.h3) {
    const g = new THREE.Group(), col = new THREE.Color(b.pillar || '#f2fbff'), pm = new THREE.MeshPhongMaterial({ color: col, shininess: 110, specular: 0xffffff, emissive: new THREE.Color(b.pillarEm || '#2a6a7a'), fog: false }), TL = HBO.wins[0].TL; HBO.pm = pm; HBO.shafts = [];
    for (const w of HBO.wins) {
      const a = w.th0 + TL + (Math.PI / 4 - TL) / 2, rr = HALL_R - .85, x = Math.sin(a) * rr, z = Math.cos(a) * rr;   // (a CylinderGeometry segment at thetaStart a lies at x = r sin a, z = r cos a)
      const col3 = new THREE.Group(); col3.position.set(x, FLOOR, z);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.28, .32, 9.2, 24), pm); shaft.position.y = 4.6; col3.add(shaft); HBO.shafts.push(shaft);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.48, .55, .4, 24), pm); base.position.y = .22; col3.add(base); const cap = new THREE.Mesh(new THREE.CylinderGeometry(.55, .36, .45, 24), pm); cap.position.y = 9.3; col3.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.33, .05, 8, 24).rotateX(Math.PI / 2), pm); ring.position.y = 8.6; col3.add(ring);
      g.add(col3);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(HALL_R - .3, 64, 16, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.ShaderMaterial({ side: THREE.BackSide, fog: false, uniforms: { uTime: U.uTime, uA: HB.wb, uB: HB.wm, uC: HB.wr },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float uTime; uniform vec3 uA,uB,uC; varying vec3 vP; float caus(vec2 p,float t){ float v=abs(sin(p.x*2.7+t)+sin(p.y*2.9-t*1.1)+sin((p.x+p.y)*2.1+t*.7)+sin((p.x-p.y)*3.3-t*.6)); return smoothstep(.0,.5,.55-v*.5); } void main(){ float k=clamp(vP.y/14.,0.,1.); vec3 c=mix(uB,uA,k); float rib=pow(abs(sin(atan(vP.z,vP.x)*8.)),22.)*.05; c+=uC*(rib+caus(vP.xz*.35,uTime*.5)*.1*k); gl_FragColor=vec4(c,1.); }' }));
    HBO.pillars = g.children.slice();
    dome.position.y = FLOOR + 8.6; g.add(dome); const rim = new THREE.Mesh(new THREE.TorusGeometry(HALL_R - .45, .22, 10, 96).rotateX(Math.PI / 2), pm); rim.position.y = FLOOR + 8.75; g.add(rim);
    g.traverse(o => o.layers.set(1)); hall.add(g); HBO.h3 = g; HBO.geoS = HBO.shafts[0].geometry; HBO.geoF = new THREE.CylinderGeometry(.3, .35, 9.2, 12);
  }
  HBO.pm.color.set(b.pillar || '#f2fbff'); HBO.pm.emissive.set(b.pillarEm || '#2a6a7a'); HBO.pm.flatShading = !!b.fluted; HBO.pm.needsUpdate = true; HBO.shafts.forEach(m => { m.geometry = b.fluted ? HBO.geoF : HBO.geoS; });   // (Atlantis: fluted marble columns)
  if (!HBO.seaIdx || HBO.seaIdx !== idx) { HBO.seaIdx = idx; const im = new Image(); im.onload = () => { if (HBO.seaIdx !== idx) return; HBO.seaTex = []; HBO.wins.forEach((w, k) => { const t = tileTex(im); t.repeat.set(.62, 1); t.offset.x = k * .12; HBO.seaTex.push(t); w.sea = new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false }); if (HALL3D.has(curLook)) w.mesh.material = w.sea; }); }; im.src = new URL('ui/hall/sea' + idx + '.jpg', document.baseURI).href; }
}
function panoSet(idx) {   // the painted panorama (public/ui/hall/panoN.jpg) wraps the hall wall 3 times (circumference / height of the wall is 3 pictures wide); its right edge fades into its left edge, so the wrap has no seam
  if (HBO.pano) HBO.pano.visible = idx > 0; if (idx < 1) return; HBO.panoIdx = idx;
  const im = new Image(); im.onload = () => { if (HBO.panoIdx !== idx) return; const w = im.width, h = im.height, f = Math.round(w * .1), W2 = w - f, c = document.createElement('canvas'); c.width = W2; c.height = h; const g = c.getContext('2d'); g.drawImage(im, f, 0, W2, h, 0, 0, W2, h);
    const t = document.createElement('canvas'); t.width = f; t.height = h; const q = t.getContext('2d'); q.drawImage(im, 0, 0, f, h, 0, 0, f, h); q.globalCompositeOperation = 'destination-in'; const gr = q.createLinearGradient(0, 0, f, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); q.fillStyle = gr; q.fillRect(0, 0, f, h); g.drawImage(t, W2 - f, 0);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1); tex.anisotropy = 4;
    if (!HBO.pano) { const m = new THREE.Mesh(new THREE.CylinderGeometry(HALL_R - .4, HALL_R - .4, WALL_H, 96, 1, true), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })); m.position.y = 4.6; m.layers.set(1); hall.add(m); HBO.pano = m; } else { HBO.pano.material.map = tex; HBO.pano.material.needsUpdate = true; } HBO.pano.visible = true; };
  im.src = new URL('ui/hall/pano' + idx + '.jpg', document.baseURI).href;
}
const bgStrip = { idx: -1, url: "", w: 0, ar: 1 };
function bgPicSet(idx) {   // the painted hall as a seamless loop: the last fifth of the picture fades into its first fifth, so the strip can scroll round in one direction forever (no mirror flip)
  bgPic.style.backgroundImage = ''; if (idx < 1) { bgStrip.idx = -1; return; } bgStrip.idx = idx;
  const im = new Image(); im.onload = () => { if (bgStrip.idx !== idx) return; const h = im.height, w = im.width, f = Math.round(w * .2), W2 = w - f, c = document.createElement('canvas'); c.width = W2; c.height = h; const g = c.getContext('2d');
    g.drawImage(im, f, 0, W2, h, 0, 0, W2, h);   // the picture without its first fifth
    const t = document.createElement('canvas'); t.width = f; t.height = h; const q = t.getContext('2d'); q.drawImage(im, 0, 0, f, h, 0, 0, f, h); q.globalCompositeOperation = 'destination-in'; const gr = q.createLinearGradient(0, 0, f, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); q.fillStyle = gr; q.fillRect(0, 0, f, h);
    g.drawImage(t, W2 - f, 0);   // the first fifth fades in over the last fifth: the right edge now equals the left edge
    bgStrip.url = c.toDataURL('image/jpeg', .88); bgStrip.w = W2; bgStrip.ar = h / W2; bgPic.style.backgroundImage = `url(${bgStrip.url})`; };
  im.src = new URL('ui/hall/hall' + idx + '.jpg', document.baseURI).href;
}
let bgAz = null;
function hallUpdate(dt, t) { if (bgAz === null) bgAz = orbit.az; { const dz = orbit.az - bgAz, mx = 1.6 * dt; bgAz += Math.abs(dz) > mx ? Math.sign(dz) * mx : dz; }   /* the hall picture follows the camera at a limited speed: in a fast turn (the opening shot) it would otherwise streak and flicker */ if (bgStat.on) bgPic.style.backgroundPosition = `${50 + Math.sin(orbit.az) * 4}% 100%`;   // the painted picture slides a little with the camera
  if (HBO.h3 && HBO.h3.visible) { if (HBO.lamps) for (const l of HBO.lamps) l.g.position.y = l.y0 + Math.sin(t * .9 + l.ph) * .12; if (HBO.pillars) for (const p of HBO.pillars) { if (!camIntro) p.visible = p.position.distanceTo(cam.position) > 8; } } if (HBO.seaTex && HBO.h3 && HBO.h3.visible) HBO.seaTex.forEach((x, k) => { x.offset.x += dt * (.004 + (k % 3) * .0015); }); if (bgStrip.idx >= 1 && bgStrip.w) { const hpx = bgPic.clientHeight || 1, tw = hpx / bgStrip.ar, x = -(bgAz * .9 + t * .012) * tw * .5; const K = 1.3, th = hpx * K, tw2 = th / bgStrip.ar, x2 = -(bgAz * .9 + t * .012) * tw2 * .5, spare = th - hpx, y = -spare * clamp(.45 + (orbit.el - .3) * .55, 0, 1);   // the picture is 30% taller than the screen: tilting the camera slides it up and down, turning it slides it sideways (like the 3D hall did)
    bgPic.style.backgroundSize = `auto ${(K * 100).toFixed(0)}%`; bgPic.style.backgroundPosition = `${(x2 % tw2).toFixed(1)}px ${y.toFixed(1)}px`; void tw; void x; } if (!camIntro) for (const m of hallProps) m.visible = m.position.distanceTo(cam.position) > 4.2; for (const w of hallWin) w.tex.offset.x += w.sp * dt; if (hallDust) { hallDust.rotation.y += dt * .012; hallDust.position.y = Math.sin(t * .2) * .25; } if (glowRing2) glowRing2.material.opacity = .55 + .35 * Math.sin(t * 2 + 1); }
/* the aquarium hall is drawn by its own renderer on a blurred canvas behind the tank (depth-of-field look) */
if (/[?&]bgview=1/.test(location.search)) document.body.classList.add('bgview');   // ?bgview=1: no UI, only the hall and the tank (to look at the backgrounds)
const bgStat = { on: false };
const bgPic = document.createElement('div'); bgPic.id = 'bgpic'; $('app').insertBefore(bgPic, $('app').firstChild);   // the painted hall of a look (public/ui/hall/hallN.jpg) sits under the transparent hall canvas
const bgCanvas = document.createElement('canvas'); bgCanvas.id = 'bg3d'; $('app').insertBefore(bgCanvas, canvas);
const bgR = new THREE.WebGLRenderer({ canvas: bgCanvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
bgR.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1)); bgR.setClearColor(0x1a78c0, 1);
hall.traverse(o => o.layers.set(1));
{ const hl = new THREE.HemisphereLight(0xf0fbff, 0x4aa6d8, 2.2), dl = new THREE.DirectionalLight(0xfff4dc, 2.4); dl.position.set(2.5, 9, 4); hl.layers.set(1); dl.layers.set(1); scene.add(hl, dl); }

/* ============================== camera / input ============================== */
const EL_MIN = .02, EL_MAX = 1.1;   // vertical tilt is limited: a bit below eye level up to a steep look-down, no full 360 flipping
let camIntro = null;   /* the opening shot of a level: the camera swings round the tank while it comes in from far away, so the player sees the whole tank first */
const orbit = { az: .65, el: .3, dist: 10, fit: 10, azV: 0, elV: 0, panV: 0, target: new THREE.Vector3(0, 2.05, 0) };
const PAN_Y0 = 2.05;
function applyCam() {
  const lim = Math.max(0, 1 - orbit.dist / orbit.fit) * 2.6; orbit.target.y = clamp(orbit.target.y, PAN_Y0 - lim, PAN_Y0 + lim);   // moving up/down is only possible when zoomed in
  const ce = Math.cos(orbit.el);
  cam.position.set(orbit.target.x + orbit.dist * ce * Math.sin(orbit.az), orbit.target.y + orbit.dist * Math.sin(orbit.el), orbit.target.z + orbit.dist * ce * Math.cos(orbit.az));
  cam.lookAt(orbit.target); cam.updateMatrixWorld();
  scene.fog.near = orbit.dist - R * .9; scene.fog.far = orbit.dist + R * 2.4;
}
function resize() {
  stillN = 0;
  const app = $('app').getBoundingClientRect(), tw = $('tankwrap').getBoundingClientRect(); if (!app.width || !tw.height) return;
  renderer.setPixelRatio(prFor()); renderer.setSize(app.width, app.height, false); bgR.setSize(app.width, app.height, false); cam.aspect = tw.width / tw.height;
  // the camera frames the tank inside the tankwrap area, but the 3D world is drawn behind the whole screen
  cam.setViewOffset(tw.width, tw.height, -(tw.left - app.left), -(tw.top - app.top), app.width, app.height);
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const dW = (WALL_MAX + .22) / (t * cam.aspect), dH = (TANK_H / 2 + 1.0) / t;
  const keep = orbit.fit ? orbit.dist / orbit.fit : 1; orbit.fit = Math.max(dW, dH) * 1.0; orbit.dist = orbit.fit * keep; applyCam();
}
{ const ro = new ResizeObserver(resize); ro.observe($('tankwrap')); ro.observe($('app')); } window.addEventListener('resize', resize);

const ptrs = new Map(); let downInfo = null, pinch0 = null, lastMove = 0;
/* ---- pixel-accurate picking: every fish / obstacle is drawn into a hidden ID buffer using its real silhouette, so a tap selects exactly what is visible under the finger (with a small tolerance ring around it) ---- */
const PICK = { rt: null, mat: null, white: null, pid: 0, map: new Map(), t: -1e9, buf: null, w: 0, h: 0, on: false };
function pickBefore() {   // runs for each pickable mesh while the ID buffer is rendered
  if (!PICK.on) return; const u = PICK.mat.uniforms, id = this.userData.pid, map = this.material && this.material.map;
  u.uId.value.set((id & 255) / 255, (id >> 8) / 255); u.uHas.value = map ? 1 : 0; u.uMap.value = map || PICK.white; PICK.mat.uniformsNeedUpdate = true;
}
function pickRegister(o) {
  PICK.pid++; o.pid = PICK.pid; PICK.map.set(o.pid, o);
  o.group.traverse(m => { if (m.isMesh && !m.isSkinnedMesh && !(m.material && m.material.visible === false)) { if (m.userData.pickOnly) m.layers.set(2); else m.layers.enable(2); m.userData.pid = o.pid; m.onBeforeRender = pickBefore; } });
}
function pickRender() {
  const w = Math.max(8, Math.round(renderer.domElement.width * .5)), h = Math.max(8, Math.round(renderer.domElement.height * .5));
  if (!PICK.mat) {
    PICK.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); PICK.white.needsUpdate = true;
    PICK.mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uMap: { value: PICK.white }, uHas: { value: 0 }, uId: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform sampler2D uMap; uniform float uHas; uniform vec2 uId; varying vec2 vUv; void main(){ if(uHas>.5 && texture2D(uMap,vUv).a<.5) discard; gl_FragColor=vec4(uId,0.,1.); }' });
  }
  if (!PICK.rt || PICK.w !== w || PICK.h !== h) { if (PICK.rt) PICK.rt.dispose(); PICK.rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter }); PICK.w = w; PICK.h = h; PICK.buf = new Uint8Array(w * h * 4); }
  const oc = renderer.getClearColor(new THREE.Color()), oa = renderer.getClearAlpha();
  scene.overrideMaterial = PICK.mat; PICK.on = true; cam.layers.set(2);
  try { renderer.setRenderTarget(PICK.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(PICK.rt, 0, 0, w, h, PICK.buf); }
  finally { renderer.setRenderTarget(null); renderer.setClearColor(oc, oa); scene.overrideMaterial = null; cam.layers.set(0); PICK.on = false; }
  PICK.t = performance.now();
}
const pickValid = o => o && o.alive && !o.locked;
function pickAtId(cx, cy) {
  const r = canvas.getBoundingClientRect(), sx = PICK.w / r.width, sy = PICK.h / r.height, px = Math.round((cx - r.left) * sx), py = PICK.h - 1 - Math.round((cy - r.top) * sy);
  const idAt = (x, y) => { if (x < 0 || y < 0 || x >= PICK.w || y >= PICK.h) return 0; const i = (y * PICK.w + x) * 4; return PICK.buf[i] + PICK.buf[i + 1] * 256; };
  const direct = PICK.map.get(idAt(px, py)); if (pickValid(direct)) return direct;
  const rad = Math.ceil(24 * sx), sc = new Map();   // tolerance: nothing under the finger -> the closest / biggest silhouette within ~16px
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const d2 = dx * dx + dy * dy; const t = PICK.map.get(idAt(px + dx, py + dy)); if (!pickValid(t)) continue; const lim = (t.fastB ? 24 : t.sz === .5 ? 20 : 16) * sx; if (d2 > lim * lim) continue; sc.set(t, (sc.get(t) || 0) + 1 / (1 + d2)); }
  let best = null, bs = 0; for (const [t, v] of sc) if (v > bs) { bs = v; best = t; } return best;
}
function pickAtRay(cx, cy) {
  const hits = raycaster.intersectObjects(G.things.filter(o => o.alive && !o.locked).map(o => o.hit), false);
  return hits.length ? hits[0].object.userData.thing : null;
}
function pickAt(cx, cy, maxAge = 0) {
  ({ x: cx, y: cy } = lensClientToContent(cx, cy));   // the tank is drawn through a lens: find where the finger really is in the undistorted picture
  const r = canvas.getBoundingClientRect(); const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, cam);
  if (!G || G.status !== 'play') return null;
  try { if (performance.now() - PICK.t > maxAge) pickRender(); return pickAtId(cx, cy); } catch (e) { console.warn('pick fallback', e); return pickAtRay(cx, cy); }
}
function setHover(o) { if (!G) return; for (const t of G.things) t.hvT = t === o ? 1 : 0; canvas.style.cursor = o ? 'pointer' : ''; }
canvas.addEventListener('pointerdown', e => {
  if (window.__uiHit && window.__uiHit(e.clientX, e.clientY)) return;   // tap belongs to the Phaser HUD (see src/scenes/Hud.ts)
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); camTween.on = false; camIntro = null;
  if (ptrs.size === 1) { downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; if (!paused) setHover(pickAt(e.clientX, e.clientY, 0)); }
  else { downInfo = null; setHover(null); const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: orbit.dist, my: (a.y + b.y) / 2 }; }
  orbit.azV = 0; orbit.elV = 0; $('hint').classList.add('gone');
});
let camAct = 0, camDrag = false;   // last time the player moved the camera (drag, pinch, wheel): the booster buttons fade while it is moving
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p && window.__uiHit && window.__uiHit(e.clientX, e.clientY)) { setHover(null); return; }
  if (!p) { if (e.pointerType === 'mouse' && !paused) setHover(pickAt(e.clientX, e.clientY, 160)); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2 && pinch0) { camAct = performance.now(); camDrag = true; const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), my = (a.y + b.y) / 2; orbit.dist = clamp(pinch0.dist * pinch0.d / d, orbit.fit * .5, orbit.fit * 1.15); if (camTut.step === 'tilt') { camTut.panAcc = (camTut.panAcc || 0) + Math.abs(my - (pinch0.my ?? my)); if (camTut.panAcc > 70) camTut.pressed = 1; }   // tutorial: two fingers dragged up / down
    orbit.target.y += (my - (pinch0.my ?? my)) * .011 * orbit.dist / orbit.fit; pinch0.my = my; applyCam(); return; }
  if (downInfo) { downInfo.moved += Math.abs(dx) + Math.abs(dy); if (downInfo.moved > 10) setHover(null); }
  if (e.shiftKey || (e.buttons & 2)) { camAct = performance.now(); camDrag = true; if (camTut.step === 'tilt') { camTut.panAcc = (camTut.panAcc || 0) + Math.abs(dy); if (camTut.panAcc > 70) camTut.pressed = 1; } orbit.target.y += dy * .011 * orbit.dist / orbit.fit; applyCam(); return; }   // desktop: shift-drag or right-drag moves the camera up / down
  if (!downInfo || downInfo.moved > 10) { camAct = performance.now(); camDrag = true; }   // a real drag, not the wobble of a tap
  const dAz = -dx * .0075; orbit.az += dAz; if (camTut.step === 'rot') camTut.acc += Math.abs(dAz);
  const dEl = Math.abs(dy) > Math.abs(dx) * .35 ? dy * .0045 : 0;   // mostly-horizontal drags stay purely horizontal
  orbit.el = clamp(orbit.el + dEl, EL_MIN, EL_MAX);
  const now = performance.now(), dtm = Math.max(8, now - lastMove) / 1000; lastMove = now; orbit.azV = THREE.MathUtils.lerp(orbit.azV, dAz / dtm, .5); orbit.elV = THREE.MathUtils.lerp(orbit.elV, dEl / dtm, .5); applyCam();
});
const endPtr = e => {
  const had = ptrs.delete(e.pointerId); if (!ptrs.size) { camDrag = false; camAct = 0; }
  if (had && downInfo && ptrs.size === 0 && downInfo.moved < 10 && performance.now() - downInfo.t < 450) onTap(e.clientX, e.clientY);
  if (ptrs.size < 2) pinch0 = null; downInfo = null; if (e.pointerType !== 'mouse') setHover(null);
  if (performance.now() - lastMove > 90) { orbit.azV = 0; orbit.elV = 0; }
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); camAct = performance.now(); camIntro = null; orbit.dist = clamp(orbit.dist * (1 + e.deltaY * .001), orbit.fit * .5, orbit.fit * 1.15); applyCam(); }, { passive: false });

/* ============================== game state ============================== */
let G = null; let gid = 0, frameN = 0;
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
let squash = { s: 0, v: 0 };
const kick = (v = 3) => { squash.v += v; };

const CLAM_Y = .12;
function clamScreenFree(q) {   /* the clam must not sit under the booster row: it is tapped like a fish, and a booster button would take the tap */
  const row = document.querySelector('.tools'), r = row && row.getBoundingClientRect(), top = r && r.height > 10 ? r.top : $('app').getBoundingClientRect().bottom - 50 - 72;
  return projectToClient(q).y < top - 44;
}
function clamSpotFree(q) {   // keep clams clear of the theme decor so they are always visible
  const g = themeG[curTheme]; if (!g) return true;
  if (!g.userData.boxes) { g.userData.boxes = []; g.updateMatrixWorld(true); for (const c of g.children) { const b = new THREE.Box3().setFromObject(c); if (!b.isEmpty() && b.min.y < 1.4 && (b.max.x - b.min.x) < 6) g.userData.boxes.push(b); } }
  return g.userData.boxes.every(b => !(q.x > b.min.x - .45 && q.x < b.max.x + .45 && q.z > b.min.z - .45 && q.z < b.max.z + .45));
}
const FISH_CAP = 40, TUBE_INIT = 40;   // max fish in the tank at once (target + decoy), also enforced for pump waves; tube levels start at the cap
// Level data comes from levels.json (built-in 15 levels); the editor's Play button posts its own level, which overrides it for that session.
let PLAY_OVERRIDE = null;
function levelConfig(L) {
  const C = cfgFromLevel(PLAY_OVERRIDE || LV[srcLvl(L) - 1], L);
  if (!(Array.isArray(C.fishKeys) && C.fishKeys.length)) C.typesTotal = Math.min(BASE.length, C.typesTotal); return C;
}

function clearWorld() {
  PICK.map.clear(); PICK.pid = 0; PICK.t = -1e9; swarmHouseRemove();
  if (!G) return; for (const f of G.things) { fishRoot.remove(f.group); if (f.mark) fishRoot.remove(f.mark); } resetEvents();
}

const THEMES = [   // one look per 10 levels: the tank water and light, and the hall behind it (bg: wall gradient, floor, windows, rings, dust). decor = which decoration set stands in the tank
  { name: 'Aquarium hall', decor: 0, water: [.1, .55, .8], tint: [1, 1, 1.02], fog: 0x45c6f2, hemi: 0x4aa6d8, fill: 0x7fe4ff,
    bg: { wall: ['#0a3a78', '#0f5aa6', '#1e86d0', '#46b6ec', '#8fdcff'], f: [[.05, .24, .46], [.08, .4, .7], [.25, .7, 1], [.2, .85, 1], [.35, .85, 1], [.2, .5, .85]], w: [[.42, .9, 1], [.12, .66, .98], [.06, .34, .66], [.55, .95, 1], [.5, .9, 1], [.5, .47, .34]], spot: [.55, .9, 1], ring: 0x59e4ff, strip: 0x59e4ff, frame: 0x16407a, stage: 0x3a74b8, stageEm: 0x0c2c58, dust: 0x7fd8ff, cr: 0xffffff, clear: 0x1a78c0 } },
  { name: 'Lagoon', decor: 0, water: [.1, .76, .62], tint: [.92, 1.08, 1], fog: 0x38d2b8, hemi: 0x4ab8a8, fill: 0xb0ffe8,
    bg: { wall: ['#0a5a5a', '#128a86', '#22b4a8', '#5cd8c0', '#b4f4d8'], f: [[.03, .28, .3], [.1, .55, .5], [.4, .95, .8], [.3, 1, .8], [.5, 1, .8], [.3, .8, .6]], w: [[.7, 1, .85], [.2, .85, .78], [.05, .5, .5], [.8, 1, .8], [.7, 1, .9], [.75, .65, .4]], spot: [.7, 1, .85], ring: 0x7fffd0, strip: 0x7fffd0, frame: 0x10605a, stage: 0x2e9a8c, stageEm: 0x083a34, dust: 0xc8ffe8, cr: 0xd0fff0, clear: 0x28b0a0 } },
  { name: 'Sunset reef', decor: 1, water: [.24, .6, .58], tint: [1.17, 1, .76], fog: 0x48bcb8, hemi: 0x58b0b0, fill: 0xffe2a0,
    pillar: '#fff0e0', pillarEm: '#8a3a40', fluted: false, bg: { wall: ['#4a1a5a', '#a83a6a', '#e86a5a', '#ff9a6a', '#ffd08a'], f: [[.3, .1, .2], [.7, .3, .3], [1, .6, .4], [1, .55, .5], [1, .75, .5], [.9, .4, .5]], w: [[1, .85, .6], [1, .5, .45], [.55, .2, .35], [1, .8, .6], [1, .75, .6], [.7, .5, .35]], spot: [1, .75, .55], ring: 0xffb070, strip: 0xff9a8a, frame: 0x6a2a4a, stage: 0xc86a7a, stageEm: 0x4a1a2a, dust: 0xffd8a0, cr: 0xffc0a0, clear: 0xd86a6a } },
  { name: 'Deep sea', decor: 2, water: [.2, .22, .82], tint: [.96, .9, 1.2], fog: 0x4a52e0, hemi: 0x4a54cc, fill: 0xa8a8ff,
    pillar: '#9db4dc', pillarEm: '#0a1a44', fluted: false, bg: { wall: ['#03021c', '#0c0a52', '#1c1690', '#3a30c8', '#7a6cf0'], f: [[.03, .02, .16], [.1, .08, .45], [.35, .3, 1], [.4, .6, 1], [.4, .5, 1], [.5, .3, .9]], w: [[.3, .25, .9], [.12, .1, .6], [.03, .02, .25], [.45, .5, 1], [.4, .45, 1], [.2, .2, .35]], spot: [.55, .5, 1], ring: 0x7a8aff, strip: 0x8a6aff, frame: 0x14104a, stage: 0x3a2a98, stageEm: 0x0c0838, dust: 0xa098ff, cr: 0xc0b8ff, clear: 0x14104a } },
  { name: 'Kelp forest', decor: 3, water: [.12, .7, .4], tint: [.86, 1.1, .84], fog: 0x3cc8a0, hemi: 0x4ab888, fill: 0xb0ffc8,
    pillar: '#dcecc8', pillarEm: '#1a4a1c', fluted: false, bg: { wall: ['#06301c', '#0e5a30', '#1a8a4a', '#4ab87a', '#a4ecb0'], f: [[.02, .18, .1], [.08, .45, .25], [.5, 1, .5], [.6, 1, .4], [.5, 1, .6], [.3, .8, .4]], w: [[.55, 1, .6], [.1, .7, .4], [.02, .32, .2], [.7, 1, .6], [.6, 1, .7], [.5, .5, .3]], spot: [.6, 1, .6], ring: 0xa0ff70, strip: 0x90ff90, frame: 0x0c4a2a, stage: 0x2a8a58, stageEm: 0x0a3a1e, dust: 0xc8ffa0, cr: 0xb8ffc0, clear: 0x1a8a50 } },
  { name: 'Atlantis', decor: 4, water: [.5, .38, .88], tint: [1.14, .92, 1.22], fog: 0x9a88f0, hemi: 0x8a80d8, fill: 0xe8b0ff,
    pillar: '#f6f0fd', pillarEm: '#4a2a7a', fluted: true, bg: { wall: ['#240a5a', '#4a1a96', '#7a3ac8', '#b078e8', '#e8c0ff'], f: [[.14, .05, .28], [.4, .2, .65], [.85, .5, 1], [1, .6, 1], [.8, .6, 1], [.7, .4, .95]], w: [[.95, .7, 1], [.55, .35, .9], [.2, .1, .5], [1, .8, 1], [.9, .7, 1], [.6, .5, .7]], spot: [.9, .7, 1], ring: 0xe0a0ff, strip: 0xffa0f0, frame: 0x3a1a78, stage: 0x8a5ad0, stageEm: 0x2a1260, dust: 0xf0c8ff, cr: 0xe8c8ff, clear: 0x6a3ac0 } }];
const PIPE_COL = [[0xff7a3a, 0xc04a10, 0xfff0a0], [0xff7a3a, 0xc04a10, 0xfff0a0], [0x2ec4c0, 0x0a6a66, 0xfff0a0], [0xffb630, 0x8a5a00, 0xfff6c8], [0xff7a3a, 0xc04a10, 0xfff0a0], [0xf0c040, 0x7a5a10, 0xffffff]];   // the pipe is picked to stand out from the look behind it
function applyHallTheme(b, idx) {
  if (tube.bodyM && PIPE_COL[idx]) { const [c, e, r] = PIPE_COL[idx]; tube.bodyM.color.set(c); tube.bodyM.emissive.set(e); tube.ringM.color.set(r); }   // recolours everything of the hall behind the tank; a look with a painted hall (idx >= 1) shows the picture instead of the 3D wall, windows and floor (the stage, its ring and the dust stay)
  const pano = PANO_LOOKS.has(idx), h3 = HALL3D.has(idx), keep = [HBO.stage, glowRing2, hallDust, HBO.floor, ...(HBO.cones || [])], pic = PIC_LOOKS.has(idx), stat = !!STATIC_BG[idx]; hall.children.forEach(m => { m.visible = stat ? (m === HBO.stage || m === hallDust) : (!(pic || pano) || keep.includes(m) || m === HBO.pano || m === HBO.h3); }); panoSet(pano ? idx : 0); hall3d(idx, b); (HBO.cones || []).forEach(c => { c.visible = !h3; });   // (the old light cones are not part of the new hall)
  bgPicSet(pic ? idx : 0); bgPic.style.display = pic || stat ? 'block' : 'none'; bgPic.style.backgroundRepeat = 'repeat-x'; bgStat.on = stat; if (stat) { bgPic.style.backgroundImage = `url(${new URL(STATIC_BG[idx], document.baseURI).href})`; bgPic.style.backgroundSize = 'cover'; bgPic.style.backgroundRepeat = 'no-repeat'; bgPic.style.backgroundPosition = '50% 100%'; }
  ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'].forEach((k, i) => HB[k].value.set(...b.f[i])); ['wt', 'wm', 'wb', 'wr', 'wc', 'ws'].forEach((k, i) => HB[k].value.set(...b.w[i])); HB.spot.value.set(...b.spot);
  if (HBO.wallCv) { const g = HBO.wallCv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); [0, .3, .62, .9, 1].forEach((o, i) => gr.addColorStop(o, b.wall[i])); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); HBO.wallTex.needsUpdate = true; }
  if (glowRing2) { glowRing2.material.color.set(b.ring); glowRing2.material.opacity = HALL3D.has(idx) ? .4 : .85; } HBO.strips.forEach(m => m.material.color.set(b.strip)); HBO.frames.forEach(m => m.material.color.set(b.frame)); HBO.cr.forEach(m => m.material.color.set(b.cr));
  if (HBO.stage) { HBO.stage.material.color.set(b.stage); HBO.stage.material.emissive.set(b.stageEm); } if (hallDust) hallDust.material.color.set(b.dust); bgR.setClearColor(b.clear, pic || stat ? 0 : 1);
}
let curTheme = -1, curLook = -1;   // curTheme = the decoration set standing in the tank, curLook = the look (THEMES index)
const THEME_ORDER = [0, 2, 4, 5, 1, 3];   /* the ten-level blocks use the looks in this order (hall, sunset, kelp, atlantis, lagoon, deep sea), so two blocks side by side never have a similar colour */
const themeIdx = (L, th) => THEME_ORDER[th != null ? clamp(th | 0, 0, THEME_ORDER.length - 1) : Math.min(THEME_ORDER.length - 1, Math.floor((L - 1) / 10))];
function setTheme(L, th) {
  const i = themeIdx(L, th); if (i === curLook) return; curLook = i; const T = THEMES[i], d = T.decor; curTheme = d;
  themeG.forEach((g, k) => { g.visible = k === d; }); HOUSES = themeG[d].userData.houses;
  U.uWater.value.set(...T.water); U.uTint.value.set(...T.tint); scene.fog.color.set(T.fog); hemi.groundColor.set(T.hemi); fillL.color.set(T.fill); applyHallTheme(Object.assign({}, T.bg, { pillar: T.pillar, pillarEm: T.pillarEm, fluted: T.fluted }), i);
}

/* ============================== fish tube (outside-pipe version): a slim pipe rises out of the base, runs up the outside of the glass, passes through it and opens into the tank (L7+) ============================== */
const tube = { lidA: 0, lidV: 0, hinge: null, lidM: null, phi: 0, g: null, state: 'off', t: 0, em: 0, cur: null, starve: 0, chk: 0, ph: 0, sq: 0, sqv: 0, side: 1, mouth: new THREE.Vector3(), dir: new THREE.Vector3(), top: new THREE.Vector3(), curve: null, glow: null };
const PW = { uEdge: { value: new THREE.Vector4() }, uYr: { value: new THREE.Vector2() }, uK: { value: 0 }, uKV: { value: 0 } };
const PW_GLSL = `if (uK > 0. && gl_Position.w > .05) { vec2 uv = gl_Position.xy / gl_Position.w * .5 + .5;
  float xl = uEdge.x + uEdge.y * uv.y, xr = uEdge.z + uEdge.w * uv.y, c = .5 * (xl + xr), hw = .5 * (xr - xl);
  if (hw > 1e-4) { float s = (uv.x - c) / hw, as = abs(s), band = (uYr.y - uYr.x) * .08 + 1e-6;
    float wy = clamp((uv.y - uYr.x) / band, 0., 1.) * clamp((uYr.y - uv.y) / band, 0., 1.);
    float k = uK * step(as, 1.) * wy, sp = s / (1. + k * (1. - s * s));
    float b2 = (uYr.y - uYr.x) * .2 + 1e-6, wv = clamp((uv.y - uYr.x) / b2, 0., 1.) * clamp((uYr.y - uv.y) / b2, 0., 1.) * (1. - smoothstep(.78, 1., as)) * step(as, 1.);
    float vy = uv.y + (uv.y - .5 * (uYr.x + uYr.y)) * uKV * wv * s * s;
    gl_Position.xy = (vec2(c + sp * hw, vy) * 2. - 1.) * gl_Position.w; } }`;
function warpMat(m) {   // the lens bends the whole picture on screen, so the pipe is drawn pre-bent the opposite way: it ends up straight and un-tinted, yet it still sorts correctly against fish, ink and decor
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, PW); sh.vertexShader = 'uniform vec4 uEdge; uniform vec2 uYr; uniform float uK, uKV;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + PW_GLSL); };
  m.customProgramCacheKey = () => 'pipewarp';
}
const TX = 4.6, TR = .26;   // pipe stands clear of the stand/plinth; radius suits the fish
const TPW = [[TX, -.1], [TX, 1.0], [TX, 1.3], [TX - .1, 1.68], [TX - .35, 1.8], [3.3, 1.8], [3.12, 1.8], [2.95, 1.8]].map(([x, y]) => new THREE.Vector3(x, y, 0));   // pipe path (x = outwards): rises from a foot beside the plinth, up the outside of the glass, bends in through it
(function buildTube() {
  const g = new THREE.Group(), go = new THREE.Group(); g.add(go);   // go = the part outside the glass: drawn after the glass/lens pass so water and glass never bend or tint it
  const L = y => y + .1;   // group origin sits at y = -.1
  const M = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: 0xff7a3a, fog: false, metalness: .2, roughness: .35, emissive: 0xc04a10, emissiveIntensity: .75 }), M2 = new THREE.MeshStandardMaterial({ color: 0xfff0a0, fog: false, metalness: .5, roughness: .3, emissive: 0x6a4a00, emissiveIntensity: .5 });
  const tube3 = (pts, r, grp) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, L(y), 0)), false, 'centripetal'), 56, r, 16), M); grp.add(m); return m; };
  tube.bodyM = M; tube.ringM = M2;
  tube3([[TX, -.1], [TX, 1.0], [TX, 1.3], [TX - .1, 1.68], [TX - .35, 1.8], [3.2, 1.8]], TR, go);
  tube3([[3.3, 1.8], [3.12, 1.8], [2.95, 1.8]], TR, g);
  const tor = (r, t, x, y, rx, ry, grp) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 24), M2); m.rotation.set(rx, ry, 0); m.position.set(x, L(y), 0); (grp || g).add(m); return m; };
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(.56, .62, .26, 36), new THREE.MeshPhongMaterial({ color: 0x4a86c4, shininess: 100, specular: 0x7fc4ff, emissive: 0x08182c })); pad.position.set(TX, L(-.17), 0); go.add(pad);   // foot pad fused to the plinth
  const pt = new THREE.Mesh(new THREE.CylinderGeometry(.5, .56, .1, 36), new THREE.MeshPhongMaterial({ color: 0x3c6aa0, shininess: 120, specular: 0xffffff, emissive: 0x0c2240 })); pt.position.set(TX, L(-.01), 0); go.add(pt);
  tor(.3, .05, TX, .5, Math.PI / 2, 0, go); tor(.3, .05, TX, .95, Math.PI / 2, 0, go); tor(.34, .07, TX, .1, Math.PI / 2, 0, go);   // bands and the foot flange
  tor(.38, .08, 3.27, 1.9, 0, Math.PI / 2, go);   // flange where it goes through the glass
  tube.lip = tor(.33, .07, 2.97, 1.9, 0, Math.PI / 2);
  const gl = new THREE.Mesh(new THREE.CircleGeometry(.26, 24), new THREE.MeshBasicMaterial({ color: 0x9aeaff, transparent: true, opacity: .4, depthWrite: false, fog: false, ...ADD })); gl.rotation.y = Math.PI / 2; gl.position.set(2.95, L(1.9), 0); g.add(gl); tube.glow = gl;
  const LM = new THREE.MeshStandardMaterial({ color: 0xffb03a, fog: false, metalness: .45, roughness: .3, emissive: 0x8a4a00, emissiveIntensity: .5 }), hinge = new THREE.Group(); hinge.position.set(2.92, L(1.9 + .3), 0);   // round lid hinged at the top of the mouth: shut while the pipe waits, flips open to let the fish out
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .07, 28), LM); lid.rotation.z = Math.PI / 2; lid.position.set(0, -.3, 0); hinge.add(lid);
  const lr = new THREE.Mesh(new THREE.TorusGeometry(.25, .04, 8, 24), M2); lr.rotation.y = Math.PI / 2; lr.position.set(-.05, -.3, 0); hinge.add(lr);
  const kn = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), M2); kn.position.set(-.09, -.3, 0); hinge.add(kn);
  g.add(hinge); tube.hinge = hinge; tube.lidM = LM; tube.go = go;
  tube.goMats = [LM]; tube.parts = [];   // every pipe material gets the inverse lens warp in its vertex shader, so after the screen-space lens the pipe lands straight
  g.traverse(o => { if (o.isMesh) { if (o !== gl && !tube.goMats.includes(o.material)) tube.goMats.push(o.material); } }); tube.parts.push(go, hinge, tube.lip, g.children[1]);
  for (const m of tube.goMats) warpMat(m); warpMat(gl.material);
  g.position.y = -.1; g.visible = false; tank.add(g); tube.g = g; tube.curve = new THREE.CatmullRomCurve3(TPW.map(p => p.clone()), false, 'centripetal');   // local path, turned to the camera's left edge every frame
})();
(function tubePrepass() {   // while the pipe is see-through, a depth-only copy of every part is drawn first: then only the front-most surface of the whole pipe shows, at one even opacity, so the pipe fades in and out as ONE block instead of its parts showing up one by one
  const pm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }); warpMat(pm);
  tube.pre = []; const list = []; tube.g.traverse(o => { if (o.isMesh && o !== tube.glow) list.push(o); });
  for (const o of list) { const c = new THREE.Mesh(o.geometry, pm); c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale); c.renderOrder = 4; o.renderOrder = 6; c.visible = false; o.parent.add(c); tube.pre.push(c); }
})();
const YAX = new THREE.Vector3(0, 1, 0);
let TUBE_PHI = .65 + Math.PI + 1.15;   // fixed spot on the tank: front-left of the default view, so it stays on screen
function pipeSpot(phi) {   /* where the pipe goes through the glass: on a flat or gently curved part of the wall, turned to face along the wall's normal (the cylinder: straight out along the radius, as it always was) */
  if (!PLAN) { const d = BOWL ? R * bowlP(1.9) - R : 0, th = -phi; return { phiN: phi, ox: Math.cos(th) * d, oz: Math.sin(th) * d }; }
  const th0 = -phi, nu = th => { const e = .03, a = th - e, b = th + e, wa = wallR(a), wb = wallR(b); return Math.atan2(-(Math.cos(b) * wb - Math.cos(a) * wa), Math.sin(b) * wb - Math.sin(a) * wa); };
  const wr = x => Math.atan2(Math.sin(x), Math.cos(x)); let best = th0, bs = 1e9;
  for (let k = -35; k <= 35; k++) { const th = th0 + k * .02, sc = Math.abs(wr(nu(th + .12) - nu(th - .12))) + .25 * Math.abs(k * .02); if (sc < bs) { bs = sc; best = th; } }
  const n = nu(best), w = wallR(best);
  return { phiN: -n, ox: Math.cos(best) * w - R * Math.cos(n), oz: Math.sin(best) * w - R * Math.sin(n) };
}
let TUBE_SPOT = { phiN: TUBE_PHI, ox: 0, oz: 0 };
const tubeW = v => { v.applyAxisAngle(YAX, tube.phi); v.x += TUBE_SPOT.ox; v.z += TUBE_SPOT.oz; return v; };
function tubeFrame(dt) {   // the pipe is bolted to the tank at one fixed place, it turns with the tank when the player rotates the view
  tube.phi = TUBE_SPOT.phiN; tube.g.rotation.y = tube.phi; tube.g.position.x = TUBE_SPOT.ox; tube.g.position.z = TUBE_SPOT.oz;
  tubeW(tube.top.copy(TPW[0])); tube.top.y += .05; tubeW(tube.mouth.set(2.8, 1.8, 0)); tube.dir.set(-1, 0, 0).applyAxisAngle(YAX, tube.phi); tubeFade();
}
const _fp = new THREE.Vector3();
function tubeFade() {   // the pipe turns see-through whenever it stands on the viewer's side of the tank (in front or at the corner), so it never hides fish the player is aiming at
  tubeW(_fp.set(TX, 1.0, 0)); _fp.project(cam);
  const d = Math.sin(orbit.az - tube.phi), x = Math.abs(_fp.x), sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const amin = .1 + .3 * sm(.7, 1.1, x);
  let dn = 1e9; for (const px of [TX, TX - .5, 3.6]) { tubeW(_fp.set(px, 1.0, 0)); dn = Math.min(dn, Math.hypot(cam.position.x - _fp.x, cam.position.z - _fp.z)); }   // the camera can be zoomed right up to the pipe and slice it with the near plane: fade it out completely before that
  let a = (1 - sm(-.2, .25, d) * (1 - amin)) * sm(1.4, 3.2, dn);
  if (tube.state === 'rumble' || tube.state === 'emit' || tube.state === 'out') a = Math.max(a, .85 * sm(1.4, 3.2, dn));   // while it is working the pipe is the show: lid opening and fish leaving must be seen
  if (inks.length) { tubeW(_fp.set(3.0, 1.8, 0)); let cov = 0; for (const k of inks) { const env = Math.min(1, k.t / .8, (k.dur - k.t) / 2.2), dd = k.grp.position.distanceTo(_fp); cov = Math.max(cov, env * clamp(1 - (dd - 1.3) / 2.2, 0, 1)); } a *= 1 - .92 * cov; }   // a squid's ink cloud hides the pipe too
  tube.fadeA = tube.fadeA == null ? a : tube.fadeA + (a - tube.fadeA) * .2;
  const fa = tube.fadeA; for (const m of tube.goMats) { m.transparent = false; m.opacity = 1; m.depthWrite = true; if (m === tube.bodyM) m.side = THREE.DoubleSide; }   /* a see-through pipe is not drawn into the tank picture at all: it is drawn as its own layer (pipeComposite) and laid over the finished picture, so the base and glass behind it are never cut away */
  for (const c of tube.pre) c.visible = false;
  tube.blurA = clamp((.985 - fa) / .6, 0, 1);
  if (tube.glow) tube.glow.visible = fa > .5; for (const q of tube.parts) q.visible = fa > .03;
}
function tubePose(jx, jz) { const w = 1 + tube.sq * .14; tube.g.scale.set(w, 1 - tube.sq * .08, w); tube.g.position.set(jx || 0, -.1, jz || 0); }
function tubeChoosePhi() {   // stand the pipe where no decor solid sits in its path (the first free spot, closest to the preferred one)
  const B = themeBoxes(curTheme), p = new THREE.Vector3();
  for (const off of [1.15, .95, 1.35, .75, 1.55, .55, 1.75, .35, 1.95]) { const phi = .65 + Math.PI + off, S = pipeSpot(phi), c = Math.cos(S.phiN), sn = Math.sin(S.phiN); let ok = true;
    for (const x of [3.8, 3.5, 3.2, 2.9, 2.6, 2.3]) { p.set(S.ox + x * c, 1.8, S.oz - x * sn); if (B.some(b => b.distanceToPoint(p) < .6)) { ok = false; break; } }
    if (ok) return phi; }
  return .65 + Math.PI + 1.15;
}
function tubeSetup() { TUBE_PHI = tubeChoosePhi(); TUBE_SPOT = pipeSpot(TUBE_PHI); tube.state = G && G.waves && G.waves.length ? 'idle' : 'off'; tube.t = 0; tube.starve = 0; tube.cur = null; tube.ph = 0; tube.sq = 0; tube.sqv = 0; tube.lidA = 0; tube.lidV = 0; tube.hinge.rotation.z = 0; tube.g.visible = tube.state !== 'off'; if (tube.g.visible) { tube.phi = orbit.az + Math.PI; tubeFrame(1); tubePose(0, 0); tube.glow.material.opacity = .25; } }
const _tv = new THREE.Vector3();
function tubeFishStep(o, dt, t) {   // a fish rides up the pipe small and stretched (the pipe is see-through), then pops out of the mouth at full size
  const T = o.tubeP; T.u += dt / T.dur; const k = Math.min(1, T.u), e = Math.pow(k, 1.3); o.group.visible = false;   // hidden inside the solid pipe
  tube.curve.getPointAt(e, o.pos); tubeW(o.pos); o.pos.y -= .0; o.group.position.copy(o.pos); tube.curve.getTangentAt(Math.min(.999, e), _tv); _tv.applyAxisAngle(YAX, tube.phi); Y.set(0, Math.atan2(-_tv.z, _tv.x), Math.asin(clamp(_tv.y, -1, 1)), 'YZX'); o.group.quaternion.setFromEuler(Y);
  const s = .24 * o.sz * Math.min(1, k * 12), st = 1 + .5 * k; o.group.scale.set(s * st, s / Math.sqrt(st), s / Math.sqrt(st));
  o.parts.tail.rotation.y = Math.sin(t * 45) * .6; o.parts.body.rotation.y = Math.sin(t * 45 + 1) * .15;
  if (k >= 1) {   // out of the mouth: shoot ahead, grow back with a bounce
    o.tubeP = null; o.exitT = t; o.group.visible = true; o.pos.copy(tube.mouth); o.dir.copy(tube.dir); o.boost = 2.3; o.grow = 0; o.gb = .3; o.pos.y = clamp(o.pos.y, FLOOR_Y + o.ym, WATER_Y - o.ym);
    o.wp = tube.mouth.clone().addScaledVector(tube.dir, rand(1.4, 2.5)); o.wp.x += rand(-.7, .7); o.wp.z += rand(-.7, .7); o.wp.y = clamp(o.wp.y + rand(-1.2, .3), FLOOR_Y + .7, WATER_Y - .6); o.wpT = rand(3, 5);
    tube.sqv += 6; burstFx.emit(tube.mouth, 0xffffff, 9, 1); burstFx.emit(tube.mouth, 0xaeeaff, 5, .6); Snd.play('spawn');
  }
}
function tubeStarved() {   // every shown target is waiting for a fish that is not in the tank (only in the pipe)
  let any = false;
  for (const t of G.targets) {
    if (!t || t.done) continue; any = true; const need = perOf(t.type) - t.count; if (need <= 0) continue;
    const have = G.things.reduce((n, o) => n + (o.kind === 'fish' && o.type === t.type && o.alive && !o.gone && !o.locked ? 1 : 0), 0) + G.backup.filter(it => !it.junk && it.type === t.type).length;
    if (have > 0) return false;   // there is still a fish to catch: not stuck (a set that is one short because its last fish is waiting in the pipe is not stuck either)
  }
  return any;
}
function tubeStart() {
  if (!G.waves.length) return; tube.cur = G.waves.shift(); tube.state = 'rumble'; tube.t = 0; tube.em = 0; tube.starve = 0; tube.ph = 0; tube.told = false; Snd.play('tapwater');
}
function tubeUpdate(dt) {
  if (!G || tube.state === 'off') return;
  tube.t += dt; const t = tube.t, now = U.uTime.value - G.t0;
  tube.sqv += (-170 * tube.sq - 9 * tube.sqv) * dt; tube.sq += tube.sqv * dt;   // springy squash and stretch, kicked by every fish
  tubeFrame(dt);
  const tgt = tube.state === 'emit' ? -1.9 : tube.state === 'rumble' ? -Math.abs(Math.sin(t * 38)) * .1 * Math.min(1, t / .9) : 0;   // lid: chatters during the wind-up, flips open while fish come out, then snaps shut with a bounce
  tube.lidV += ((tgt - tube.lidA) * 260 - tube.lidV * 13) * dt; tube.lidA += tube.lidV * dt; if (tube.lidA > 0) { tube.lidA = 0; tube.lidV *= -.35; } tube.hinge.rotation.z = tube.lidA; tube.glow.visible = tube.lidA < -.4;
  tube.lidM.emissiveIntensity = tube.state === 'idle' && G.waves.length ? .45 + .3 * Math.sin(now * 2.4) : .5;   // while fish wait inside the lid pulses softly
  if (tube.state === 'idle') {
    /* the pipe tells the player that a wave is near: two tanks before it the mouth starts to glow, one tank before it glows more, bubbles rise and the pipe shivers now and then, and when the wave is due it is at its brightest */
    const remain = G.waves.length ? G.waves[0].t - G.completed : 99, want = !G.waves.length ? 0 : remain <= 0 ? 1 : remain === 1 ? .7 : remain === 2 ? .35 : 0;
    tube.prog = (tube.prog || 0) + (want - (tube.prog || 0)) * Math.min(1, dt * 1.8); const pr = tube.prog;
    tube.shv = Math.max(0, (tube.shv || 0) - dt); tube.shT = (tube.shT || 0) - dt;
    if (remain <= 1 && G.waves.length && G.status === 'play' && !paused && tube.shT <= 0) { tube.shv = .45; tube.shT = 2.4 + Math.random() * .8; }
    const sk = tube.shv / .45; tubePose(Math.sin(now * 61) * .013 * sk, Math.cos(now * 53) * .013 * sk);
    tube.glow.material.opacity = (G.waves.length ? .3 : .1) + (G.waves.length ? .12 : .04) * Math.sin(now * 2.2) + .4 * pr; tube.glow.visible = tube.glow.visible || pr > .06;
    tube.lidM.emissiveIntensity += 1.2 * pr; if (pr > .06 && Math.random() < dt * 7 * pr) burstFx.emit(tube.mouth, 0xbdf0ff, 1, .35);
    if (!G.waves.length || G.status !== 'play' || paused || introOn || guide.on || camTutBusy()) return;   // a wave starts right away: no waiting for events, feeding or the swarm
    const nIn = G.things.reduce((n, o) => n + (o.kind === 'fish' && o.alive && !o.gone && !o.tubeP ? 1 : 0), 0), sparse = nIn <= Math.round(FISH_CAP * .58) && now - (tube.lastT || -99) > 5;   // a wave is pumped in only once the tank has thinned out: crowded water gets no new fish
    const due = G.completed >= G.waves[0].t; if (due && tube.due == null) tube.due = now; if (!due) tube.due = null; const overdue = due && (G.completed > G.waves[0].t || now - tube.due > 8);   // a wave that is due but the tank never thins out (boosters, many decoys) must still come: after 8 s, or one more finished tank, it is pumped whatever the crowd (the FISH_CAP hold still keeps it from overfilling)
    tube.chk -= dt; if (due && (sparse || overdue) && !tankFx.busy() && (G.goalShown || 0) >= G.completed) { tube.wait = (tube.wait || 0) + dt; if (tube.wait > 1.1) { tube.wait = 0; tube.due = null; tubeStart(); return; } } else tube.wait = 0;   // a wave starts a moment after the finished tank's bubble has reached the gauge, not the instant the tank is done
    if (tube.chk <= 0) { tube.chk = .5; tube.starve = tubeStarved() ? tube.starve + .5 : 0; if (G.cfg.autoPump !== false && tube.starve >= (G.cfg.stuckDelay || 2.5)) tubeStart(); }
  } else if (tube.state === 'rumble') {   // wind-up: the pipe rattles harder and harder, the mouth glows and bubbles
    const k = Math.min(1, t / .9); tubePose(Math.sin(t * 55) * .03 * k, Math.cos(t * 49) * .03 * k); if (t > .6 && tube.ph < 1) { tube.ph = 1; tube.sqv -= 6; }
    tube.glow.material.opacity = .4 + .5 * k; if (Math.random() < dt * 16 * k) burstFx.emit(tube.mouth, 0xbdf0ff, 2, .5);
    if (t >= .9) { tube.state = 'emit'; tube.t = 0; tube.em = 0; tube.sqv += 5; Snd.play('pipeopen'); }
  } else if (tube.state === 'emit') {
    tubePose(Math.sin(t * 50) * .012, Math.cos(t * 47) * .012); tube.em -= dt;
    if (tube.em <= 0) {
      const nx = tube.cur.specs[0];   // fish cap: decoys wait in the pipe while the tank is full (held target fish always come out first)
      if (nx && !nx.tgt && G.things.reduce((n, o) => n + (o.kind === 'fish' && o.alive && !o.gone ? 1 : 0), 0) >= FISH_CAP) { tube.state = 'hold'; tube.t = 0; Snd.play('pipeclose'); return; }   // the tank is full: the lid shuts and the pipe waits quietly
      const sp = tube.cur.specs.shift(); if (!sp) { if (!G.things.some(o => o.tubeP)) { tube.state = 'out'; tube.t = 0; tube.sqv -= 3; Snd.play('pipeclose'); } return; }
      if (!tube.told) { tube.told = true; toast('New fish coming!'); }   // told when the first fish really comes out (not while the lid waits for room)
      tube.em = .2; spawnThing(sp, tube.top.clone(), 0); const th = G.things[G.things.length - 1]; th.spawnAt = now; th.scale = 1; th.tubeP = { u: 0, dur: .85 + Math.random() * .1 }; th.group.scale.setScalar(.0001);
      tube.sqv -= 3; burstFx.emit(tube.top, 0xaeeaff, 3, .6);
    }
  } else if (tube.state === 'hold') {   // waiting for room in the tank: lid closed, no shaking
    tubePose(0, 0); tube.glow.material.opacity = .25 + .1 * Math.sin(now * 2.2);
    // stuck: the tank is full of decoys, every fish the targets need waits in a later wave, so nobody can make room. The decoys this wave still holds move to the end of the next wave, so that wave's held target fish come out first
    tube.starve = tubeStarved() ? (tube.starve || 0) + dt : 0;
    if (tube.starve >= (G.cfg.stuckDelay || 2.5) && G.cfg.autoPump !== false && G.waves.length && tube.cur && tube.cur.specs.length && !G.things.some(o => o.tubeP)) { G.waves[0].specs.push(...tube.cur.specs.splice(0)); tube.starve = 0; tube.state = 'out'; tube.t = 0; Snd.play('pipeclose'); return; }
    if (t > .5 && G.things.reduce((n, o) => n + (o.kind === 'fish' && o.alive && !o.gone ? 1 : 0), 0) < FISH_CAP - 1) { tube.state = 'emit'; tube.t = 0; tube.em = 0; Snd.play('pipeopen'); }
  } else if (tube.state === 'out') {   // a last shiver and it settles
    tubePose(Math.sin(t * 60) * .03 * Math.max(0, 1 - t / .3), 0); if (t >= .6) { tube.state = 'idle'; tube.cur = null; tube.lastT = now; }
  }
}
let emitT = 0;
function themeUpdate(dt, t) {
  const g = themeG[curTheme]; if (!g) return; emitT += dt; if (emitT > .3) { emitT = 0; for (const p of g.userData.emit) burstFx.emit(p, 0xffffff, 2, .22); }
  if (g.userData.gem) g.userData.gem.rotation.y += dt * 1.6;
}
let lvPending = 0;   // a level whose "LEVEL N" animation waits for the first-time pop-up to close
const TIERFX = [0, 0xd8c0ff, 0xffc0cc], TIERBALL = [0, 0xc8a8ff, 0xffa0b4];   // Hard (purple) and Super Hard (red-pink): the colour of the bubble that carries the level number
const levelTier = L => { const r = LV[srcLvl(L) - 1]; return !r || L < 10 ? 0 : r.difficulty === 'Very Hard' ? 2 : r.difficulty === 'Hard' ? 1 : 0; };   // the sheet's Difficulty column: Hard -> 1, Very Hard -> 2 (from level 10 on)
const fxc = c => (window.__lvTier ? TIERFX[window.__lvTier] : c);
function startLvIntro() { if (!lvPending || !G || G.level !== lvPending) { lvPending = 0; window.__lvShown = true; return; } window.__lvIntro = { t0: performance.now(), n: lvPending }; lvPending = 0; }
const HUD_DELAY_MS = 2000;   // the UI slides in first (the last piece, the Backup tank, lands at about 1 s); only then the LEVEL words, or the first-time pop-up of a booster, may appear
function hudIntroAnim() {   // the UI comes in at the start of a level: the top row slides down, the Backup tank pops in like the target tanks, the boosters slide in from the right one after another
  const run = (el, cls, delay) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.style.animationDelay = delay + 's'; el.classList.add(cls); setTimeout(() => { el.classList.remove(cls); el.style.animationDelay = ''; }, 1500); };
  run(document.querySelector('.topbar'), 'inTop', 0); run($('backup'), 'pop', .22);
  ['bHint', 'bTank', 'bClear'].forEach((id) => run($(id), 'inRight', .3));
}
function newLevel(L) {
  setShape(shapeForLevel(srcLvl(L)));
  window.__hudFadeT0 = undefined; const hd = L >= 2 ? HUD_DELAY_MS : 0; window.__hudInT0 = performance.now() + hd; { const gi0 = gid + 1; if (hd) setTimeout(() => { if (gid === gi0) hudIntroAnim(); }, hd); else hudIntroAnim(); } window.__lvTier = levelTier(L);   // level 2+: the LEVEL words come first, the UI slides in while the bubble flies and has landed when the bubble reaches the badge
  
  clearWorld(); ovClear(); gid++;
  const cfg = levelConfig(L); if (cfg.clams && !CLAM.ready && !CLAM.failed) { loadClam().then(() => newLevel(L)); return; }
  if (cfg.jelly && !JEL.ready && !JEL.failed) { loadJelly().then(() => newLevel(L)); return; } if (JEL.failed) cfg.jelly = 0;
  if (cfg.squid && !OCT.ready && !OCT.failed) { loadOctopus().then(() => newLevel(L)); return; } if (OCT.failed) cfg.squid = 0;   /* the octopus model comes in before a level that has it */
  if (Array.isArray(cfg.fishKeys) && cfg.fishKeys.length && cfg.fishKeys.some(kk => MODEL_IDX[kk] === undefined)) { loadFish(cfg.fishKeys.map(kk => kk.replace(/^fish_/, ''))).then(() => newLevel(L)); return; }
  { const nx = levelConfig(L + 1); if (nx && Array.isArray(nx.fishKeys)) setTimeout(() => loadFish(nx.fishKeys.map(kk => kk.replace(/^fish_/, ''))), 4000); }   // the next level's fish arrive in the background
  setTheme(L, cfg.theme);
  const k = cfg.goal;   // one target species per set, exactly 3 fish each - no spare target fish are ever added
  // big species (whale, shark) never become targets - they only swim around as scenery among the decoys
  const pool = diverse(BASE), isBig = i => (SPECIES[i].len || 0) >= .8;
  const smallAll = pool.filter(i => !isBig(i)), bigAll = pool.filter(i => isBig(i));
  const nb = Math.min(bigAll.length, L < 3 ? 0 : L < 8 ? 1 : 2);
  const fk = Array.isArray(cfg.fishKeys) && cfg.fishKeys.length ? cfg.fishKeys.map(kk => MODEL_IDX[kk]).filter(i => i !== undefined) : null;   // a test level can name its fish (level 61: the Tripo set, one of each)
  const only = cfg.onlyFish ? MODEL_IDX[cfg.onlyFish] : undefined;   // a test level can use one 3D model for every fish
  const step = 360 / Math.max(1, k), nd3 = Math.max(0, cfg.typesTotal - k);   // a 3D-model level: the targets are the model in k evenly spaced colours, the decoy species are in-between colours
  const targetTypes = fk ? fk.slice(0, k) : only !== undefined ? Array.from({ length: k }, (_, i) => modelVariant(only, Math.round(i * step))) : smallAll.slice(0, k);
  const baseDecoys = fk ? fk.slice(k) : only !== undefined ? Array.from({ length: nd3 }, (_, i) => modelVariant(only, Math.round((i + .5) * step))) : smallAll.slice(k, k + (cfg.typesTotal - k - nb)).concat(bigAll.slice(0, nb));
  // 1~2 of the decoy species are colour variants of a target species (same body, different colours)
  const looks = shuffle(targetTypes.slice()).slice(0, Math.min(cfg.look, baseDecoys.length)).map(tt => variantOf(tt, (Math.random() < .5 ? 1 : -1) * cfg.shift));
  const decoyTypes = looks.concat(baseDecoys);   // the colour copies are extra decoy species: they no longer take the place of the first species named in the level
  const multi = targetTypes.slice(); const counts = {}; multi.forEach(t => counts[t] = (counts[t] || 0) + 1);
  const spawn = [];
  // bounty tanks (up to 2 kinds in a level, each a different target species that needs just 1 fish, made hard to spot / catch): the last target species
  const bKinds = cfg.bounty || [], bTypes = bKinds.map((kd, i) => targetTypes[k - 1 - i]);
  // fish per target tank: one entry per target species. A bounty species always needs 1; the other species take the level's tank sizes in random order
  const sizes = cfg.tanks ? cfg.tanks.slice() : Array(k).fill(cfg.per);
  bTypes.forEach(() => { const j = sizes.indexOf(1); if (j >= 0) sizes.splice(j, 1); else sizes.pop(); });
  const sizeQ = shuffle(sizes), perMap = {}; let sqi = 0; targetTypes.forEach(t => { perMap[t] = bTypes.includes(t) ? 1 : (sizeQ[sqi++] ?? cfg.per); });
  for (const t in counts) { const bi = bTypes.indexOf(+t); for (let i = 0; i < counts[t] * perMap[+t]; i++) spawn.push({ kind: 'fish', type: +t, bounty: bi < 0 ? null : bKinds[bi] }); }
  bTypes.forEach((bt2, bi) => { if (bKinds[bi] === 'camo') { const cv = variantOf(bt2, Math.random() < .5 ? 20 : -20); for (let i = 0; i < 5; i++) spawn.push({ kind: 'fish', type: cv }); } });   // look-alikes: same body and texture, colours only a little off
  // decoys: only the non-target species, spread evenly
  const remArr = shuffle(multi); bTypes.forEach(bt2 => remArr.splice(remArr.indexOf(bt2), 1)); bTypes.forEach((bt2, bi) => remArr.splice(bi === 0 ? Math.min(2, remArr.length) : Math.min(remArr.length, Math.max(5, remArr.length - 2)), 0, bt2));   // the bounty tanks come after the first two; a second one comes near the end
  // fish tube (L7+): part of the fish (targets AND decoys) wait in the tube and are pumped in as waves - every 2~3 finished sets. Some waves carry the LAST fish of a target set, so the player must wait for / hunt the new wave.
  const waves = [];
  if (cfg.tube) {
    if (cfg.tubeWaves && cfg.tubeWaves.length) cfg.tubeWaves.forEach(w => waves.push({ t: Math.max(1, w.afterTanks | 0), specs: [], hold: w.holdLast !== false, holdN: Math.max(1, w.holdFish | 0) }));   // waves set in the level file
    else {
      let c = 2 + (Math.random() < .5 ? 0 : 1); while (c <= cfg.goal - 2) { waves.push({ t: c, specs: [] }); c += 2 + (Math.random() < .5 ? 0 : 1); }
      if (!waves.length) waves.push({ t: Math.min(2, cfg.goal - 1), specs: [] });
    }
    const used = new Set();
    for (const w of waves) for (let h = 0; h < (w.holdN || 1); h++) { let j = w.t; while (j < remArr.length && (bTypes.includes(remArr[j]) || used.has(remArr[j]))) j++; if (j >= remArr.length) break; const ty = remArr[j], at = spawn.findIndex(x => x.type === ty && !x.bounty); used.add(ty); if (at < 0 || perMap[ty] < 2 || w.hold === false) continue; spawn.splice(at, 1); w.specs.push({ kind: 'fish', type: ty, tgt: true }); }   // each wave holds back the last fish of holdN target species (1 unless the level file says more)
  }
  const bigN = {}, decN = {}, DEC_TINT = [52, -52, 104, -104, 150, -150];   /* two wrong fish of the same species must not look like twins: every copy after the first has its colours turned a little (not enough to make it a look-alike of a target), so each one reads as a fish of its own */
  const bk = ty => { const q = SPECIES[ty]; return q.model3d || q.base || q.id; };   // the body a species is built from (hue variants of one fish share it)
  const nextDecoy = () => { for (;;) { const ty = decoyTypes[di++ % decoyTypes.length]; if (isBig(ty)) { bigN[ty] = (bigN[ty] || 0) + 1; if (bigN[ty] > 1) continue; } const n = decN[ty] = (decN[ty] || 0) + 1; return { kind: 'fish', type: n > 1 && !isBig(ty) ? variantOf(ty, DEC_TINT[(n - 2) % DEC_TINT.length]) : ty }; } };
  if (cfg.maxFish != null && cfg.startFish != null) { cfg.decoys = Math.max(0, cfg.maxFish - spawn.length); cfg.tubeExtra = cfg.tube ? clamp(cfg.maxFish - cfg.startFish, 0, cfg.decoys) : 0; }   /* the level says how many fish are there at the start and how many in all: the rest is pumped, no more */
  let di = 0, extra = cfg.tube ? (cfg.tubeExtra != null ? Math.max(0, cfg.decoys - cfg.tubeExtra) : Math.max(0, Math.min(cfg.decoys, TUBE_INIT - spawn.length))) : (cfg.maxFish != null ? cfg.decoys : Math.max(0, Math.min(cfg.decoys, FISH_CAP - spawn.length)));   // the tank starts with at most TUBE_INIT (tube levels) / FISH_CAP fish
  if (cfg.tube) for (let k = 0, n = cfg.decoys - extra; k < n; k++) waves[k % waves.length].specs.push(nextDecoy());
  if (cfg.tube) for (let i = 0; i < waves.length; i++) {   // a wave carries 8-10 fish: bigger ones are cut into several waves (the first piece keeps the held target fish, which come out first)
    const w = waves[i], n = w.specs.length, k = n > 10 ? Math.round(n / 8.5) : 1; if (k > 1) { const all = w.specs.splice(0), per = Math.ceil(all.length / k); w.specs = all.slice(0, per); for (let j = 1; j < k; j++) waves.splice(i + j, 0, { t: w.t, specs: all.slice(j * per, (j + 1) * per) }); i += k - 1; }
  }
  for (; extra > 0; extra--) spawn.push(nextDecoy());
  for (let i = 0; i < cfg.urchin; i++) spawn.push({ kind: 'urchin' });
  for (let i = 0; i < cfg.jelly; i++) spawn.push({ kind: 'jelly' });
  for (let i = 0; i < cfg.squid; i++) spawn.push({ kind: 'squid' });

  G = { waves, level: L, cfg, id: gid, status: 'play', mistakes: 0, hintUntil: 0, completed: 0, goalShown: 0, bounty: bTypes.length ? bTypes.map((t, i) => ({ type: t, kind: bKinds[i] })) : null, perMap, remaining: remArr, targets: Array(NT).fill(null), backup: [], things: [], t0: U.uTime.value };
  // spawn with spacing
  const placed = [];
  for (const s of shuffle(spawn)) {
    let pos = null;
    for (let tr = 0; tr < 40; tr++) {
      const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * RF * shK(Math.cos(a), Math.sin(a)); const y = s.kind === 'urchin' ? rand(FLOOR_Y + .5, 2.0) : s.kind === 'squid' ? rand(FLOOR_Y + 1.2, WATER_Y - .8) : rand(FLOOR_Y + .6, WATER_Y - .55);
      const p = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      if (placed.every(q => q.distanceTo(p) > .5)) { pos = p; break; }
      pos = p;
    }
    placed.push(pos); spawnThing(s, pos, G.things.length);
  }
  // schools: most decoy species travel in small groups of 3-5 (target fish always swim alone, so they stay distinguishable)
  const schooled = new Set();
  for (const dty of decoyTypes) {
    const body = bk(dty); if (schooled.has(body)) continue; schooled.add(body);   /* the tinted copies of a species still swim together: they are grouped by body, not by exact colour */
    const fs = shuffle(G.things.filter(o => o.kind === 'fish' && bk(o.type) === body)), n = Math.floor(fs.length * .6); let i = 0;
    while (n - i >= 3) {
      const sz = Math.min(n - i, 3 + Math.floor(Math.random() * 3)), m = fs.slice(i, i + sz), S = { wp: new THREE.Vector3(), wpT: 0, upd: -1, lead: m[0], m, sp: rand(.55, .85) }, base = m[0].pos;
      m.forEach((f, k) => { f.school = S; f.off = new THREE.Vector3(rand(-.9, .9), rand(-.35, .35), rand(-.9, .9)); f.speed = S.sp * cfg.speedK * rand(.95, 1.05);
        if (k) { f.pos.set(base.x + f.off.x * .7, clamp(base.y + f.off.y, FLOOR_Y + .6, WATER_Y - .6), base.z + f.off.z * .7); clampXZ(f.pos, RF - .1); f.group.position.copy(f.pos); } });
      i += sz;
    }
  }
  resetEvents(); tubeSetup(); swarmHouseSetup(); G.nextFeed = rand(12, 18); G.nextStartle = rand(14, 22); G.nextEv = rand(3, 5); G.nextSwarm = rand(7, 10); G.clamFrom = rand(7, 9); G.combo = 0; G.comboUntil = 0; camTut.step = null; guide.on = L === 1 && !save.g1; guide.left = 2; guide.tgt = null; orbit.dist = orbit.fit * (L <= 3 ? .8 : L <= 6 ? .85 : .92); applyCam();
  // clams sit on the floor and snap up needed fish that swim close; the player frees them with a few taps
  { const taken = [];
    for (let n = 0; n < cfg.clams; n++) {
      let p = null; for (let tr = 0; tr < 80 && !p; tr++) { const strict = tr < 50, a = rand(0, 6.28), r = rand(.15, 1.5) * RK * shK(Math.cos(a), Math.sin(a), FLOOR_Y); const q = new THREE.Vector3(Math.cos(a) * r, FLOOR_Y + CLAM_Y, Math.sin(a) * r);
        if (taken.every(t => t.distanceTo(q) > 1.1) && HOUSES.every(h => Math.hypot(h.c.x - q.x, h.c.z - q.z) > 1.0) && clamSpotFree(q) && (!strict || clamScreenFree(q))) p = q; }
      if (!p) p = new THREE.Vector3(rand(-1, 1), FLOOR_Y + CLAM_Y, rand(-1, 1)); taken.push(p); spawnThing({ kind: 'clam' }, p, G.things.length);
    } }
  $('lvl').textContent = L; $('goalMax').textContent = cfg.goal; updateGoal();
  renderBackup(); buildTargetsDom();
  for (let i = 0; i < NT; i++) assignTarget(i, true);
  $('backup').style.visibility = cfg.backup ? '' : 'hidden'; const unlockAt = k => { const i = LV.findIndex(r => r[k] === true || (r && r[k])); return i >= 0 ? i + 1 : 0; };   // the level where a booster first appears (from the sheet)
  for (const [id, k, on] of [['bHint', 'hint', cfg.hint], ['bTank', 'tank', cfg.tank], ['bClear', 'clear', cfg.clear]]) { const el = $(id); el.dataset.locked = on || L >= 2 ? '' : '1'; if (on || L < 2) delete el.dataset.lockLv; else el.dataset.lockLv = String(unlockAt(k)); }   // from level 2 all three slots show; a booster that is not unlocked yet is grey with a padlock and the level that opens it   // early levels: no Backup strip and no boosters yet
  const intro = [[cfg.backup, 'iBackup', 'backup'], [cfg.hint, 'iHint', 'hint'], [cfg.tank, 'iTank', 'tank'], [cfg.clear, 'iClear', 'clear'], [cfg.squid, 'iSquid', 'squid'], [cfg.swarm, 'iSwarm', 'swarm'], [cfg.clams, 'iClam', 'clam'], [cfg.tube, 'iPump', 'pump']].find(x => x[0] && !save[x[1]]);
  introOn = false; paused = false; hideOverlays(); kick(-4); Snd.bgmStart(); Snd.play('levelstart'); lvPending = 0; if (!window.__noIntro && !(G && G.cfg && G.cfg.noCamIntro)) camIntro = { t0: performance.now(), dur: 2300, turns: 1.2, az1: .65, el0: .62, far: 1.85 }   /* never farther or higher than the player may zoom: beyond that the edge of the hall (its rim and the sky above it) shows as a white flash */; window.__noIntro = false; if (L >= 2) { window.__lvShown = false; window.__lvPop = 0; window.__lvIntro = { t0: performance.now(), n: L }; } else { window.__lvIntro = undefined; window.__lvShown = true; }   // (level 1 has none: the camera tutorial is enough) Snd.play('start');   // (painted by the Phaser UI: paintLevelIntro in src/ui/panels.ts)
  save.last = L; persist(); refreshHintBtn();
  if (intro) { save[intro[1]] = 1; persist(); const gi = gid; const t0i = performance.now(), tryShow = () => { if (gi !== gid || !G || G.status !== 'play') return; if (performance.now() - t0i > 20000) return; if (!paused && !introOn && uiReady()) showIntro(intro[2]); else setTimeout(tryShow, 120); }; setTimeout(tryShow, 600); }   // the first-time pop-up comes last: it waits until the LEVEL words, the bubble, the whole UI and the lids of the target tanks are done

}

function spawnThing(s, pos, idx) {
  let built, o;
  if (s.kind === 'fish') { built = buildFish(SPECIES[s.type]); o = { kind: 'fish', type: s.type, id: SPECIES[s.type].id }; }
  else if (s.kind === 'urchin') { built = buildUrchin(); o = { kind: 'obstacle', id: 'urchin' }; }
  else if (s.kind === 'squid') { built = buildSquid(); o = { kind: 'obstacle', id: 'squid' }; }
  else if (s.kind === 'clam') { built = buildClam(); o = { kind: 'clam', id: 'clam', state: 'open', cool: 0, shake: 0 }; }
  else { built = buildJelly(); o = { kind: 'obstacle', id: 'jelly', hue: built.hue }; }
  if (s.kind === 'fish') o.group = built.group; else { o.group = new THREE.Group(); built.group.scale.setScalar(s.kind === 'clam' ? 1 : .78); o.group.add(built.group); }
  o.parts = built; o.rad = s.kind === 'fish' ? built.hx * .95 + .07 : (s.kind === 'urchin' ? .4 : s.kind === 'clam' ? .42 : s.kind === 'squid' ? .5 : .34); o.pos = pos.clone(); o.dir = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
  o.speed = s.kind === 'fish' ? rand(.62, .95) : s.kind === 'clam' ? 0 : s.kind === 'squid' ? rand(.14, .24) : rand(.05, .14); o.wp = pos.clone(); o.wpT = 0; o.phase = rand(0, 6.28); o.wag = rand(6, 9); o.turn = rand(1, 2.2);
  if (s.kind === 'fish') { o.sz = built.big ? 1 : G.cfg.sizeK; o.rf = Math.min(RF, R - .3 - built.hx * o.sz * .8); o.ym = Math.max(.42, (built.hy || 0) + .26); o.big = !!built.big; if (o.big) { o.speed *= .7; o.turn *= .6; } } else { o.rf = RF; o.ym = .42; }
  if (s.kind === 'fish' && G && G.cfg) o.speed *= G.cfg.speedK;
  if (s.kind === 'fish' && built.model3d) { o.speed *= 1.45; o.noHang = true; o.turn *= .8; }   // 3D fish cross the tank in long, flowing swims and never hang still
  o.weaveA = rand(.25, .55); o.weaveF = rand(.9, 1.7); o.spawnAt = Math.min(idx * .006, 1.3); o.alive = true; o.scale = 0; o.hv = 0; o.hvT = 0; o.boost = 0;
  const hit = new THREE.Mesh(new THREE.SphereGeometry(s.kind === 'fish' ? Math.max(.27, built.hx * 1.05) : s.kind === 'clam' ? .5 : .46, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); hit.userData.thing = o; o.group.add(hit); o.hit = hit;
  if (!o.sz) o.sz = s.kind === 'squid' ? (G && G.cfg ? G.cfg.sizeK : 1.4) * OCT_TANK_K : 1;   /* the octopus is a big thing in the tank */
  if (s.bounty === 'tiny') o.sz = .5; else if (s.bounty === 'fast') { o.speed *= 1.8; o.turn *= 1.7; o.noHang = true; o.wag *= 1.4; o.fastB = true; o.fbT = rand(2, 4); o.fk = 1; }
  o.group.position.copy(o.pos); o.group.scale.setScalar(.0001); fishRoot.add(o.group); G.things.push(o); pickRegister(o);
}

/* ---- nothing passes through anything: decor solids (rocks, wreck, chest, barrels, arches...) and the fish pipe push swimmers out ---- */
function themeBoxes(i) {
  const g = themeG[i]; if (!g) return []; if (g.userData.cols) return g.userData.cols;
  const s0 = tank.scale.clone(); tank.scale.set(1, 1, 1); tank.updateMatrixWorld(true);
  const out = [], bx = new THREE.Box3(), sz = new THREE.Vector3(), def = THREE.Material.prototype.onBeforeCompile;
  for (const c of g.children) {
    if (!c.visible) continue;
    let solid = false; c.traverse(m => { if (!m.isMesh) return; const gt = m.geometry.type; if (m.material && m.material.onBeforeCompile === def && gt !== 'PlaneGeometry' && gt !== 'CircleGeometry') solid = true; });   // kelp, anemones and fans are soft: fish may brush through those
    bx.setFromObject(c); bx.getSize(sz);
    if (!solid && !(sz.x >= .4 && sz.z >= .4 && sz.y >= .3)) continue;   /* thin kelp is left soft, but a coral or sponge you can see is solid: fish used to swim through those */ if (Math.max(sz.x, sz.y, sz.z) < .3 || sz.y < .15) continue;
    const b = bx.clone(); if ((g.userData.houses || []).some(h => h.door && b.clone().expandByScalar(.3).containsPoint(h.c))) continue;   // houses the fish are meant to swim into
    out.push(b);
  }
  tank.scale.copy(s0); tank.updateMatrixWorld(true); g.userData.cols = out; return out;
}
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pc = new THREE.Vector3(), _pd = new THREE.Vector3();
function bodyR(o) { return Math.max(.2, Math.min(.95, ((o.kind === 'fish' && o.parts && o.parts.hx ? o.parts.hx : (o.rad || .4)) * (o.sz || 1)) * .95)); }   // half length of the swimmer: its nose or tail must not reach into a solid
const PIPE_R = .8;   // pipe lip + the lid swung open above the mouth
function pipeAxis() { tubeW(_pa.set(3.45, 1.8, 0)); tubeW(_pb.set(2.7, 1.8, 0)); }
function colPush(o, P, r) {   // returns true when the point was inside a solid and got pushed out
  let hit = false, boxes = themeBoxes(curTheme);
  if (G && !(o && o.clamPeek)) { if (!G.clams) G.clams = G.things.filter(t => t.kind === 'clam').map(t => ({ min: new THREE.Vector3(t.pos.x - .55, FLOOR_Y, t.pos.z - .55), max: new THREE.Vector3(t.pos.x + .55, t.pos.y + .45, t.pos.z + .55) })); if (G.clams.length) { if (G.clamAll?.th !== curTheme) G.clamAll = { th: curTheme, a: boxes.concat(G.clams) }; boxes = G.clamAll.a; } }   /* the clam is solid: fish swim round and over it, not through it */
  for (const b of boxes) {
    if (P.x <= b.min.x - r || P.x >= b.max.x + r || P.y <= b.min.y - r || P.y >= b.max.y + r || P.z <= b.min.z - r || P.z >= b.max.z + r) continue;
    const c = [[P.x - (b.min.x - r), -1, 0, 0], [(b.max.x + r) - P.x, 1, 0, 0], [(b.max.y + r) - P.y, 0, 1, 0], [P.z - (b.min.z - r), 0, 0, -1], [(b.max.z + r) - P.z, 0, 0, 1]];
    if (b.min.y > FLOOR_Y + .1) c.push([P.y - (b.min.y - r), 0, -1, 0]);
    let m = c[0]; for (const q of c) if (q[0] < m[0]) m = q;
    P.x += m[1] * m[0]; P.y += m[2] * m[0]; P.z += m[3] * m[0]; hit = true;
    if (o && o.dir) { const dn = o.dir.x * m[1] + o.dir.y * m[2] + o.dir.z * m[3]; if (dn < 0) { o.dir.x -= m[1] * dn * 1.3; o.dir.y -= m[2] * dn * 1.3; o.dir.z -= m[3] * dn * 1.3; o.dir.normalize(); }
      if (m[2] === -1) { const rr = Math.hypot(P.x, P.z) || 1; o.dir.x -= P.x / rr * .8; o.dir.z -= P.z / rr * .8; o.dir.y = Math.max(o.dir.y, -.3); o.dir.normalize(); } }   // pushed down by a solid above it (it wants to go up): slide sideways towards the middle with a flat body instead of hanging nose-down under it
  }
  if (tube.g && tube.g.visible) {
    pipeAxis(); _pd.subVectors(_pb, _pa); const L2 = _pd.lengthSq(), k = clamp(_pc.subVectors(P, _pa).dot(_pd) / L2, 0, 1);
    _pc.copy(_pa).addScaledVector(_pd, k); _pc.subVectors(P, _pc); const d = _pc.length(), rc = PIPE_R + r;
    if (d < rc) { if (d < 1e-4) _pc.set(0, 1, 0); else _pc.multiplyScalar(1 / d); P.addScaledVector(_pc, rc - Math.max(d, 0)); hit = true;
      if (o && o.dir) { const dn = o.dir.dot(_pc); if (dn < 0) { o.dir.addScaledVector(_pc, -dn * 1.3); o.dir.normalize(); } } }
  }
  return hit;
}
function colBodies(o, t) {
  if (o.exitT !== undefined && t - o.exitT < .9) { const P = o.pos, keep = tube.g; tube.g = null; colPush(o, P, bodyR(o)); tube.g = keep; return; }   // just left the pipe: free of it for a moment, still respects the decor
  colPush(o, o.pos, bodyR(o));
}
function randomPoint(o) {   // never aim at a spot inside a solid
  const r = bodyR(o);
  for (let i = 0; i < 8; i++) { const q = randomPoint0(o); if (!colPush(null, _pc.copy(q), r)) return q; }
  return randomPoint0(o);
}
function randomPoint0(o) {
  if (o.kind === 'fish' && G && G.need && G.need.has(o.type) && Math.random() < .4) {   // needed fish are drawn toward a hungry clam
    const cl = G.things.filter(c => c.kind === 'clam' && c.state === 'open' && c.alive); if (cl.length) { const c = pick(cl); o.clamGo = c; return new THREE.Vector3(c.pos.x + rand(-.25, .25), FLOOR_Y + rand(.5, .85), c.pos.z + rand(-.25, .25)); } }
  if (o.kind === 'fish' && HOUSES.length && Math.random() < .3) { const h = pick(HOUSES), s = h.door ? 1 : (Math.random() < .5 ? -1 : 1); const q = h.c.clone().addScaledVector(h.axis, s * (h.door ? .15 : 1.4)); q.x += rand(-.15, .15); q.z += rand(-.15, .15); if (!h.door) q.y += rand(-.2, .15); return q; }
  if (o.kind === 'fish' && !o.big) {   // long swims: of a few candidate spots take the farthest one, so fish cross the tank instead of dithering
    let best = null, bd = -1; const zone = Math.random(), z0 = zone < .3 ? 0 : zone < .6 ? .72 : 0, z1 = zone < .3 ? .5 : zone < .6 ? 1 : 1;   /* this leg: the middle of the tank (30%), the rim (30%) or anywhere (40%) */
    for (let k = 0, kn = o.parts && o.parts.model3d ? 9 : 4; k < kn; k++) { const a = rand(0, 6.28), r = (zone < .6 ? rand(z0, z1) : Math.sqrt(Math.random())) * (o.rf || RF) * shK(Math.cos(a), Math.sin(a)), v = new THREE.Vector3(Math.cos(a) * r, rand(FLOOR_Y + .6, WATER_Y - .55), Math.sin(a) * r), d = v.distanceTo(o.pos); if (d > bd) { bd = d; best = v; } }
    const q = Math.random(); if (q < .2) best.y = rand(FLOOR_Y + .5, FLOOR_Y + 1.4); else if (q < .4) best.y = rand(WATER_Y - 1.2, WATER_Y - .5); return best;
  }
  const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * (o.rf || RF) * shK(Math.cos(a), Math.sin(a));
  const lo = o.id === 'urchin' ? FLOOR_Y + .5 : FLOOR_Y + .6, hi = o.id === 'urchin' ? 2.1 : WATER_Y - .55;
  let y = rand(lo, hi); if (o.kind === 'fish') { const q = Math.random(); if (q < .2) y = rand(FLOOR_Y + .5, FLOOR_Y + 1.4); else if (q < .4) y = rand(WATER_Y - 1.2, WATER_Y - .5); }   // some legs dive to the sand, some skim the surface
  if (o.big) y = clamp(y, FLOOR_Y + o.ym + .1, WATER_Y - o.ym - .1);
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}
const sepV = new THREE.Vector3(), dd = new THREE.Vector3();
const pushV = new THREE.Vector3();
function separate(o, dt) {
  sepV.set(0, 0, 0); pushV.set(0, 0, 0);
  for (const q of G.things) {
    if (q === o || !q.alive || q.scale < .5) continue;
    dd.subVectors(o.pos, q.pos); const d = dd.length(), min = ((o.rad * Math.sqrt(o.sz || 1) + q.rad * Math.sqrt(q.sz || 1)) * 1.25 + .12) * (feed.on ? .6 : .9);   /* personal space of 62%: with the full distance, 40 big fish were always inside each other's space and pushed back and forth, which showed as jitter (while feeding the space was already smaller, and the jitter was gone) */
    if (d < min && d > 1e-4) { const k = (min - d) / min; sepV.addScaledVector(dd, k / d); pushV.addScaledVector(dd, (min - d) / d * .4); }
  }
  { pushV.multiplyScalar(Math.min(1, dt * 6)); const pl = pushV.length(), cap = .035; if (pl > cap) pushV.multiplyScalar(cap / pl); o.sepSm = (o.sepSm || pushV.clone().set(0, 0, 0)).lerp(pushV, Math.min(1, dt * 8)); o.pos.add(o.sepSm); }   /* the total push of one frame is capped: crowded fish used to be thrown a whole body-length at once and snapped back, which showed as jitter */
  if (sepV.lengthSq() > 0) { o.dir.addScaledVector(sepV, dt * 5); o.dir.normalize(); }
}
function tickBlink(o, built, t) {   // eyes close briefly every few seconds
  if (!built.blink) return; if (o.bkAt === undefined) o.bkAt = t + rand(.5, 4);
  if (o.bkP === undefined || o.bkP < 0) { if (t > o.bkAt) o.bkP = 0; else return; }
  o.bkP += .016 / .2; if (o.bkP >= 1) { o.bkP = -1; o.bkAt = t + rand(1.8, 5); built.blink(0); return; } built.blink(Math.sin(o.bkP * Math.PI));
}
const Y = new THREE.Euler(); const qT = new THREE.Quaternion(); const dTmp = new THREE.Vector3();
const SWAY = { tail: .8, body: .22 };   // body-sway amplitudes while swimming
/* the fall into the tank (fish and octopus): in the air it speeds up under gravity from the speed the flying picture had; at the water the water brakes it smoothly (the speed dies away exponentially, no stop), and while it slows down it swims ahead more and more, so the vertical speed turns into the swimming speed without a break */
const DIVE_G = 7, DIVE_WATER = 1.7;
/* the fall into the tank: in the air it speeds up under gravity from the speed the flying picture had; in the water it does NOT stop: it keeps its speed, which fades slowly to its swimming speed, while its path bends from straight down to forward (like a fish pulling out of a dive). How tight the bend is depends on how deep it may go (decoration under the column) */
const diveSmooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function diveSim(D, tw, tauR) {
  const ve = D.ve, cr = D.cruise || 1, tS = .9; let y = WATER_Y, h = 0, last = { s: ve, th: -Math.PI / 2 };
  for (let t = 0; t < tw; t += .01) { const dt = Math.min(.01, tw - t), s = cr + (ve - cr) * Math.exp(-t / tS), th = -Math.PI / 2 * (1 - diveSmooth(t / tauR)); y += s * Math.sin(th) * dt; h += (s * Math.cos(th) + (D.vh0 || 0) * Math.exp(-(t / .8) * (t / .8))) * dt; last = { s, th }; }
  return { y, h, s: last.s, th: last.th };
}
function diveMove(D, hOff, lim) {   /* it moves ahead along its heading; at the wall it slides along the glass (the heading turns to the tangent) instead of being pinned to it */
  if (D.px === undefined) { D.px = D.x; D.pz = D.z; D.hPrev = 0; } const dh = hOff - D.hPrev; D.hPrev = hOff; let nx = D.px + D.hx * dh, nz = D.pz + D.hz * dh; const rr = Math.hypot(nx, nz);
  if (rr > lim) { const ux = nx / rr, uz = nz / rr, tx = -uz, tz = ux, sg = Math.sign(tx * D.hx + tz * D.hz) || 1; D.hx = tx * sg; D.hz = tz * sg; nx = ux * lim; nz = uz * lim; } D.px = nx; D.pz = nz;
}
function diveState(D, t) {
  const v0 = D.v0, Ta = (-v0 + Math.sqrt(v0 * v0 + 2 * DIVE_G * Math.max(.05, D.y0 - WATER_Y))) / DIVE_G;
  if (D.ve === undefined) { D.ve = v0 + DIVE_G * Ta; const yMin = D.yMin === undefined ? FLOOR_Y + 1.2 : D.yMin; D.tauR = .22; for (const tr of [1, .8, .65, .5, .4, .3]) { if (diveSim(D, 2.4, tr).y >= yMin) { D.tauR = tr; break; } } }
  if (t < Ta) return { y: D.y0 - v0 * t - .5 * DIVE_G * t * t, vy: v0 + DIVE_G * t, hOff: (D.vh0 || 0) * t, th: -Math.PI / 2, thv: -Math.atan2(v0 + DIVE_G * t, Math.max(D.vh0 || 0, .25)), water: false, tw: 0, Ta };   /* (thv: the way the nose points = the way it is really going, so it matches the flying picture's angle) */
  const tw = t - Ta, r = diveSim(D, tw, D.tauR);
  const hv = r.s * Math.cos(r.th) + (D.vh0 || 0) * Math.exp(-(tw / .8) * (tw / .8)); return { y: r.y, vy: -r.s * Math.sin(r.th), hOff: (D.vh0 || 0) * Ta + r.h, th: r.th, thv: -Math.atan2(-r.s * Math.sin(r.th), Math.max(hv, .25)), spd: r.s, water: true, tw, Ta };
}
function updateThing(o, dt, t) {
  if (!o.alive && o.launch) { // leap out of the water
    const L = o.launch; L.t += dt; const k = Math.min(1, L.t / L.dur), e = Math.pow(k, 1.45);
    o.pos.set(L.x, L.y0 + (L.y1 - L.y0) * e, L.z); o.group.position.copy(o.pos);
    Y.set(0, L.yaw, 1.25 + k * .25, 'YZX'); qT.setFromEuler(Y); o.group.quaternion.slerp(qT, 1 - Math.exp(-dt * 22));
    if (o.kind === 'fish') { o.parts.tail.rotation.y = Math.sin(t * 38) * .8; o.parts.body.rotation.y = Math.sin(t * 38 + 1) * .15; }
    o.group.scale.setScalar(1 + .12 * Math.sin(k * Math.PI)); if (k >= .98) o.group.visible = false;
    if (!L.splashed && o.pos.y >= WATER_Y) { L.splashed = true; surfaceSplash(L.x, L.z, 1); }
    if (k >= 1) { o.launch = null; o.scale = 1; } return;
  }
  if (!o.alive) { // pop-out
    o.scale -= dt * 7; if (o.scale <= 0) { fishRoot.remove(o.group); o.gone = true; return; } o.group.scale.setScalar(o.scale); return;
  }
  if (o.dive && o.id === 'squid') {   /* the octopus falls upright down the middle of the opening (see diveState), arms trailing up, then they spread as the water brakes it, and it swims on */
    const D = o.dive, b = o.parts, S = o.oc || (o.oc = { mode: 'swim', t: 0, next: rand(6, 10), wt: rand(0, 6), ph: 0, fk: 0, wk: 0, a: 0, wy: 2, wa: 0, wyT: 2, pk: 0, walk: 0, gait: 0, land: 0, wind: 0, ink: 0, lean: 0, fwp: new THREE.Vector3(), mv: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(), pp: o.pos.clone(), vyaw: 0, yawP: 0 });
    D.t += dt; D.cruise = Math.max(.8, (o.speed || .3) * 3); const st = diveState(D, D.t); diveMove(D, st.hOff, RF - 1.1);
    o.pos.set(D.px, st.y, D.pz); o.group.position.copy(o.pos); S.wt += dt * 3; S.yawP = D.yaw;
    Y.set(0, Math.atan2(cam.position.x - D.px, cam.position.z - D.pz), 0, 'YXZ'); qT.setFromEuler(Y); if (D.first) { D.first = false; o.group.quaternion.copy(qT); } else o.group.quaternion.slerp(qT, 1 - Math.exp(-dt * 8));   /* it faces the player while it falls (the flying picture did) */
    const sw = st.water ? smooth01(st.tw / .5) * (1 - smooth01((st.tw - .5) / .8)) : 0, air = st.water ? 0 : 1;
    octoAnim(b, dt, { wt: S.wt, flare: sw, thrust: air * .4 + (st.water ? .3 * Math.exp(-st.tw * 2) + .8 * smooth01((st.tw - .75) / .45) : 0), contract: .25 * air, glide: st.water ? smooth01((st.tw - .6) / .8) : 0, hp: -.25 * air }); octoBlink(b, dt);
    b.inner.scale.set(1, 1 + .06 * air, 1); o.group.scale.setScalar(o.sz);
    if (!D.splashed && o.pos.y <= WATER_Y) { D.splashed = true; surfaceSplash(D.px, D.pz, 1.4, true); addRipple(D.px, D.pz, .12); burstFx.emit(new THREE.Vector3(D.px, WATER_Y - .05, D.pz), 0xffffff, 14, 1.2); Snd.play('totank'); }
    if (st.water && st.tw >= DIVE_WATER) { o.dive = null; S.mode = 'swim'; S.ph = .34; S.sp = Math.max(st.spd || 0, .6); S.cool = rand(14, 26); o.boost = 0;   /* the first swimming stroke starts right here: the arms were already pulling, so it keeps going without a pause */ o.dir.set(D.hx, .05, D.hz).normalize(); o.wp = new THREE.Vector3(o.pos.x + D.hx * 1.6, clamp(o.pos.y, FLOOR_Y + 1.2, WATER_Y - 1), o.pos.z + D.hz * 1.6); clampXZ(o.wp, RF - .6); o.wpT = rand(3, 5); }
    return;
  }
  if (o.dive) {   // dropping into the tank through its open top (see diveState)
    const D = o.dive; D.t += dt; D.cruise = (o.speed || 1) * 1.25; const st = diveState(D, D.t), sz = o.sz || 1; diveMove(D, st.hOff, RF - .3);
    o.pos.set(D.px, st.y, D.pz); o.group.position.copy(o.pos);
    const pitch = o.kind === 'fish' ? clamp(st.thv * .62, -.8, .5) : 0;   /* only fish dive nose-first; a jellyfish or an urchin goes down upright */   // nose-down while it is fast, levelling off as the water slows it
    Y.set(0, D.yaw, pitch, 'YZX'); qT.setFromEuler(Y); if (D.first) { D.first = false; o.group.quaternion.copy(qT); } else o.group.quaternion.slerp(qT, 1 - Math.exp(-dt * 14));
    if (o.kind === 'fish') { o.parts.tail.rotation.y = Math.sin(t * 38) * .8 * (st.water ? Math.exp(-st.tw * .8) * .6 + .4 : 1); o.parts.body.rotation.y = Math.sin(t * 38 + 1) * .15; }
    o.group.scale.setScalar(sz);
    if (!D.splashed && o.pos.y <= WATER_Y) { D.splashed = true; surfaceSplash(D.px, D.pz, 1, true); addRipple(D.px, D.pz, .09); burstFx.emit(new THREE.Vector3(D.px, WATER_Y - .05, D.pz), 0xffffff, 10, 1.1); Snd.play('totank'); }
    if (st.water && st.tw >= DIVE_WATER) {   // it has levelled off and is going ahead at about its swimming speed: carry on the way it was heading
      o.dive = null; o.boost = clamp((st.spd / Math.max(.4, o.speed || 1) - 1) / 1.25, .2, 1.4); o.dir.set(D.hx, -Math.sin(st.th) * -.2, D.hz).normalize();   /* it keeps the momentum: a burst that fades away at the usual rate */
      o.wp = new THREE.Vector3(o.pos.x + D.hx * 1.6, clamp(o.pos.y, FLOOR_Y + .8, WATER_Y - .7), o.pos.z + D.hz * 1.6); clampXZ(o.wp, RF - .2); o.wpT = rand(3, 5);
    }
    return;
  }
  if (o.vtx) { vortexStep(o, dt, t); return; }   // (win celebration)
  if (o.locked) return;   // still inside its clam
  if (o.tubeP) { tubeFishStep(o, dt, t); return; }
  const age = U.uTime.value - G.t0 - o.spawnAt;
  if (age < 0) return;
  o.hv += ((o.hvT || 0) - o.hv) * (1 - Math.exp(-dt * 14));
  if (o.kind === 'fish') o.parts.body.material.emissiveIntensity = .46 + o.hv * .7 + (o.hinted ? .2 : 0);
  if (o.kind === 'fish' && o.parts.glows) {   // gold glow while hovered, so it is clear which fish a tap will hit; wraps the whole body, seen from any side
    const on = o.hv > .03; for (const m of o.parts.glows) { m.visible = on; if (on) m.material.opacity = Math.min(1, o.hv * 1.7) * m.material.userData.k; }
  } else if (o.kind === 'fish' && o.parts.setGlow && !(o.outline && o.hinted)) o.parts.setGlow(o.hv > .03 ? Math.min(1, o.hv * 1.7) : 0);
  if (o.scale < 1) { const k = clamp(age / .45, 0, 1); o.scale = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 11) : 1; o.group.scale.setScalar(Math.max(o.scale, .0001) * o.sz); } else { o.group.scale.setScalar(o.sz * (1 + o.hv * .16)); if (o.grow !== undefined) { o.grow += dt / .55; const k = Math.min(1, o.grow), gb = o.gb || .36, f = gb + (1 - gb) * (1 - Math.pow(1 - k, 3) * Math.cos(k * 11)); o.group.scale.multiplyScalar(f); if (k >= 1) o.grow = undefined; } }
  if (o.winK !== undefined) { o.group.scale.multiplyScalar(Math.max(.0001, o.winK)); o.pos.y -= (1 - o.winK) * dt * .8; if (o.winK <= .01) o.group.visible = false; }   // the win swirl: the other fish of the tank sink and shrink away so the orbiting fish are seen
  if (o.kind === 'clam') { clamUpdate(o, dt, t); o.group.position.copy(o.pos); o.parts.group.scale.set(1, 1, 1); return; }
  if (o.kind === 'obstacle') {
    if (o.id === 'squid') { squidUpdate(o, dt, t, age); const S = o.oc; if (S.wk < .5) colBodies(o, t); o.group.position.copy(o.pos); if (S.fk < .3 && S.wk < .3) o.group.position.y += Math.sin(t * .9 + o.phase) * .06; return; }
    if (o.pos.distanceTo(o.wp) < .4 || o.wpT <= 0) { o.wp = randomPoint(o); o.wpT = rand(6, 12); } o.wpT -= dt;
    dTmp.subVectors(o.wp, o.pos).normalize(); o.dir.lerp(dTmp, 1 - Math.exp(-dt * (o.id === 'squid' ? 1.6 : .8))).normalize(); separate(o, dt);
    if (o.id === 'squid') squidUpdate(o, dt, t, age); else o.pos.addScaledVector(o.dir, o.speed * dt);
    if (o.id === 'squid') { o.pos.y = clamp(o.pos.y, FLOOR_Y + 1, WATER_Y - .7); }
    else if (o.id === 'jelly') { const p = (Math.sin(t * 2.2 + o.phase) + 1) * .5; o.parts.bell.scale.set(1 + p * .12, 1 - p * .22, 1 + p * .12); o.pos.y += Math.pow(p, 2) * dt * .12 * 3; o.parts.tents.forEach((m, i) => { m.rotation.x = Math.sin(t * 2.2 + i + o.phase) * .18; m.rotation.z = Math.cos(t * 1.8 + i * 1.3) * .18; }); o.pos.y = clamp(o.pos.y, FLOOR_Y + 1, WATER_Y - .6); }
    else { o.group.rotation.y += dt * .3; o.group.rotation.x += dt * .15; }
    { const rr = Math.hypot(o.pos.x, o.pos.z), lim = (RF - .1) * shK(o.pos.x, o.pos.z, o.pos.y); if (rr > lim) { o.pos.x *= lim / rr; o.pos.z *= lim / rr; o.dir.x -= o.pos.x / lim * .5; o.dir.z -= o.pos.z / lim * .5; o.dir.normalize(); } o.pos.y = clamp(o.pos.y, FLOOR_Y + .3, WATER_Y - .6); }
    colBodies(o, t); o.group.position.copy(o.pos); o.group.position.y += Math.sin(t * .9 + o.phase) * .06; return;
  }
  o.boost = Math.max(0, o.boost - dt * 1.05); tickBlink(o, o.parts, t);
  if (o.clamGo) {   // swimming toward a hungry clam: keep heading for it until it snaps shut on us (or it is busy)
    const c = o.clamGo; if (c.state !== 'open' || !c.alive || !G.need.has(o.type)) o.clamGo = null; else { o.wp.set(c.pos.x, FLOOR_Y + .62, c.pos.z); o.wpT = 3; }
  }
  const sch = o.school && o.boost < .3 && !o.hinted && !o.clamGo && !o.evOn;
  if (sch) {   // schooling decoys: the whole group follows one shared waypoint, each keeping its own spot around it
    const S = o.school; if (S.upd !== frameN) { S.upd = frameN; if (!S.lead.alive) S.lead = S.m.find(x => x.alive && !x.locked) || S.lead; S.wpT -= dt; if (S.wpT <= 0 || S.lead.pos.distanceTo(S.wp) < .7) { S.wp.copy(randomPoint(S.lead)); S.wpT = rand(5, 10); } }
    o.wp.copy(S.wp).add(o.off); o.wp.y = clamp(o.wp.y, FLOOR_Y + .6, WATER_Y - .5); o.wpT = 5;
  }
  if (o.plg > 0) { o.plg -= dt; if (o.plg <= 0) { o.wp = new THREE.Vector3(o.pos.x + rand(-1.5, 1.5), clamp(o.pos.y + rand(1.4, 2.2), FLOOR_Y + 1, WATER_Y - 1), o.pos.z + rand(-1.5, 1.5)); clampXZ(o.wp, RF - .3); o.wpT = rand(3, 5); } }   /* after the plunge: lift the nose and head up again */
  if (!o.clamGo && !sch && !o.evOn && (o.pos.distanceTo(o.wp) < .5 || o.wpT <= 0)) { o.wp = randomPoint(o); o.wpT = rand(4, 9); } o.wpT -= dt;
  let near = false;
  if (feed.on) {   // feeding time: the whole school crowds around the falling food
    if (o.fwT === undefined || o.fwT <= 0) { o.fw = (o.fw || new THREE.Vector3()).set(rand(-.7, .7), rand(-.3, .08), rand(-.7, .7)); o.fwT = rand(.6, 1.4); } o.fwT -= dt;
    o.wp.copy(feed.c).add(o.fw); o.wp.y = clamp(o.wp.y, FLOOR_Y + .6, WATER_Y - .45); o.wpT = 2; near = o.pos.distanceTo(feed.c) < 1.2;
    if (!near) o.boost = Math.max(o.boost, .9);   // dash up to the food
  }
  dTmp.subVectors(o.wp, o.pos).normalize(); dTmp.y *= .8; dTmp.normalize();
  if (!feed.on && o.boost < .3) {   // idle swimming weaves in gentle S-curves instead of ruler-straight lines
    const w = Math.sin(t * o.weaveF + o.phase) * o.weaveA, lx = -dTmp.z, lz = dTmp.x; dTmp.x += lx * w; dTmp.z += lz * w; dTmp.y += Math.sin(t * o.weaveF * .7 + o.phase * 1.3) * o.weaveA * .35; dTmp.normalize();
  }
  if (o.dsp) {   // dash-spin: crouch, then shoot off weaving left-right and up-down while rolling round the body, with rings radiating from the fish
    const D = o.dsp, u = D.t / D.dur; D.t += dt;
    if (D.t >= .35 && !D.go) { D.go = true; o.spinA = 0; o.spinT = D.sg * 6.2832 * (Math.random() < .4 ? 2 : 1); ringFx.emit(o.pos, .55 * o.sz, .3, o.dir); }
    if (D.go) {
      o.boost = Math.max(o.boost, 2.1 * (1 - .35 * u)); const a = D.sg * 1.9 * Math.sin(D.t * 4.4 + D.ph) * dt, c = Math.cos(a), s = Math.sin(a), x = o.dir.x * c - o.dir.z * s; o.dir.z = o.dir.x * s + o.dir.z * c; o.dir.x = x;
      o.dir.y += (Math.sin(D.t * 3.4 + D.ph) * .55 - o.dir.y) * Math.min(1, dt * 3.5); o.dir.normalize();
      D.rt -= dt; if (D.rt <= 0) { D.rt = .45; ringFx.emit(o.pos, .4 * o.sz, .18, o.dir); }
    }
    if (D.t > D.dur) o.dsp = null;
  } else if (o.mood === 3 && o.parts.model3d) {   // circling: a smooth loop with a gentle climb or dive, instead of heading for the waypoint
    const a = o.circ * (.55 + .15 * Math.sin(t * .8 + o.phase)) * dt, c = Math.cos(a), s = Math.sin(a), x = o.dir.x * c - o.dir.z * s; o.dir.z = o.dir.x * s + o.dir.z * c; o.dir.x = x; o.dir.y += (Math.sin(t * .9 + o.phase) * .22 - o.dir.y) * Math.min(1, dt * 1.5); o.dir.normalize();
  } else o.dir.lerp(dTmp, 1 - Math.exp(-dt * o.turn * (1 + o.boost * 5))).normalize();
  if (o.evPin) o.dir.copy(o.evPin.face);
  const rr = Math.hypot(o.pos.x, o.pos.z); if (rr > o.rf * shK(o.pos.x, o.pos.z, o.pos.y)) { o.dir.x -= o.pos.x / rr * dt * 3; o.dir.z -= o.pos.z / rr * dt * 3; o.dir.normalize(); }
  if (o.pos.y > WATER_Y - o.ym + .02) o.dir.y -= dt * 2; if (o.pos.y < FLOOR_Y + o.ym + .03) o.dir.y += dt * 2; o.dir.normalize();
  { const hz = Math.hypot(o.dir.x, o.dir.z), my = o.dsp || o.evPin ? .9 : .5; if (Math.abs(o.dir.y) > my || hz < .2) { if (hz < 1e-3) { const q = o.group.quaternion, fx = 1 - 2 * (q.y * q.y + q.z * q.z), fz = 2 * (q.x * q.z - q.w * q.y); o.dir.x = fx; o.dir.z = fz; } const hh = Math.hypot(o.dir.x, o.dir.z) || 1, yy = clamp(o.dir.y, -my, my), c = Math.sqrt(1 - yy * yy); o.dir.set(o.dir.x / hh * c, yy, o.dir.z / hh * c); } }   // never nearly vertical: a fish pointing straight down lost its horizontal heading and stuck to the floor
  // moods: cruise most of the time, now and then hang almost still, or dart ahead
  if (o.moodT === undefined) { o.moodT = rand(2, 9); o.mood = 0; o.moodK = 1; }
  if (!feed.on && o.boost < .3 && !o.clamGo && !o.evOn) { o.moodT -= dt; if (o.moodT <= 0) { if (o.mood) { o.mood = 0; o.moodT = rand(3, 8); } else { const r = Math.random(); if (r < .12 && !o.noHang) { o.mood = 1; o.moodT = rand(.6, 1.4); } else if (o.parts.model3d && r >= .12 && r < .16) { o.mood = 3; o.circ = Math.random() < .5 ? -1 : 1; o.moodT = rand(2.4, 4.4); }
        else if (o.parts.model3d && r >= .16 && r < .18 && !o.dsp && !o.spinT && !G.things.some(x => x.dsp)) { o.dsp = { t: 0, dur: rand(2.1, 2.9), sg: Math.random() < .5 ? -1 : 1, ph: rand(0, 6.28), rt: 0, go: false }; o.moodT = rand(3, 6); } else if (r >= .18 && r < .3 && G.cfg.dash) { o.mood = 2; o.moodT = rand(.6, 1.1); } else o.moodT = rand(2.5, 6); } } }
  else o.mood = 0;
  o.moodK += ((o.dsp && o.dsp.t < .35 ? .3 : o.mood === 1 ? .55 : o.mood === 2 ? 1.45 : o.mood === 3 ? .85 : 1) - o.moodK) * (1 - Math.exp(-dt * 4));
  if (o.fastB) { o.fbT -= dt; if (o.fbT < -1.2) o.fbT = rand(3, 5); o.fk += ((o.fbT < 0 ? .55 : 1) - o.fk) * (1 - Math.exp(-dt * 3)); } /* the fast bounty fish eases off for about 1.2 s every few seconds: a window to tap it */
  if (!o.evTight) separate(o, dt);
  // water drag from rotating the tank
  const drag = orbit.azV * dt * .035; o.pos.x += -o.pos.z * drag; o.pos.z += o.pos.x * drag;
  if (o.evPin) { dTmp.subVectors(o.evPin.pos, o.pos).multiplyScalar(1 - Math.exp(-dt * (o.evPin.rate || 9))); const dl = dTmp.length(), cap = dt * 6; if (dl > cap) dTmp.multiplyScalar(cap / dl); o.pos.add(dTmp); }   /* an event draws a fish in at no more than 6 units a second: it used to cover a few units in a frame when the event started, which looked like a teleport */ else o.pos.addScaledVector(o.dir, o.speed * dt * (1 + .2 * Math.sin(t * 2 + o.phase)) * (1 + o.boost * 1.25 * (o.fastB ? .5 : 1)) * (near ? .6 : 1) * o.moodK * (o.fk || 1));
  { const ax = o.pos.x + o.dir.x * .8, az = o.pos.z + o.dir.z * .8, ar = Math.hypot(ax, az), al = (o.rf - .1) * shK(ax, az, o.pos.y); if (ar > al) { const rr3 = Math.hypot(o.pos.x, o.pos.z) || 1, k3 = Math.min(1, (ar - al) / .5); o.dir.x -= o.pos.x / rr3 * dt * 7 * k3; o.dir.z -= o.pos.z / rr3 * dt * 7 * k3; o.dir.normalize(); } }   // looks ahead: the wall of a heart or a star comes in near the notches, so the fish turns before it gets there instead of being snapped back
  { const rr2 = Math.hypot(o.pos.x, o.pos.z), lim2 = (o.rf + .05) * shK(o.pos.x, o.pos.z, o.pos.y); if (rr2 > lim2 * .93 && rr2 < lim2) { const q2 = (rr2 / lim2 - .93) / .07; o.dir.x -= o.pos.x / rr2 * dt * 5 * q2; o.dir.z -= o.pos.z / rr2 * dt * 5 * q2; o.dir.normalize(); } if (rr2 > lim2) { const ex = rr2 - lim2, cr = Math.min(ex, Math.max(.012, ex * dt * 7)), kk = (rr2 - cr) / rr2; o.pos.x *= kk; o.pos.z *= kk; o.dir.x -= o.pos.x / rr2 * dt * 4; o.dir.z -= o.pos.z / rr2 * dt * 4; o.dir.normalize(); } o.pos.y = clamp(o.pos.y, FLOOR_Y + o.ym, WATER_Y - o.ym); }   /* pulled back gradually: the limit changes with height and shape (a bowl narrows towards the top), and snapping a fish to it at once was the teleport */   // fish are ~1 unit long: keep their whole body inside the glass and under the surface
  colBodies(o, t);
  if (o.kind === 'fish' && !o.evPin && !o.dsp) {   // wedged between a decor piece and the glass: it pushes against both and goes nowhere. After a second of that, turn it to the middle and up
    if (!o.stkP) o.stkP = o.pos.clone(); o.stkT = (o.stkT || 0) + dt;
    if (o.stkT > 1) { if (o.pos.distanceTo(o.stkP) < .12) { const rr = Math.hypot(o.pos.x, o.pos.z) || 1; o.dir.set(-o.pos.x / rr, .3, -o.pos.z / rr).normalize(); o.wp = new THREE.Vector3(-o.pos.x * .3, clamp(o.pos.y + 1.6, FLOOR_Y + 1, WATER_Y - 1), -o.pos.z * .3); o.wpT = 4; o.boost = Math.max(o.boost, 1.2); o.pos.x *= .985; o.pos.z *= .985; } o.stkP.copy(o.pos); o.stkT = 0; }
  }
  o.group.position.copy(o.pos); if (o.kind === 'fish') wakeTrail(o, dt);
  const yaw = Math.atan2(-o.dir.z, o.dir.x), pitch = Math.asin(clamp(o.dir.y, -1, 1)) * (o.big ? .3 : .8);
  let roll = 0, rate = 7;
  if (o.parts.model3d && dt > 0) {   // a 3D fish leans into its turns and turns with some inertia
    const dy = ((yaw - (o.yawP === undefined ? yaw : o.yawP) + 9.4248) % 6.2832) - 3.1416; o.yawP = yaw; o.turnV = (o.turnV || 0) + (dy / dt - (o.turnV || 0)) * (1 - Math.exp(-dt * 4));
    roll = -clamp(o.turnV * .2, -.5, .5); rate = 4.5;
    if (o.spinT) {   // a barrel roll while looping: the body corkscrews round its own axis, then settles upright
      const st = Math.sign(o.spinT) * Math.min(Math.abs(o.spinT - o.spinA), 5.2 * dt * (.4 + Math.sin(Math.min(1, Math.abs(o.spinA / o.spinT)) * Math.PI) * .8)); o.spinA += st; roll += o.spinA;
      if (Math.abs(o.spinT - o.spinA) < .02) { o.spinT = 0; o.spinA = 0; }
    }
  }
  Y.set(roll, yaw, pitch, 'YZX'); qT.setFromEuler(Y); o.group.quaternion.slerp(qT, 1 - Math.exp(-dt * rate));
  // tail beat is an accumulated phase, so the rate follows the current scatter boost immediately (no phase jumps as the boost decays)
  const bs = Math.min(o.boost, 2.5); o.wph = (o.wph === undefined ? o.phase : o.wph) + dt * o.wag * (.7 + o.speed) * (1 + bs * .9) * (.45 + .55 * Math.min(o.moodK, 1.6)) * (o.evPin && o.evPin.rate === 2.2 ? .3 : 1);
  if (o.parts.update) o.parts.update(dt * (.5 + o.speed * .75 + Math.min(o.boost, 2) * .45), o);   // a 3D model plays its own swim clip, faster when it hurries
  o.parts.tail.rotation.y = Math.sin(o.wph) * (SWAY.tail + Math.min(bs, 2) * .1); o.parts.body.rotation.y = Math.sin(o.wph + 1.2) * (SWAY.body + bs * .02);   // the whole body rocks side to side with each tail beat
  if (o.wiggle > 0) { o.wiggle = Math.max(0, o.wiggle - dt * 1.5); o.parts.tail.rotation.y += Math.sin(t * 34) * .9 * o.wiggle; o.parts.body.rotation.y += Math.sin(t * 27 + 1) * .2 * o.wiggle; o.parts.body.rotation.z = Math.sin(t * 21) * .08 * o.wiggle; }
}

/* ============================== events: squid ink, clams, feeding ============================== */
let _ink = null; function inkTex() {
  if (_ink) return _ink; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { const x = 64 + rand(-24, 24), y = 64 + rand(-24, 24), r = rand(28, 44), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); }
  _ink = new THREE.CanvasTexture(c); return _ink;
}
const inks = [];
const INK_U = { uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uMap: { value: null } };
const INK_VS = 'uniform vec3 uRight; uniform vec3 uUp; uniform float uSize; varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec3 c=(modelMatrix*vec4(0.,0.,0.,1.)).xyz; vec3 w=c+(uRight*position.x+uUp*position.y)*uSize; vW=w; gl_Position=projectionMatrix*viewMatrix*vec4(w,1.); }';
// a camera-facing soft puff that is clipped to the inside of the glass cylinder and the water volume, so the ink never spills outside the tank
const INK_FS = WALL_GLSL + 'uniform sampler2D uMap; uniform vec3 uColor; uniform float uOp; uniform float uR; uniform float uBot; uniform float uTop; varying vec2 vUv; varying vec3 vW; void main(){ float a=texture2D(uMap,vUv).a; float r=length(vW.xz); float wl=uMode>1.5 ? wallRad(vW.xz) : (uMode>.5 ? 3.25*(.62+.38*sqrt(max(0.,1.-pow(min(1.,abs(vW.y-2.825)/2.375),2.)))) : 3.25); float W=wl-.12; float f=smoothstep(W,W-.3,r)*smoothstep(uBot,uBot+.25,vW.y)*smoothstep(uTop,uTop-.25,vW.y); gl_FragColor=vec4(uColor,a*uOp*f); }';
function sprayInk(sq, jd) {   // a dark cloud that hides whatever swims behind it for a few seconds
  INK_U.uMap.value = inkTex();
  const grp = new THREE.Group(); grp.position.copy(sq.pos); fishRoot.add(grp); const puffs = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, vertexShader: INK_VS, fragmentShader: INK_FS,
      uniforms: { uRight: INK_U.uRight, uUp: INK_U.uUp, uMap: INK_U.uMap, uColor: { value: new THREE.Color(pick([0x2a1055, 0x1c0c40, 0x3a1a6a])) }, uOp: { value: 0 }, uSize: { value: .5 }, uR: { value: R - .12 }, uBot: { value: FLOOR_Y }, uTop: { value: WATER_Y }, uWr: surfU.uWr, uMode: surfU.uMode, uSurfR: surfU.uSurfR } });
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); sp.frustumCulled = false;
    const to = new THREE.Vector3(rand(-1.8, 1.8), rand(-1.62, .47), rand(-1.8, 1.8));   /* (10% less area than before) */ if (jd) { to.multiplyScalar(.8); to.addScaledVector(jd, rand(.1, .9)); } sp.position.copy(to).multiplyScalar(.2); sp.userData = { sc: rand(3.04, 4.56), d: rand(0, .3), ph: rand(0, 6.28), to }; sp.renderOrder = 6; grp.add(sp); puffs.push(sp);
  }
  inks.push({ grp, puffs, t: 0, dur: 9 }); burstFx.emit(sq.pos, 0x7a4ae0, 26, 1.4); Snd.play('squid');
}
function inkUpdate(dt) {
  if (!inks.length) return; INK_U.uRight.value.setFromMatrixColumn(cam.matrixWorld, 0); INK_U.uUp.value.setFromMatrixColumn(cam.matrixWorld, 1);
  for (let i = inks.length - 1; i >= 0; i--) {
    const k = inks[i]; k.t += dt;
    for (const p of k.puffs) { const u = clamp((k.t - p.userData.d) / .6, 0, 1), out = clamp((k.dur - k.t) / 2.2, 0, 1), uu = p.material.uniforms;
      p.position.copy(p.userData.to).multiplyScalar(.2 + .8 * (1 - Math.pow(1 - clamp(k.t / 3, 0, 1), 3)) + .55 * clamp((k.t - 1) / 7, 0, 1));
      uu.uOp.value = .94 * Math.min(u, out); uu.uSize.value = p.userData.sc * (.35 + .65 * (1 - Math.pow(1 - u, 3))) * (1 + .05 * Math.sin(k.t * 1.6 + p.userData.ph)); }
    if (k.t >= k.dur) { fishRoot.remove(k.grp); k.puffs.forEach(p => { p.material.dispose(); p.geometry.dispose(); }); inks.splice(i, 1); }
  }
}
const CLAM_COOL = 6, CLAM_R = .95;
const perOf = type => (G.perMap && G.perMap[type] != null) ? G.perMap[type] : G.cfg.per;   // fish a target tank needs: 1 to 3 (a bounty target needs just one)
function needSet() { return new Set(G.targets.filter(t => t && !t.done && t.count < perOf(t.type)).map(t => t.type)); }
function clamAvailable(c) { return c.state === 'open'; }
function clamUpdate(o, dt, t) {
  const p = o.parts, now = U.uTime.value, glowing = (o.glowUntil || 0) > now;
  if (o.state === undefined) { o.state = 'open'; o.cool = 0; o.shake = 0; }
  const cx = o.pos.x, cy = FLOOR_Y + .6, cz = o.pos.z; let alert = false;
  if (o.state === 'cool') { o.cool -= dt; if (o.cool <= 0) o.state = 'open'; }
  if (o.peek) {   /* CURIOUS: a needed fish that came near stops by the pearl and puts its nose to it for a moment (the clam wide open) before the shell snaps shut on it */
    const f = o.peek.f;
    if (!f.alive || f.locked || o.state !== 'open') { if (f.evPin) f.evPin = null; f.clamPeek = false; o.peek = null; }
    else {
      o.peek.t += dt; alert = true; const pr = _pb.set(cx, o.pos.y + .3, cz); _pc.set(f.pos.x - cx, 0, f.pos.z - cz); if (_pc.lengthSq() < 1e-4) _pc.set(1, 0, 0); _pc.normalize();
      const T = _pa.copy(pr).addScaledVector(_pc, .62); T.y += .5; dTmp.subVectors(pr, T).normalize();   /* it hangs a little above and in front of the pearl, the nose pointing down at it */
      f.clamPeek = true; const held = evPinTo(f, T, dTmp, 2.2, 1.7); if (held) o.peek.held = (o.peek.held || 0) + dt;
      if ((o.peek.held || 0) > 1.1 || o.peek.t > 3.2) { f.evPin = null; f.clamPeek = false; o.peek = null; clamCapture(o, f); }
    }
  }
  if (o.state === 'open' && G.status === 'play' && !o.peek && now - G.t0 > (G.clamFrom || 0) && !introOn && !guide.on && !camTutBusy()) {   /* like the swarm: it only hunts once the level is really under way (the entrance, the pop-up and the camera swing are over) */   // hunt: a needed fish that comes near gets a look at the pearl, then it is snapped up
    const need = G.need || needSet();
    for (const f of G.things) {
      if (f.kind !== 'fish' || !f.alive || f.locked || f.scale < .9 || !need.has(f.type) || (f.immune || 0) > now) continue;
      const dx = f.pos.x - cx, dy = f.pos.y - cy, dz = f.pos.z - cz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < (CLAM_R * 1.7) * (CLAM_R * 1.7)) { o.peek = { f, t: 0 }; break; }
      if (d2 < 2.2 * 2.2) alert = true;
    }
  }
  const target = o.state === 'closed' ? .02 : alert ? .95 : .5 + (o.state === 'open' ? .05 * Math.sin(t * 3 + o.phase) : 0);
  p.open += (target - p.open) * (1 - Math.exp(-dt * (o.state === 'closed' ? 26 : 9))); p.lid.rotation.x = -p.open;
  o.shake = Math.max(o.state === 'closed' ? .8 : 0, o.shake - dt * 3); p.group.rotation.z = (Math.sin(t * 15 + o.phase) * .46 + Math.sin(t * 6.1) * .16) * o.shake; p.group.rotation.x = 0; p.group.position.x = Math.sin(t * 15 + o.phase + 1.2) * .09 * o.shake;   /* thrashing to get free: hard left-right, never up */   /* it rocks from side to side (it no longer hops) */
  p.pearl.visible = o.state !== 'closed';
  if (o.state === 'closed') {
    p.lock.position.y = .62 + .04 * Math.sin(t * 3 + o.phase); p.lock.scale.setScalar((glowing ? .52 : .4) * (1 + (glowing ? .12 * Math.sin(t * 10) : 0)));
    p.held.position.y = 1.08 + .04 * Math.sin(t * 3 + o.phase + 1);
    p.glow.material.opacity = p.model ? (glowing ? .22 : 0) : .45 + .2 * Math.sin(t * 4) + (glowing ? .35 : 0); p.glow.scale.setScalar(1.3 + (glowing ? .5 : 0));   /* (the artist's clam has no halo of its own) */
  } else { p.glow.material.opacity = p.model ? 0 : (alert ? .75 : o.state === 'cool' ? .08 : .3 + .15 * Math.sin(t * 3 + o.phase)); p.glow.scale.setScalar(alert ? 1.7 : 1.2); }
  p.lock.visible = false; p.pips.visible = false; p.held.visible = false;
}
function clamCapture(o, f) {
  o.state = 'closed'; o.fish = f; o.taps = G.cfg.clamTaps; o.shake = 1; f.locked = true; f.evPin = null; f.clam = o; f.group.visible = false; f.hv = 0; f.hvT = 0;
  const P = o.pos.clone(); P.y += .3; burstFx.emit(P, 0xffffff, 28, 1.7); burstFx.emit(P, 0xff9ad9, 22, 1.3); burstFx.emit(P, 0xfff2a8, 14, 2.2); Snd.play('clamsnap'); kick(1.6);
  const p = o.parts; drawPips(p, o.taps, o.taps);
  const id = f.id; if (!heldTex[id] && THUMB[id]) { heldTex[id] = new THREE.TextureLoader().load(THUMB[id]); heldTex[id].colorSpace = THREE.SRGBColorSpace; }
  if (heldTex[id]) { const a = FISHART[id] ? FISHART[id].bw / FISHART[id].bh : 1, h = .5; p.held.material.map = heldTex[id]; p.held.material.needsUpdate = true; p.held.scale.set(Math.min(.9, h * a), h, 1); }
}
function tapClam(o) {   // opening costs a few taps; no penalty, the tank is left alone
  if (!o.alive || G.status !== 'play' || o.state !== 'closed') return;
  o.taps--; o.shake = 1; const P = o.pos.clone(); P.y += .3; burstFx.emit(P, 0xffffff, 6, .9); Snd.play('clamtap'); kick(.5); drawPips(o.parts, o.taps, G.cfg.clamTaps);
  vib(12);
  if (o.taps > 0) return;
  Snd.play('clamtap', { at: .12 }); const f = o.fish; o.state = 'cool'; o.cool = CLAM_COOL; o.fish = null; burstFx.emit(P, 0xff9ad9, 14, 1.2); burstFx.emit(P, 0xffe27a, 10, 1);
  if (f) { f.locked = false; f.clam = null; f.immune = U.uTime.value + CLAM_COOL; f.group.visible = true; f.pos.copy(P); f.group.position.copy(P); f.scale = .0001; f.group.scale.setScalar(.0001); f.spawnAt = U.uTime.value - G.t0; f.boost = 2.4; const mates = G.things.filter(q => q.kind === 'fish' && q.alive && !q.locked && q !== f && q.scale > .5 && q.pos.distanceTo(P) > 1.5); const m = mates.length ? pick(mates) : null; f.wp = m ? m.pos.clone().add(new THREE.Vector3(rand(-.5, .5), rand(-.3, .3), rand(-.5, .5))) : randomPoint(f); f.wp.y = clamp(f.wp.y, FLOOR_Y + .6, WATER_Y - .5); f.wpT = 6; f.dir.subVectors(f.wp, P).normalize(); }
}
function buildHand() {   // (kept under its old name) a cartoon food pail with a heap of pellets in it: it hangs over the water by its lip, tips and pours
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const red = new THREE.MeshStandardMaterial({ color: 0xff5a3c, fog: false, side: THREE.DoubleSide, metalness: .1, roughness: .45, emissive: 0xa02a10, emissiveIntensity: .8 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd25a, fog: false, metalness: .45, roughness: .3, emissive: 0x6a4a00, emissiveIntensity: .55 });
  const prof = [[0, -.31], [.25, -.31], [.28, -.27], [.38, .29], [.41, .32], [.38, .35], [.34, .29], [.24, -.25], [0, -.25]].map(([r, y]) => new THREE.Vector2(r, y));
  body.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32), red));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.39, .035, 10, 36), gold); rim.rotation.x = Math.PI / 2; rim.position.y = .33; body.add(rim);
  const hd = new THREE.Mesh(new THREE.TorusGeometry(.4, .022, 8, 24, Math.PI), gold); hd.position.y = .33; body.add(hd);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; { const x = c.getContext('2d'); x.fillStyle = '#fff3c4'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#e8481f'; x.font = 'bold 44px Arial Black, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('FOOD', 150, 50);
    x.fillStyle = '#ff9a2a'; x.beginPath(); x.ellipse(70, 48, 26, 17, 0, 0, 6.283); x.fill(); x.beginPath(); x.moveTo(44, 48); x.lineTo(24, 30); x.lineTo(24, 66); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(82, 43, 5, 0, 6.283); x.fill(); x.fillStyle = '#222'; x.beginPath(); x.arc(84, 43, 2.5, 0, 6.283); x.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.352, .322, .27, 32, 1, true), new THREE.MeshBasicMaterial({ map: tex, fog: false, side: THREE.DoubleSide })); band.rotation.y = Math.PI; band.position.y = .01; body.add(band);
  const heap = new THREE.Group(); heap.position.y = .3; body.add(heap);   // a pile of the same round pellets that pour out of the pail
  { const pg = new THREE.SphereGeometry(.056, 14, 10).scale(1, .7, 1), pmat = new THREE.MeshStandardMaterial({ color: 0xffffff, fog: false, roughness: .22, metalness: .02, emissive: 0x4a2208, emissiveIntensity: .3 }), N = 46, im = new THREE.InstancedMesh(pg, pmat, N), mm = new THREE.Matrix4(), cols = [0xf2802c, 0xd9382a, 0xf5be32, 0x80c545, 0xe85f7c, 0xf2802c];
    for (let i = 0; i < N; i++) { const r = .33 * Math.sqrt(Math.random()), a2 = Math.random() * 6.283, y = .16 * (1 - Math.pow(r / .36, 2)) * (.55 + Math.random() * .6) + Math.random() * .03; mm.compose(new THREE.Vector3(Math.cos(a2) * r, y, Math.sin(a2) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)), new THREE.Vector3().setScalar(.85 + Math.random() * .4)); im.setMatrixAt(i, mm); im.setColorAt(i, new THREE.Color(cols[(Math.random() * cols.length) | 0])); }
    heap.add(im); }
  g.userData = { body, heap }; return g;
}
const feed = { mesh: null, hand: null, N: 48, pel: [], on: false, c: new THREE.Vector3(), t: 0, hx: 0, hz: 0, cd: 0 }, FEED_MAX = 22, EAT_GAP = .27, SURF = WATER_Y + .02;
const HAND_Y = WATER_Y + .35, FEED_IN = .9, FEED_REL = 1.8, FEED_OUT = FEED_IN + FEED_REL + .5, PAIL_S = 1.05, PAIL_LIP = new THREE.Vector2(-.38, .33), PAIL_Y = WATER_Y + .15;
function feedInit() {
  if (feed.mesh) return; const fg = new THREE.SphereGeometry(.056, 16, 12); fg.scale(1, .66, 1);   // a rounded, slightly flattened pellet with smooth shading
  feed.mesh = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: 0xffffff, fog: false, roughness: .22, metalness: .02, emissive: 0x4a2208, emissiveIntensity: .3 }), feed.N);
  feed.mesh.frustumCulled = false; feed.mesh.visible = false; for (let i = 0; i < feed.N; i++) feed.mesh.setColorAt(i, new THREE.Color(pick([0xf2802c, 0xd9382a, 0xf5be32, 0x80c545, 0xe85f7c, 0xf2802c]))); fishRoot.add(feed.mesh);
  feed.hand = buildHand(); feed.hand.visible = false; fishRoot.add(feed.hand);
}
function feedStart() {
  feedInit(); const d = new THREE.Vector3(cam.position.x, 0, cam.position.z).normalize(), sd = new THREE.Vector3(-d.z, 0, d.x), a = rand(.5, 1.0), b = rand(-.7, .7);
  const cx = d.x * a + sd.x * b, cz = d.z * a + sd.z * b; feed.on = true; feed.t = 0; feed.cd = 0; feed.hx = cx; feed.hz = cz; feed.c.set(cx, WATER_Y - .5, cz);
  feed.pel = Array.from({ length: feed.N }, (_, i) => ({ ox: rand(-.1, .1), oz: rand(-.1, .1), x: cx, y: HAND_Y, z: cz, vx: rand(-.16, .16), vz: rand(-.16, .16), rel: FEED_IN + (i / feed.N) * FEED_REL + rand(0, .05), out: false, vs: rand(.35, .5), ph: rand(0, 6.28), dead: false, ent: false, eat: 0, rx: rand(0, 6.28), rz: rand(0, 6.28), wx: rand(-9, 9), wz: rand(-9, 9), k: rand(.8, 1.25) }));
  feed.mesh.visible = true; feed.hand.visible = true; if (feed.hand.userData.mats) for (const m of feed.hand.userData.mats) { m.transparent = false; m.opacity = 1; m.depthWrite = true; } feed.hand.rotation.y = Math.atan2(cam.position.x - cx, cam.position.z - cz); Snd.play('splash');
}
const _eul = new THREE.Euler(), _qf = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3();
function feedUpdate(dt) {
  if (!G) return;
  if (!feed.on) { if (G.status === 'play' && G.cfg.feed && U.uTime.value - G.t0 > G.nextFeed && eventsIdle()) feedStart(); return; }   // feeding waits for any other event to finish
  feed.t += dt; feed.cd -= dt; let live = 0, sx = 0, sz = 0, left = 0;
  { // the pail: drops in with a bounce, rocks back, tips and pours, shakes the last pellets out, then rights itself and lifts away
    const h = feed.hand, t = feed.t, eo = k => { k = clamp(k, 0, 1); return 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); };
    const pourK = clamp((t - .55) / .6, 0, 1), pouring = t > FEED_IN && t < FEED_IN + FEED_REL, back = clamp((t - (FEED_IN + FEED_REL)) / .5, 0, 1), up = clamp((t - (FEED_IN + FEED_REL + .1)) / .6, 0, 1);
    let tilt = 1.45 * eo(pourK) - .22 * Math.sin(clamp((t - .3) / .25, 0, 1) * Math.PI); if (pouring) tilt += Math.sin(t * 17) * .07; tilt *= 1 - back * back * (3 - 2 * back);
    const yEx = 2.4 * (1 - eo(t / .7)) + 4.8 * up * up, sy = 1 + (pouring ? Math.sin(t * 17) * .05 : 0) + .1 * Math.sin(clamp((t - .35) / .25, 0, 1) * Math.PI);
    const yaw = Math.atan2(cam.position.x - feed.hx, cam.position.z - feed.hz), c = Math.cos(tilt), sn = Math.sin(tilt), lx = (PAIL_LIP.x * c - PAIL_LIP.y * sn) * PAIL_S, ly = (PAIL_LIP.x * sn + PAIL_LIP.y * c) * PAIL_S;
    h.rotation.order = 'YXZ'; h.rotation.set(0, yaw, tilt); h.scale.set(PAIL_S, PAIL_S * sy, PAIL_S);
    h.position.set(feed.hx - Math.cos(yaw) * lx, PAIL_Y + yEx - ly, feed.hz + Math.sin(yaw) * lx);   // the lip stays over the spot the food lands on
    h.userData.heap.scale.set(1, 1 - .85 * clamp((t - FEED_IN) / FEED_REL, 0, 1), 1);
    { const fk = clamp((t - (FEED_IN + FEED_REL + .5)) / .25, 0, 1), fa = 1 - fk;   // it speeds up and flies out of the top of the screen; the short fade is only a safety net
      if (!h.userData.mats) { h.userData.mats = []; h.traverse(m => { if (m.material && !h.userData.mats.includes(m.material)) h.userData.mats.push(m.material); }); }
      for (const m of h.userData.mats) { m.transparent = fa < 1; m.opacity = fa; m.depthWrite = fa > .98; } }
    if (t > FEED_IN + FEED_REL + .85) h.visible = false;
  }
  feed.pel.forEach((p, i) => {
    if (!p.out) { if (feed.t >= p.rel) { p.out = true; { const yaw = Math.atan2(cam.position.x - feed.hx, cam.position.z - feed.hz), rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw), jz = rand(-.2, .2) * PAIL_S, sp = rand(.35, .95);
      p.x = feed.hx + fx * jz; p.z = feed.hz + fz * jz; p.y = feed.hand.position.y + feed.hand.userData.heap.position.y * 0 + (PAIL_LIP.x * Math.sin(1.45) + PAIL_LIP.y * Math.cos(1.45)) * PAIL_S; p.y = Math.max(p.y, SURF + .3); p.vx = -rx * sp + rand(-.08, .08); p.vz = -rz * sp + rand(-.08, .08); p.vy = rand(-.5, -.1); } } else { left++; _s3.setScalar(0); _m4.compose(_p3.set(feed.hx, PAIL_Y, feed.hz), _q0, _s3); feed.mesh.setMatrixAt(i, _m4); return; } }
    if (!p.dead) {
      if (p.y > SURF) { p.rx += p.wx * dt; p.rz += p.wz * dt; p.vy -= 9 * dt; p.y += p.vy * dt; p.x += p.vx * dt; p.z += p.vz * dt; if (p.y <= SURF) { p.y = SURF; p.ent = true; p.vx = p.vx * .3 + rand(-.32, .32); p.vz = p.vz * .3 + rand(-.32, .32); addRipple(p.x, p.z, .03); } }
      else {   // floating on the water: a slow drift and a little bob
        p.x += (p.vx * .5 + Math.sin(feed.t * .9 + p.ph) * .05) * dt; p.z += (p.vz * .5 + Math.cos(feed.t * .8 + p.ph) * .05) * dt; p.vx *= Math.exp(-dt * .25); p.vz *= Math.exp(-dt * .25);
        const rr = Math.hypot(p.x, p.z), lim = R - .45; if (rr > lim) { p.x *= lim / rr; p.z *= lim / rr; } p.y = SURF + .012 * Math.sin(feed.t * 3 + p.ph); for (const q of feed.pel) { if (q === p || !q.out || q.dead || q.y > SURF + .05) continue; const dx = p.x - q.x, dz = p.z - q.z, d2 = dx * dx + dz * dz; if (d2 < .09 && d2 > 1e-6) { const d = Math.sqrt(d2), f = (.3 - d) * 1.6 * dt / d; p.x += dx * f; p.z += dz * f; } }   // flakes keep a little room between them
        p.rx *= Math.exp(-dt * 6); p.rz *= Math.exp(-dt * 6); p.rx += Math.sin(feed.t * 2.2 + p.ph) * .004; p.ph += dt * .3;
        for (const o of G.things) { if (o.kind !== 'fish' || !o.alive || o.locked) continue; const dx = o.pos.x - p.x, dy = o.pos.y - p.y, dz = o.pos.z - p.z; if (dx * dx + dz * dz + dy * dy * .5 < .3) { p.eat += dt; break; } }
        if (p.eat > .8 && feed.cd <= 0) { p.dead = true; feed.cd = EAT_GAP; burstFx.emit(_p3.set(p.x, WATER_Y - .05, p.z), 0xffd36a, 4, .6); addRipple(p.x, p.z, .025); }
      }
      if (!p.dead) { live++; sx += p.x; sz += p.z; }
    }
    _s3.setScalar(p.dead ? 0 : p.k); _eul.set(p.rx, p.ph, p.rz); _qf.setFromEuler(_eul); _m4.compose(_p3.set(p.x, p.y, p.z), _qf, _s3); feed.mesh.setMatrixAt(i, _m4);
  });
  feed.mesh.instanceMatrix.needsUpdate = true;
  if (live) feed.c.set(sx / live, WATER_Y - .5, sz / live); else if (left) feed.c.set(feed.hx, WATER_Y - .5, feed.hz);
  if ((!live && !left) || feed.t > FEED_MAX) { feed.on = false; feed.mesh.visible = false; feed.hand.visible = false; evCool(); G.nextFeed = U.uTime.value - G.t0 + rand(...G.cfg.feedGap); for (const o of G.things) if (o.kind === 'fish') o.wpT = 0; }
}

/* ---- startle: from level 10 a rock now and then plops into the tank and the whole school bolts - fast chaos is an event, not the normal state ---- */
// only one big event at a time: random event (pearl, conga...), feeding, falling rock, swarm, tube wave, tutorial
// after ANY event (random event, feeding, the falling rock, the swarm) ends, nothing else starts for 8-10 s
function evCool() { if (G) G.evFree = U.uTime.value - G.t0 + rand(8, 10); }
const evFreeNow = () => U.uTime.value - G.t0 >= (G.evFree || 0);
function eventsIdle() { return evFreeNow() && !EVT.cur && !feed.on && !rock && !swarm.on && tube.state !== 'rumble' && tube.state !== 'emit' && tube.state !== 'out' && !introOn && !guide.on; }
let rock = null;
function rockClear() { if (rock) { evCool(); fishRoot.remove(rock); rock.geometry.dispose(); rock.material.dispose(); rock = null; } }
function startleUpdate(dt) {
  if (!G || G.status !== 'play' || !G.cfg.startle) return;
  if (!rock && ((U.uTime.value - G.t0 > G.nextStartle && eventsIdle()) || G.devRock)) { G.devRock = false;
    rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.22, 0), new THREE.MeshPhongMaterial({ color: 0x7a8a9a, emissive: 0x28323e, flatShading: true }));
    const a = rand(0, 6.28), r = rand(0, RF * .7); rock.position.set(Math.cos(a) * r, TANK_H + 3, Math.sin(a) * r); rock.userData = { vy: 0, hit: false }; fishRoot.add(rock);
  }
  if (!rock) return; const u = rock.userData;
  u.vy = u.hit ? Math.max(u.vy - 3 * dt, -1.4) : u.vy - 14 * dt; rock.position.y += u.vy * dt; rock.rotation.x += dt * 4; rock.rotation.z += dt * 3;
  if (!u.hit && rock.position.y <= WATER_Y) {
    u.hit = true; u.vy *= .3; const P = rock.position; surfaceSplash(P.x, P.z, 1.3); scatter(new THREE.Vector3(P.x, WATER_Y - 1.2, P.z), 2.2, true); Snd.play('splash'); kick(2);
    G.nextStartle = U.uTime.value - G.t0 + rand(...G.cfg.startleGap);
  }
  if (u.hit && rock.position.y <= FLOOR_Y + .25) rockClear();
}

/* ---- fun random events: the school squabbles, forms a conga line, whirls round the tank, waltzes, hides, or gathers round something thrown in ---- */
const EVT = { cur: null };
function evBubble(P, txt) { const q = projectToClient(P), d = document.createElement('div'); d.className = 'evb'; d.textContent = txt; d.style.left = q.x + 'px'; d.style.top = q.y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 1150); }
const evOk = o => o.alive && o.kind === 'fish' && !o.big && !o.locked && !o.hinted && !o.clamGo && !o.launch && o.scale > .9;
function evFish(n, near) {   // n free little fish (the ones closest to `near` when given, otherwise random)
  let c = G.things.filter(evOk); if (near) c.sort((a, b) => a.pos.distanceTo(near) - b.pos.distanceTo(near)); else c = shuffle(c); return c.slice(0, n);
}
function evWp(o, v, k = 0) {   // steer o toward v; with k the fish also sprints in proportion to how far behind it is, so formations really hold together
  clampXZ(v, RF * .9); v.y = clamp(v.y, FLOOR_Y + .6, WATER_Y - .55); o.wp.copy(v); o.wpT = 1.5;
  if (k) o.boost = Math.max(o.boost, clamp(o.pos.distanceTo(v) * k, .25, 1.7));
}
function evPinTo(o, T, face, rate, thr) {   // swim to the spot first; only once close do we hold the fish on it (so nothing is ever yanked across the tank)
  if (o.pos.distanceTo(T) > (o.evPin ? thr * 2 : thr)) { o.evPin = null; evWp(o, T.clone(), 1.6); o.boost = Math.max(o.boost, .9); return false; }
  o.evPin = o.evPin || { pos: new THREE.Vector3(), face: new THREE.Vector3() }; o.evPin.rate = rate; o.evPin.pos.copy(T); o.evPin.face.copy(face); return true;
}
let evItem = null; function evItemClear() { if (evItem) { fishRoot.remove(evItem); evItem.geometry.dispose(); evItem.material.dispose(); evItem = null; } }
function evStart(kind) {
  const L = G.level, N = G.things.filter(evOk).length; let m = [], d = 7, st = {};
  const pairsOf = n => { const r = []; for (let i = 0; i < n; i++) { const a = evFish(1).filter(x => !m.includes(x))[0]; if (!a) break; const b = evFish(12, a.pos).find(x => x !== a && !m.includes(x)); if (!b) break; m.push(a, b); r.push({ flip: 0, cd: 0 }); } return r; };
  if (kind === 'squabble') { st.pr = pairsOf(Math.min(4, 2 + (N / 22 | 0))); st.pr.forEach((pr, i) => { const a = m[i * 2], b = m[i * 2 + 1]; pr.c = a.pos.clone().add(b.pos).multiplyScalar(.5).clampLength(0, RF * .55); pr.c.y = clamp(pr.c.y, FLOOR_Y + 1, WATER_Y - 1); pr.th = rand(0, 6.28); pr.ph = rand(0, 6.28); pr.v = new THREE.Vector3(rand(-.25, .25), 0, rand(-.25, .25)); }); d = rand(6, 8); }
  else if (kind === 'conga') {   /* a long line that snakes through the tank on one big smooth path: each fish has a slot on the path (the place the leader was a moment ago), so the spacing is even and every nose points along the line */
    const n = Math.min(10, 7 + (L >> 2)); st.dly = .9; d = rand(22, 26); const mk = () => ({ th0: rand(0, 6.283), sgn: Math.random() < .5 ? 1 : -1, ph: [rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)] });
    st.P = (u, out) => { const th = st.th0 + st.sgn * .62 * u, r = RF * (.7 + .13 * Math.sin(.28 * u + st.ph[0])) + .3 * Math.sin(1.25 * u + st.ph[2]), y = (FLOOR_Y + WATER_Y) / 2 + .95 * Math.sin(.43 * u + st.ph[1]) + .25 * Math.sin(1.3 * u); out.set(Math.cos(th) * r, y, Math.sin(th) * r); clampXZ(out, RF * .92); out.y = clamp(out.y, FLOOR_Y + .7, WATER_Y - .6); return out; };
    { const boxes = themeBoxes(curTheme), pt = new THREE.Vector3(); let best = null;   /* of several paths take the one that runs clear of the decor (a line pushed out of a rock broke up) */
      for (let c = 0; c < 14; c++) { const cand = mk(); Object.assign(st, cand); let hits = 0; for (let u = -n * st.dly; u < d - 2; u += .4) { st.P(u, pt); for (const b of boxes) if (b.min.y < 4.2 && pt.x > b.min.x - .55 && pt.x < b.max.x + .55 && pt.y > b.min.y - .55 && pt.y < b.max.y + .55 && pt.z > b.min.z - .55 && pt.z < b.max.z + .55) { hits++; break; } } if (!best || hits < best.hits) best = { hits, cand }; if (hits === 0) break; }
      Object.assign(st, best.cand); }
    const pool = evFish(40).slice(0, Math.max(n, 6)), slot = new THREE.Vector3(); m = [];
    for (let i = 0; i < n && pool.length; i++) { st.P(-i * st.dly, slot); let bi = 0; pool.forEach((o, k) => { if (o.pos.distanceTo(slot) < pool[bi].pos.distanceTo(slot)) bi = k; }); m.push(pool.splice(bi, 1)[0]); }   /* the fish nearest to each slot takes it, so they hardly have to cross the tank to join the line */
  }
  else if (kind === 'swirl') { m = evFish(Math.min(44, 12 + L * 3)); st.ang = rand(0, 6.28); st.dir = Math.random() < .5 ? 1 : -1; d = rand(9, 11); st.my = (FLOOR_Y + WATER_Y) / 2 + .1; d = rand(13, 15); }   /* the wheel sits in the middle of the room it has: as high as it can go without touching the surface or the sand */
  else if (kind === 'waltz') { st.pr = pairsOf(Math.min(4, 2 + (N / 25 | 0))); st.c = []; for (let i = 0; i < m.length; i += 2) { const c = m[i].pos.clone().add(m[i + 1].pos).multiplyScalar(.5).clampLength(0, RF * .6); c.y = clamp(c.y, FLOOR_Y + 1, WATER_Y - 1); st.c.push(c); } st.th = 0; st.ph = rand(0, 6.28); d = rand(13, 15); }
  else if (kind === 'hide') { if (!HOUSES.length) return false; m = evFish(Math.min(HOUSES.length * 5, 12, 8 + L)); d = 4; }
  else if (kind === 'drop') { if (rock) return false; m = evFish(46); st.ph = 0; st.vy = 0; st.t1 = 0;
    evItemClear(); evItem = new THREE.Mesh(new THREE.SphereGeometry(.3, 20, 14), new THREE.MeshPhongMaterial({ color: 0xfff1c8, emissive: 0xd9a040, shininess: 90, specular: 0xffffff, fog: false }));
    const a = rand(0, 6.28), r = rand(0, RF * .45); evItem.position.set(Math.cos(a) * r, TANK_H + 2.6, Math.sin(a) * r); fishRoot.add(evItem); d = 99; }
  if (m.length < 2) { evItemClear(); return false; }
  EVT.cur = { kind, m, t: 0, d, st, bt: 0 };
  for (const o of m) { o.evOn = kind !== 'drop'; o.evTight = kind === 'squabble' || kind === 'waltz' || kind === 'conga' || kind === 'swirl'; } return true;
}
function evEnd() { const e = EVT.cur; if (!e) return; for (const o of e.m) { o.evOn = false; o.evTight = false; o.evPin = null; o.wpT = 0; } evItemClear(); EVT.cur = null; G.nextEv = U.uTime.value - G.t0 + rand(...G.cfg.evGap); evCool(); }
function dropUpdate(e, dt) {   // something is thrown in: the school bolts away, drifts back to look at it, the pearl floats up and a few fish head-butt it back and forth, then it pops and they scatter
  const st = e.st, me = evItem; e.m = e.m.filter(evOk); if (!me) { evEnd(); return; }
  if (st.ph === 0) { st.vy -= 13 * dt; me.position.y += st.vy * dt; me.rotation.y += dt * 4;
    if (me.position.y <= WATER_Y) { st.ph = 1; st.t1 = e.t; surfaceSplash(me.position.x, me.position.z, 1.2); scatter(new THREE.Vector3(me.position.x, WATER_Y - 1.2, me.position.z), 2.4, true); Snd.play('splash'); kick(1.5); } return; }
  const g = e.t - st.t1, J = st.j, SURF = WATER_Y - .02;
  if (!J) { me.position.y = g < .9 ? me.position.y - .6 * dt : Math.min(SURF, me.position.y + 1.3 * dt); } else me.rotation.y += dt;   // dips under, then bobs up to the surface
  me.rotation.y += dt;
  if (g < 1.8) return;   // still fleeing
  const ctr = J ? J.c : me.position;
  if (!J && g > 3.4 && me.position.y >= SURF - .02) {   // the pearl is up: pick the players and start the game
    const near = e.m.slice().sort((a, b) => a.pos.distanceTo(me.position) - b.pos.distanceTo(me.position)).slice(0, Math.min(4, e.m.length)); if (near.length < 2) { evEnd(); return; }
    const c = me.position.clone(); c.y = SURF; st.j = { c, part: near, ring: near.map((o, i) => { const a = i / near.length * 6.283 + .4; return new THREE.Vector3(c.x + Math.cos(a) * 1.25, SURF, c.z + Math.sin(a) * 1.25); }), h: -1, n: 0, tt: 0, dur: .95, cnt: 0, from: me.position.clone() };
    near.forEach(o => { o.hit = 0; }); st.j.ring.forEach(v => { const r = Math.hypot(v.x, v.z), lim = Math.min(RF * .85, wallAt(v.x, v.z, WATER_Y) - .8); if (r > lim) { v.x *= lim / r; v.z *= lim / r; } });   /* the pearl bounces only where there is water: the wall of a bowl or a square tank is nearer than the round one */
  }
  const j = st.j;
  if (j) {   // ball in the air from the last header to the next one
    j.tt += dt; const k = Math.min(1, j.tt / j.dur), to = j.ring[j.n];
    me.position.set(j.from.x + (to.x - j.from.x) * k, SURF + .1 + 1.5 * 4 * k * (1 - k), j.from.z + (to.z - j.from.z) * k);
    if (k >= 1) { const r = j.part[j.n]; r.hit = .4; j.cnt++; burstFx.emit(new THREE.Vector3(to.x, SURF, to.z), 0xffffff, 8, .7); Snd.play('pearl'); surfaceSplash(to.x, to.z, .35, true);
      if (j.cnt >= 8 || g > 17) { burstFx.emit(me.position, 0xfff1c8, 24, 1.5); surfaceSplash(me.position.x, me.position.z, .9); scatter(me.position.clone().setY(WATER_Y - 1), 1, true); for (const o of e.m) { o.evOn = false; o.evPin = null; } evEnd(); return; }
      j.h = j.n; j.part[j.h].hit = .4; j.from.copy(me.position); do { j.n = (Math.random() * j.part.length) | 0; } while (j.n === j.h); j.tt = 0; }
  }
  e.bt -= dt; if (!j && e.bt <= 0) { e.bt = 1.1; evBubble(me.position.clone().setY(me.position.y + .5), '❓'); }
  e.m.forEach((o, i) => { if (o.evFleeT > 0) { o.evFleeT -= dt; o.evOn = false; o.evPin = null; return; }
    const pi = j ? j.part.indexOf(o) : -1;
    if (pi >= 0) {   // a player: floats just under the surface at its spot, looks up at the ball, and bobs up to head-butt when the ball reaches it
      o.evOn = true; o.hit = Math.max(0, (o.hit || 0) - dt); const lift = Math.sin(Math.min(1, o.hit / .4) * 3.1416) * .4, sp = j.ring[pi];
      evPinTo(o, new THREE.Vector3(sp.x, WATER_Y - .55 + lift, sp.z), new THREE.Vector3(me.position.x - o.pos.x, .9 + (lift > .02 ? .8 : 0), me.position.z - o.pos.z).normalize(), 6, .8); if (o.hit > .3 && !o.hitDone) { o.hitDone = 1; o.wiggle = .6; } if (o.hit <= 0) o.hitDone = 0; o.boost = Math.max(o.boost, .5); return; }
    o.evOn = true; if (o.evA === undefined || g < 2) { o.evA = rand(0, 6.28); o.evR = rand(.9, 2.1); } o.evA += dt * (i % 2 ? .22 : -.22);
    const v = new THREE.Vector3(ctr.x + Math.cos(o.evA) * (o.evR + (j ? .9 : 0)), (j ? WATER_Y - 1.1 : me.position.y) + Math.sin(o.evA * 1.7) * .3, ctr.z + Math.sin(o.evA) * (o.evR + (j ? .9 : 0))); evWp(o, v, .25); o.boost = Math.min(o.boost, .5);
    const dd2 = o.pos.distanceTo(v); if (dd2 < (o.evPin ? 1.6 : .9)) { o.evPin = o.evPin || { pos: new THREE.Vector3(), face: new THREE.Vector3(), rate: 2.2 }; o.evPin.rate = 2.2; o.evPin.pos.copy(v); o.evPin.face.copy(me.position).sub(o.pos).normalize(); } else o.evPin = null; });   // the rest hover and watch
}
function evUpdate(dt) {
  if (!G || G.status !== 'play' || dt <= 0) return; const now = U.uTime.value - G.t0, e = EVT.cur;
  if (!e) {
    if (G.cfg.evKinds.length && now > G.nextEv && evFreeNow() && tube.state !== 'rumble' && tube.state !== 'emit' && tube.state !== 'out' && !swarm.on && !feed.on && !rock && !introOn && !guide.on) { const pool = G.cfg.evKinds.filter(k => k !== G.lastEv && (k !== 'drop' || now - (G.lastDrop === undefined ? -1e9 : G.lastDrop) > 80)), k = pick(pool.length ? pool : G.cfg.evKinds); if (evStart(k)) { G.lastEv = k; if (k === 'drop') G.lastDrop = now; } else G.nextEv = now + 2; } return; }   // the pearl game is long, so at most once every ~80 s, and never the same event twice in a row
  e.t += dt; if (e.kind === 'drop') { dropUpdate(e, dt); return; }
  e.m = e.m.filter(o => { if (!o.evOn || !evOk(o) || o.boost > 2.6) { o.evOn = false; o.evTight = false; o.evPin = null; o.wpT = 0; return false; } return true; });
  if (e.t > e.d || e.m.length < 2) { evEnd(); return; }
  const kind = e.kind, m = e.m, st = e.st, P = new THREE.Vector3();
  e.bt -= dt; const bub = e.bt <= 0; if (bub) e.bt = .6;
  if (kind === 'squabble') {   // nose to nose: the two face each other, back off, then lunge and clash with a shake and a puff
    for (let i = 0; i + 1 < m.length; i += 2) { const pr = st.pr[i / 2], a = m[i], b = m[i + 1]; pr.th += dt * .7; pr.ph += dt * 6; pr.cd -= dt;
      pr.c.addScaledVector(pr.v, dt); if (Math.hypot(pr.c.x, pr.c.z) > RF * .6) pr.v.multiplyScalar(-1); pr.c.y = clamp(pr.c.y + Math.sin(e.t * 1.7 + i) * dt * .25, FLOOR_Y + 1, WATER_Y - 1);
      const f = Math.pow(.5 + .5 * Math.cos(pr.ph), .8), h = .3 + .62 * f, ux = Math.cos(pr.th), uz = Math.sin(pr.th), uy = .12 * Math.sin(pr.th * 2);
      for (const [o, sg] of [[a, 1], [b, -1]]) { evPinTo(o, new THREE.Vector3(pr.c.x + ux * h * sg, pr.c.y + uy * h * sg, pr.c.z + uz * h * sg), new THREE.Vector3(-ux * sg, -uy * sg, -uz * sg), 9, .9); o.boost = Math.max(o.boost, 1.2); }
      if (f < .14 && pr.cd <= 0) { pr.cd = .75; a.wiggle = b.wiggle = 1; P.copy(pr.c); burstFx.emit(P, 0xffffff, 9, .7); burstFx.emit(P, 0xffd24a, 5, .5); evBubble(P, '💢'); } }
  } else if (kind === 'conga') {   /* every fish swims to its slot on the path and, once there, is carried along it facing the way it goes */
    const T = new THREE.Vector3(), T2 = new THREE.Vector3(), fc = new THREE.Vector3();
    m.forEach((o, i) => { const u = e.t - i * st.dly; st.P(u, T); st.P(u + .12, T2); fc.subVectors(T2, T); fc.y = clamp(fc.y, -.12, .12) * (fc.length() > 0 ? 1 : 0); fc.normalize(); if (e.d - e.t < 2.5) { o.evPin = null; return; }
      T.x += -fc.z * .2 * Math.sin(e.t * 1.5 + i * 1.9); T.z += fc.x * .2 * Math.sin(e.t * 1.5 + i * 1.9); T.y += .14 * Math.sin(e.t * 2 + i * 1.3);   /* each fish drifts a little to the side and up and down: a loose, living line, not a rigid chain */
      evPinTo(o, T.clone(), fc.clone(), 4.5, 1.4); });
  } else if (kind === 'swirl') {   /* a carousel: the whole school swims round and round in big rings that face the player (two rings, one inside the other), like a wheel turning in the middle of the tank */
    st.ang += st.dir * dt * (.6 + 1.1 * Math.sin(Math.PI * clamp(e.t / e.d, 0, 1))); const rt0 = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize(), fw0 = new THREE.Vector3(-rt0.z, 0, rt0.x), ph2 = Math.sin(e.t * .45) * .7, rt = rt0.clone().multiplyScalar(Math.cos(ph2)).addScaledVector(fw0, Math.sin(ph2)), fw = new THREE.Vector3(-rt.z, 0, rt.x), T = new THREE.Vector3(), fc = new THREE.Vector3(), cnt = [0, 0], nIn = Math.max(1, Math.round(m.length * .31)), tot = [m.length - nIn, nIn];   /* the inner ring is the shorter way round, so it takes its share of the fish: both rings end up with the same gap between neighbours */
    m.forEach((o, i) => { const r = i < nIn ? 1 : 0, k = cnt[r]++, n2 = Math.max(1, tot[r]), R2 = (r ? 1.05 : 2.3) * (1 + .06 * Math.sin(e.t * 1.6 + r)), a = st.ang * (r ? 1.25 : .9) + k * 6.283 / n2 + r * .5, ex = .63;   /* wider rings, and flat enough that the top and bottom of the wheel are not squashed against the water and the sand (that squashing is what pushed the fish together) */
      T.copy(rt).multiplyScalar(Math.cos(a) * R2).addScaledVector(fw, Math.sin(i * 2.1) * .35); T.y = st.my + Math.sin(a) * R2 * ex; clampXZ(T, RF * .9); T.y = clamp(T.y, FLOOR_Y + .8, WATER_Y - .6);
      fc.copy(rt).multiplyScalar(-Math.sin(a) * st.dir).setY(Math.cos(a) * ex * st.dir).normalize();
      if (e.d - e.t < 1.5) { o.evPin = null; return; } evPinTo(o, T.clone(), fc.clone(), 4.5, 1.8); if (Math.random() < dt * 7) burstFx.emit(o.pos, 0xbfeaff, 1, .3); });   /* a wake of bubbles behind every fish */
  } else if (kind === 'waltz') {   /* a dance: each pair spins round each other in a ring that faces the player (like two dolphins chasing round a hoop), rings side by side in the middle of the tank */
    st.th += dt * (1.8 + 1.5 * Math.sin(Math.PI * clamp(e.t / e.d, 0, 1))); const T = new THREE.Vector3(), fc = new THREE.Vector3(), rt0 = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize(), fw0 = new THREE.Vector3(-rt0.z, 0, rt0.x), pa = e.t * .55, rt = rt0.clone().multiplyScalar(Math.cos(pa)).addScaledVector(fw0, Math.sin(pa)), np = Math.floor(m.length / 2);
    for (let i = 0; i + 1 < m.length; i += 2) { const k = i / 2, big = np > 2, col = big ? k % 2 : k, ncol = big ? 2 : np, row = big ? Math.floor(k / 2) : 0, cx = (col - (ncol - 1) / 2) * (big ? 2.2 : 2.4), cy = (FLOOR_Y + WATER_Y) / 2 + (big ? (row - .5) * 1.7 : 0) + Math.sin(e.t * .5) * .2, R2 = (big ? .6 : .78) + .1 * Math.sin(e.t * 1.1);   /* many pairs stand in a tidy grid (two columns, two rows), all dancing exactly together: a chorus, easy to read at a glance */   /* the ring tilts round slowly (a 3D loop), speeds up to the middle of the dance and breathes in and out */
      for (const [o, sg] of [[m[i], 1], [m[i + 1], -1]]) { const a = st.th + (sg > 0 ? 0 : Math.PI), dr = 1; T.copy(rt).multiplyScalar(cx + Math.cos(a) * R2); T.y = cy + Math.sin(a) * R2 * .85; clampXZ(T, RF * .9); T.y = clamp(T.y, FLOOR_Y + .7, WATER_Y - .6);
        fc.copy(rt).multiplyScalar(-Math.sin(a) * dr).setY(Math.cos(a) * .85 * dr).normalize(); if (e.d - e.t < 1.5) { o.evPin = null; continue; } evPinTo(o, T.clone(), fc.clone(), 4.5, 1.6);
        if (Math.random() < dt * 9) burstFx.emit(o.pos, sg > 0 ? 0xffb0d8 : 0xbfeaff, 1, .3); } }
    /* the other fish keep clear of the dancers, so the dance has room and can be seen */
    const cc = new THREE.Vector3(), ra = new THREE.Vector3(); for (let i = 0; i + 1 < m.length; i += 2) { cc.copy(m[i].pos).add(m[i + 1].pos).multiplyScalar(.5); for (const q of G.things) { if (q.kind !== 'fish' || !q.alive || q.big || m.includes(q)) continue; ra.subVectors(q.pos, cc); const d = ra.length(); if (d < 1.9) { ra.normalize(); q.pos.addScaledVector(ra, dt * (1.9 - d) * 1.4); q.dir.lerp(ra, Math.min(1, dt * 2)).normalize(); } } }
  } else if (kind === 'hide') {
    const cnt = e.st.hc || (e.st.hc = new Map());   /* a house takes a few fish at a time and each gets its own spot in front of it (side by side, above one another): they used to all aim at one point and stand there on top of each other */
    m.forEach(o => { if (!o.evH) { const near = HOUSES.slice().sort((a, b) => Math.hypot(a.c.x - o.pos.x, a.c.z - o.pos.z) - Math.hypot(b.c.x - o.pos.x, b.c.z - o.pos.z)), h0 = near.find(h => (cnt.get(h) || 0) < 5) || near[0]; o.evH = h0; o.evSlot = cnt.get(h0) || 0; cnt.set(h0, o.evSlot + 1); }
      const h = o.evH, i = o.evSlot || 0, ax = h.axis, sd = new THREE.Vector3(-ax.z, 0, ax.x).normalize(), q = h.c.clone().addScaledVector(sd, ((i % 3) - 1) * .42); q.y += (((i / 3) | 0) % 2 ? .3 : -.1) + (h.door ? 0 : .1); q.addScaledVector(ax, (h.door ? .12 : .5) + ((i / 6) | 0) * .4);
      evWp(o, q, 1.5); o.boost = Math.max(o.boost, 1); });
    if (e.t < .3 && bub) P.set(0, WATER_Y - .8, 0);
  }
}


/* ---- fish-swarm obstacle (L9+): a big school pours out of a house / cave, whirls round the tank in a thick ribbon hiding the view, then streams back home ---- */
const swarm = { on: false, meshes: [], fish: [], t: 0, D: 12, H: new THREE.Vector3(), th0: 0, sgn: 1, w: .8, ph: [0, 0, 0] };
function buildSwarmCave() {   // a rock cave: a lumpy mound, an arched doorway framed with stones (dark inside, a soft glow), moss on top, boulders round the back. Doorway on local +z, origin on the floor
  const g = new THREE.Group(), mk = (c, e) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, emissive: e, emissiveIntensity: 1, shininess: 12, fog: false });
  const rock = mk(0x9a90b4, 0x2c2a44), rock2 = mk(0x7f7aa0, 0x232038), moss = mk(0x6cc58a, 0x1d4a30), dark = new THREE.MeshBasicMaterial({ color: 0x02050a, fog: false, side: THREE.DoubleSide });
  const bump = (geo, k, sd) => { const P = geo.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const n = 1 + k * (Math.sin(v.x * 4.3 + sd) * Math.cos(v.z * 3.9 + sd * 1.7) * .6 + Math.sin(v.y * 5.1 + sd * .7) * .4); P.setXYZ(i, v.x * n, v.y * n, v.z * n); } geo.computeVertexNormals(); return geo; };
  const mound = new THREE.Mesh(bump(new THREE.IcosahedronGeometry(1, 2), .09, 1.3), rock); mound.scale.set(1.25, .9, 1.05); g.add(mound);
  const door = new THREE.Mesh(new THREE.ShapeGeometry((() => { const sh = new THREE.Shape(); sh.moveTo(-.36, 0); sh.lineTo(-.36, .34); sh.absarc(0, .34, .36, Math.PI, 0, true); sh.lineTo(.36, 0); sh.closePath(); return sh; })(), 20), dark); door.position.set(0, .02, .985); g.add(door);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: fvSoft(), color: 0x7fd8ff, transparent: true, opacity: .4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); gl.position.set(0, .34, 1.0); g.add(gl);
  const stone = (x, y, z, r, m2) => { const q = new THREE.Mesh(bump(new THREE.IcosahedronGeometry(r, 1), .16, x * 7 + y * 3), m2 || rock); q.position.set(x, y, z); q.scale.set(1, .85, .9); q.rotation.set(rand(0, 3), rand(0, 3), 0); g.add(q); };
  for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; stone(Math.cos(a) * .43, .36 + Math.sin(a) * .5, .93 + Math.sin(a) * .02, .1 + .05 * Math.sin(k * 2.3) ** 2); }
  stone(-.43, .2, .94, .13); stone(.43, .2, .94, .13); stone(-.45, .02, .95, .12); stone(.45, .02, .95, .12);
  for (const [x, z, r] of [[-.5, -.2, .17], [.35, -.35, .2], [.65, .1, .15], [-.1, .05, .18], [-.75, .25, .13]]) { const y = .9 * Math.sqrt(Math.max(.05, 1 - x * x / 1.5625 - z * z / 1.1025)) - .03; const m = new THREE.Mesh(bump(new THREE.IcosahedronGeometry(r, 1), .2, x * 5), moss); m.position.set(x, y, z); m.scale.set(1, .55, 1); g.add(m); }
  for (let k = 0; k < 7; k++) { const a = 2.3 + k / 6 * 3.7, r = .12 + .1 * Math.abs(Math.sin(k * 1.9)); stone(Math.cos(a) * 1.3, r * .4, Math.sin(a) * 1.1, r, rock2); }
  for (const [x, z, r] of [[-.45, 1.3, .08], [.5, 1.4, .1], [.15, 1.55, .07]]) stone(x, r * .3, z, r, rock2);
  g.userData.mouthL = new THREE.Vector3(0, .34, 1.15); return g;
}
function swarmHouseRemove() {
  const S = swarm; if (S.house) { scene.remove(S.house); S.house.traverse(n => { if (n.geometry) n.geometry.dispose(); }); S.house = null; }
  if (S.hidden && S.hidden.length) { const g = themeG[S.hidTheme]; for (const c of S.hidden) c.visible = true; if (g) { delete g.userData.cols; delete g.userData.allBoxes; if (g.userData.hAll) { g.userData.houses.length = 0; g.userData.houses.push(...g.userData.hAll); } } } S.hidden = [];
  if (S.hcols && S.hbox) { const i = S.hcols.indexOf(S.hbox); if (i >= 0) S.hcols.splice(i, 1); } S.hcols = S.hbox = null;
}
function decorBoxes(i) {   /* every decoration of the look (soft ones like kelp and corals too), as boxes in tank space: the cave must not stand in any of them */
  const g = themeG[i]; if (!g) return []; if (g.userData.allBoxes) return g.userData.allBoxes;
  const s0 = tank.scale.clone(); tank.scale.set(1, 1, 1); tank.updateMatrixWorld(true);
  const out = [], bx = new THREE.Box3(), sz = new THREE.Vector3();
  for (const c of g.children) { if (!c.visible) continue; bx.setFromObject(c); if (bx.isEmpty()) continue; bx.getSize(sz); if (Math.max(sz.x, sz.y, sz.z) < .2 || (sz.y < .12 && Math.max(sz.x, sz.z) > 3)) continue; out.push(bx.clone()); }
  tank.scale.copy(s0); tank.updateMatrixWorld(true); g.userData.allBoxes = out; return out;
}
function swarmHouseSetup() {   /* the cave stands in the tank for the whole level (only levels with the swarm): on the far side from the camera, its doorway to the front, clear of the decor and the pipe; the other fish swim round it */
  swarmHouseRemove(); if (!G || !G.cfg || !G.cfg.swarm) return;
  const tg = themeG[curTheme], hide = c => { if (!c.visible) return; c.visible = false; swarm.hidden.push(c); }, dropCaches = () => { if (!tg) return; delete tg.userData.cols; delete tg.userData.allBoxes; if (tg.userData.hAll) { tg.userData.houses.length = 0; tg.userData.houses.push(...tg.userData.hAll.filter(h => !h.src || h.src.g.visible)); } };
  swarm.hidden = []; swarm.hidTheme = curTheme; if (tg) { if (!tg.userData.hAll && tg.userData.houses) tg.userData.hAll = tg.userData.houses.slice(); for (const c of tg.children) if (c.userData.pl && Math.random() < .35) hide(c); dropCaches(); }   /* levels with the cave have fewer decorations: a third are left out, and any that would stand in the cave */
  const boxes0 = themeBoxes(curTheme), decor = decorBoxes(curTheme), cam0 = Math.atan2(cam.position.z, cam.position.x) + Math.PI, pipe = G.cfg.tube ? (tubeW(_pa.set(3.45, 1.8, 0)), _pa.clone()) : null, FP = 1.55;
  let best = null;
  for (let i = 0; i < 72; i++) for (const rf of [.5, .58, .66]) {
    const a = i / 72 * 6.2832, rr = RF * rf, x = Math.cos(a) * rr, z = Math.sin(a) * rr; let bad = 0;
    for (let t = 0; t < 12; t++) { const px = x + Math.cos(t / 12 * 6.2832) * FP * .95, pz = z + Math.sin(t / 12 * 6.2832) * FP * .95; if (Math.hypot(px, pz) > wallAt(px, pz, FLOOR_Y + .3) - .1) { bad += 3; break; } }
    if (pipe && Math.hypot(x - pipe.x, z - pipe.z) < 2.1) bad += 2;
    for (const b of decor) { if (b.min.y > 1.7) continue; const dx = Math.max(b.min.x - x, 0, x - b.max.x), dz = Math.max(b.min.z - z, 0, z - b.max.z); if (Math.hypot(dx, dz) < FP) bad += 1; }
    const sc = bad * 10 + Math.abs(((a - cam0 + 9.4248) % 6.2832) - 3.1416) + Math.abs(rf - .58);
    if (!best || sc < best.sc) best = { sc, a, rr };
  }
  const x = Math.cos(best.a) * best.rr, z = Math.sin(best.a) * best.rr;
  if (tg) { const bb = new THREE.Box3(), s0 = tank.scale.clone(); tank.scale.set(1, 1, 1); tank.updateMatrixWorld(true); for (const c of tg.children) { if (!c.visible) continue; bb.setFromObject(c); if (bb.isEmpty() || bb.min.y > 1.7) continue; const dx = Math.max(bb.min.x - x, 0, x - bb.max.x), dz = Math.max(bb.min.z - z, 0, z - bb.max.z); if (Math.hypot(dx, dz) < FP && Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) < 3) hide(c); } tank.scale.copy(s0); tank.updateMatrixWorld(true); dropCaches(); }
  const boxes = themeBoxes(curTheme), h = buildSwarmCave();
  h.position.set(x, FLOOR_Y + .02, z); h.lookAt(0, h.position.y, 0); h.scale.setScalar(SWARM_HS); h.updateMatrixWorld(true); h.userData.mouth = h.localToWorld(h.userData.mouthL.clone());
  h.renderOrder = 5; scene.add(h); swarm.house = h;
  const bx = new THREE.Box3().setFromObject(h); bx.min.y = FLOOR_Y; bx.max.y = FLOOR_Y + 1.1; bx.expandByScalar(.05); swarm.hbox = bx; swarm.hcols = boxes; boxes.push(bx);
}
function swarmClear() { for (const m of swarm.meshes) { fishRoot.remove(m); m.dispose(); m.material.dispose(); } swarm.meshes = []; swarm.fish = []; swarm.on = false; }
function swOff(f, u, out, F, wgt) {   /* a fish's place in the school: a dense, elongated body that moves as one (offsets are in the leader's own frame: along its heading, across, up), so the fish keep their neighbours like a real shoal; it grows out of a single-file stream at the doorway and gathers back into it */
  const k = 1 + .05 * Math.sin(1.3 * u + f.ph) * wgt, ax = f.off.x * SWARM_LX * k * wgt, az = f.off.z * (SWARM_LZ * k * wgt + .34 * (1 - wgt));
  out.x += F.x * ax - F.z * az; out.z += F.z * ax + F.x * az; out.y += f.off.y * (SWARM_LY * k * wgt + .26 * (1 - wgt)) + Math.sin(u * 2.1 + f.ph) * .06 * wgt;   /* at the doorway the fish come out side by side and one above another, not in a line */
}
const SWARM = { geo: null, tex: null, p: null }, SWARM_KEY = 'brown_stripe', SWARM_H = .85, SWARM_W = .7, SWARM_HS = 1, SWARM_LX = 2.2, SWARM_LY = .8, SWARM_LZ = .75;   /* SWARM_HS: size of the cave */
function loadSwarmFish() {   // one of the ordinary fish (brown_stripe, ~1000 triangles), taken from its static mesh and drawn in grey: the whole school is made of it
  if (SWARM.p) return SWARM.p;
  SWARM.p = loadFish([SWARM_KEY]).then(() => {
    const M = MODEL3D['fish_' + SWARM_KEY]; if (!M) throw new Error('no swarm model');
    const g = M.geo.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'uv' && k !== 'normal') g.deleteAttribute(k);
    g.computeBoundingBox(); const b = g.boundingBox, c = b.getCenter(new THREE.Vector3()), L = b.max.x - b.min.x; g.translate(-c.x, -c.y, -c.z); g.scale(1 / L, SWARM_H / L, SWARM_W / L);   /* length 1, centred, nose to +x; flattened: the real fish are plump and tall-finned, a school of them has to be slim */
    const im = M.img, cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const cg = cv.getContext('2d'); try { cg.filter = 'grayscale(1) contrast(1.25) brightness(1.05)'; } catch (e) { } cg.drawImage(im, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.flipY = M.tex.flipY; t.anisotropy = 4; SWARM.geo = g; SWARM.tex = t;
  }).catch(e => { console.warn('swarm fish not loaded', e); SWARM.p = null; });
  return SWARM.p;
}
setTimeout(loadSwarmFish, 6000); setTimeout(loadOctopus, 5000); setTimeout(loadClam, 5200); setTimeout(loadJelly, 5500);   /* after the first level is up */
const _swGeo = new Map();
function swarmGeo(art) { if (_swGeo.has(art)) return _swGeo.get(art); const L = art.hx * 2.1, g = SWARM.geo.clone(); g.scale(L, L, L); g.userData.hx = L / 2; _swGeo.set(art, g); return g; }   // the model, as long as the species' picture was
function swarmMat(art) {   // grey, lit; the tail sways in the vertex shader, each fish at its own phase
  const hx = swarmGeo(art).userData.hx, m = new THREE.MeshPhongMaterial({ map: SWARM.tex, alphaTest: .5, emissive: 0x7a828a, emissiveIntensity: .22, shininess: 40, specular: 0x334455, side: THREE.DoubleSide, fog: false });
  m.onBeforeCompile = sh => { sh.uniforms.uTime = U.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
    `vec3 transformed = vec3(position);\n #ifdef USE_INSTANCING\n float swPh = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 2.3 + instanceMatrix[3].y * 1.7;\n #else\n float swPh = 0.;\n #endif\n float swT = smoothstep(.15, -1., position.x / ${hx.toFixed(4)});\n transformed.z += sin(uTime * 14. - position.x / ${hx.toFixed(4)} * 5. + swPh) * swT * ${(hx * .2).toFixed(4)};`); };
  return m;
}
function swarmStart() {
  if (!SWARM.geo || !swarm.house) return; swarmClear(); const N = 600, D = 18;   // fixed: 500 fish, each out for 18 s
  const small = []; for (const i of BASE) if (!((SPECIES[i].len || 0) >= .8) && FISHART[SPECIES[i].id]) small.push(i); const types = shuffle(small).slice(0, 2);
  const house = swarm.house; if (!house) return; const H = house.userData.mouth.clone(), nrm = new THREE.Vector3(0, 0, 1).transformDirection(house.matrixWorld), Hin = house.localToWorld(new THREE.Vector3(0, .34, .55)), E = Hin.clone().addScaledVector(nrm, 2.0 * SWARM_HS + .4);   // the school starts inside the cave behind the doorway, leaves along its normal and comes back the same way   // the school comes out of the cave standing in the tank
  Object.assign(swarm, { on: true, t: 0, house, D, H, Hin, E, th0: Math.atan2(E.z, E.x), sgn: Math.random() < .5 ? 1 : -1, w: .9, ph: [rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)], N, spread: 4.5 });
  const live = G.things.filter(o => o.kind === 'fish' && o.alive && !o.big), needL = live.filter(o => G.need && G.need.has(o.type)), pickAnchor = () => (needL.length && Math.random() < .55 ? pick(needL) : pick(live));   // half of the swarm clings to the fish you are looking for
  types.forEach((ty, k) => { const art = FISHART[SPECIES[ty].id], n = k ? N >> 1 : N - (N >> 1);
    const mat = swarmMat(art);
    const m = new THREE.InstancedMesh(swarmGeo(art), mat, n); m.frustumCulled = false; m.renderOrder = 6; const c = new THREE.Color();
    for (let i = 0; i < n; i++) { m.setColorAt(i, c.setRGB(1, 1, 1).multiplyScalar(rand(.8, 1.1))); swarm.fish.push({ m, i, d: .5 + rand(0, swarm.spread), off: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(Math.cbrt(Math.random())), ph: rand(0, 6.28), sz: rand(.46, .69), anchor: live.length && Math.random() < .2 ? pickAnchor() : null, ar: rand(.35, 1.0), aw: rand(.7, 1) }); }
    m.instanceColor.needsUpdate = true; fishRoot.add(m); swarm.meshes.push(m); });
}
const _swF = new THREE.Vector3(), _swL = new THREE.Vector3(), _swH = new THREE.Vector3(), _swA = new THREE.Vector3(), _sw = new THREE.Vector3(), _sw2 = new THREE.Vector3(), _swM = new THREE.Matrix4(), _swQ = new THREE.Quaternion(), _swE = new THREE.Euler(), _swS = new THREE.Vector3();
function swarmPath(u, out) {   // the leader's trajectory u seconds after leaving home: out of the doorway (straight along its normal), whirl round, back in the same way
  const S = swarm, TA = 1.1, TB = 2.4, D = S.D, th = S.th0 + S.sgn * S.w * u, r = RF * (.6 + .26 * Math.sin(.9 * u + S.ph[0])), y = (FLOOR_Y + WATER_Y) / 2 + 1.45 * Math.sin(.65 * u + S.ph[1]);
  out.set(Math.cos(th) * r, y, Math.sin(th) * r);
  const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  if (u < TA) out.lerpVectors(S.Hin, S.E, sm(u / TA)); else if (u < TA + TB) out.lerpVectors(S.E, out, sm((u - TA) / TB));
  else if (u > D - TA) out.lerpVectors(S.E, S.Hin, sm((u - (D - TA)) / TA)); else if (u > D - TA - TB) out.lerpVectors(out, S.E, sm((u - (D - TA - TB)) / TB));
  return out;
}
function swarmFit(v) { const r = Math.hypot(v.x, v.z), lim = wallAt(v.x, v.z, v.y) - .3; if (r > lim) { v.x *= lim / r; v.z *= lim / r; } v.y = clamp(v.y, FLOOR_Y + .25, WATER_Y - .25); }   // keep every swarm fish inside the glass and under the surface
function swarmUpdate(dt) {
  if (!G || G.status !== 'play') return; const now = U.uTime.value - G.t0;
  if (!swarm.on) { if (G.cfg.swarm && tube.state !== 'rumble' && tube.state !== 'emit' && now > G.nextSwarm && evFreeNow() && !EVT.cur && !feed.on && !rock && !introOn && !guide.on && !camTutBusy()) swarmStart(); return; }
  swarm.t += dt; const S = swarm, T = S.t, tot = S.D + S.spread + .5;
  if (T > tot) { swarmClear(); evCool(); G.nextSwarm = now + rand(...G.cfg.swarmGap); return; }
  for (const f of S.fish) {
    const u = T - f.d; if (u <= 0 || u >= S.D) { _swS.setScalar(0); _swM.compose(_sw.set(0, -9, 0), _swQ.identity(), _swS); f.m.setMatrixAt(f.i, _swM); continue; }
    swarmPath(u, _sw); swarmPath(u + .06, _sw2); _swL.subVectors(_sw2, _sw); const vis = Math.min(1, u / .2, (S.D - u) / .2), wg = clamp(Math.min((u - .9) / 2.4, (S.D - u - .9) / 2.4), 0, 1), wgt = wg * wg * (3 - 2 * wg);
    _swF.set(_swL.x, 0, _swL.z); if (_swF.lengthSq() < 1e-8) _swF.set(1, 0, 0); _swF.normalize(); swOff(f, u, _sw, _swF, wgt); _sw2.copy(_sw); if (f.anchor && f.anchor.alive && !f.anchor.gone) {   // cling to a real fish: swirl round it wherever it goes (also while the school crowds the food)
      const ramp = clamp(Math.min((u - 1.2) / 2, (S.D - u - 1.2) / 2), 0, 1) * f.aw, A = f.anchor.pos, q = (uu, out, base) => { const a = f.ph + S.sgn * uu * 1.7; return base.lerp(out.set(A.x + Math.cos(a) * f.ar, A.y + Math.sin(a * 1.3) * f.ar * .7, A.z + Math.sin(a) * f.ar), ramp); };
      q(u, _swA, _sw); q(u + .06, _swA, _sw2); }
    swarmFit(_sw); swarmFit(_sw2); _sw2.sub(_sw);
    _swH.copy(_swL);   /* heading: exactly the way the whole school goes (no own whirl, no wobble), so they swim as one school */
    const yaw = Math.atan2(-_swH.z, _swH.x), pitch = Math.asin(clamp(_swH.y / (_swH.length() || 1), -1, 1)) * .8;
    _swE.set(0, yaw, pitch, 'YZX'); _swQ.setFromEuler(_swE); _swS.setScalar(f.sz * vis); _swM.compose(_sw, _swQ, _swS); f.m.setMatrixAt(f.i, _swM);
  }
  for (const m of S.meshes) m.instanceMatrix.needsUpdate = true;
}
const camTutBusy = () => camTut.step === 'rot' || camTut.step === 'zoom' || camTut.step === 'tilt';

function resetEvents() {
  swarmClear();
  rockClear(); evItemClear(); if (EVT.cur) { for (const o of EVT.cur.m) { o.evOn = false; o.evTight = false; o.evPin = null; } EVT.cur = null; } document.querySelectorAll('.evb').forEach(x => x.remove()); cheerClear(); cheerClear();
  for (const k of inks) { fishRoot.remove(k.grp); k.puffs.forEach(p => { p.material.dispose(); p.geometry.dispose(); }); } inks.length = 0;
  feed.on = false; if (feed.mesh) { feed.mesh.visible = false; feed.hand.visible = false; }
}

/* ============================== targets / backup UI ============================== */
const boxEls = [];
function buildTargetsDom() {
  const host = $('targets'); host.innerHTML = ''; boxEls.length = 0;
  for (let i = 0; i < NT; i++) {
    const d = document.createElement('div'); d.className = 'target empty';
    d.innerHTML = '<div class="board"><img class="sig" alt=""><b>×3</b></div>' +
      '<div class="aq"><em class="rays"></em><em class="wv"></em><em class="wv w2"></em><em class="mote m1"></em><em class="mote m2"></em><em class="mote m3"></em><em class="mote m4"></em><div class="bub"></div><div class="bub"></div><div class="bub b3"></div><div class="bub b4"></div><div class="bub b5"></div><div class="slots"><span><img alt=""></span><span><img alt=""></span><span><img alt=""></span></div><div class="sand"><i></i><i></i><i></i></div><em class="caus"></em><em class="glint"></em></div><div class="base"></div>';
    host.appendChild(d); boxEls.push({ root: d, sig: d.querySelector('.sig'), aq: d.querySelector('.aq'), cnt: d.querySelector('.board b'), slotEls: [...d.querySelectorAll('.slots span')], imgs: [...d.querySelectorAll('.slots img')], shownPrev: 0 });
  }
}
function updateBox(i) {
  const t = G.targets[i], b = boxEls[i];
  if (!t) { b.root.className = 'target empty'; b.sig.removeAttribute('src'); b.imgs.forEach(im => { im.removeAttribute('src'); im.className = ''; }); return; }
  const src = THUMB[SPECIES[t.type].id]; b.sig.src = src;
  const left = perOf(t.type) - t.shown, ct = '×' + left; if (b.cnt.textContent !== ct) { b.cnt.textContent = ct; b.cnt.classList.remove('tick'); void b.cnt.offsetWidth; b.cnt.classList.add('tick'); }
  b.slotEls.forEach((s, k) => { s.style.display = k < perOf(t.type) ? '' : 'none'; });
  b.imgs.forEach((im, k) => { im.src = src; im.className = k < t.shown ? 'gone' : 'ghost'; });
}
function pickNextType() {
  if (!G.remaining.length) return null;
  const active = new Set(G.targets.filter(Boolean).map(t => t.type));
  let idx = G.remaining.findIndex(t => !active.has(t)); if (idx < 0) idx = 0;
  return G.remaining.splice(idx, 1)[0];
}
function assignTarget(i, initial) {
  const type = pickNextType();
  if (type == null) { G.targets[i] = null; updateBox(i); return; }
  const t = { type, count: 0, shown: 0, done: false, res: [] }; G.targets[i] = t; tankFx.revive(i);
  const b = boxEls[i]; b.root.className = 'target'; updateBox(i); void b.root.offsetWidth;
  b.root.classList.add('pop'); b.root.style.animationDelay = initial ? `${i * .12}s` : '0s'; setTimeout(() => b.root.classList.remove('pop'), 900);
  const gi = gid; setTimeout(() => { if (gi === gid) pullFromBackup(i); }, initial ? 0 : 500);
}
function pullFromBackup(i) {
  const t = G.targets[i]; if (!t || t.done || G.status !== 'play') return;
  const need = perOf(t.type) - t.count; if (need <= 0) return;
  const idxs = []; G.backup.forEach((it, k) => { if (!it.junk && it.landed && it.res && it.type === t.type && idxs.length < need) idxs.push(k); });
  if (!idxs.length) return;
  const slots = [...$('backup').querySelectorAll('.slot')]; const info = idxs.map(k => ({ r: slots[k].getBoundingClientRect(), sp: G.backup[k].res }));
  G.backup = G.backup.filter((_, k) => !idxs.includes(k)); renderBackup();
  info.forEach((n, j) => giveToTarget(i, { x: n.r.left + n.r.width / 2, y: n.r.top + n.r.height / 2 }, j * 140, n.r.width * .9, n.sp));
}
/* ---------- the combo cheers (NICE! GREAT! SUPER! WOW!): the painted word is a flexible sheet in the overlay scene: it pops in with a yaw swing, ripples like a water surface (a wave runs along the letters), glints, then floats up and fades; the higher the word, the bigger the wave, the more bubbles ---------- */
const CHEER = { list: [], tex: {}, win: null, lv: null, P: {
  nice:  { w: 165, amp: 4.5,  hold: .95, bub: 5,  spk: 0, col: 0xbff4ff },
  great: { w: 180, amp: 6,  hold: 1.05, bub: 9,  spk: 2, col: 0xc8ff9a },
  super: { w: 200, amp: 7.5, hold: 1.2,  bub: 13, spk: 5, col: 0xffe08a },
  wow:   { w: 225, amp: 10, hold: 1.35, bub: 18, spk: 9, col: 0xffb0f0 } } };
const CHEER_VS = `uniform float uT, uAmp, uTilt, uHW; varying vec2 vUv; varying float vSl;
void main(){ vUv = uv; vec3 p = position; float u = p.x / uHW;
  float ph = u * 3.4 - uT * 7.5, env = uAmp * (1. - .65 * smoothstep(0., 1.4, uT));
  p.y += sin(ph) * env * (.6 + .4 * cos(u * 1.6)); p.x += cos(ph) * env * .3; vSl = cos(ph) * env / max(uAmp, 1.);
  float c = cos(uTilt), s = sin(uTilt), z = p.x * s; p.x *= c; float k = 1. / (1. - z / (uHW * 4.5)); p.x *= k; p.y *= k;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`;
const CHEER_FS = `uniform sampler2D uMap; uniform float uT, uA; varying vec2 vUv; varying float vSl;
void main(){ vec4 t = texture2D(uMap, vUv); float sh = smoothstep(.16, 0., abs(vUv.x - (uT * 1.5 - .25) - (vUv.y - .5) * .35));
  vec3 col = t.rgb + vec3(.08, .1, .12) * max(vSl, 0.) * t.a + vec3(1.) * sh * .2 * t.a; col = min(col, vec3(1.));
  gl_FragColor = vec4(col, t.a * uA);
  #include <colorspace_fragment>
}`;
function cheerTex(k) { let t = CHEER.tex[k]; if (!t) { t = CHEER.tex[k] = new THREE.TextureLoader().load(new URL('ui/' + k + '.png', document.baseURI).href, () => { t.userData.ok = true; }); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData = {}; } return t; }
function cheerPop(word, n, from) {
  const P = CHEER.P[word], tex = cheerTex(word); if (!tex.userData.ok || !tex.image) return;
  const ar = document.getElementById('app').getBoundingClientRect(), w = Math.min(P.w * (1 + Math.min(n, 12) * .008), ar.width * .68), h = w * tex.image.height / tex.image.width, hw = w / 2 * 1.12 + P.amp;
  const x = clamp(from.x, ar.left + hw + 6, ar.right - hw - 6), y = from.center ? clamp(from.y, h / 2 + 8, ov.H - h / 2) : clamp(from.y - h * .55, h / 2 + 96, ov.H - h);   // always whole on the screen, wherever the fish was tapped
  const mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: tex }, uT: { value: 0 }, uAmp: { value: 0 }, uTilt: { value: -1 }, uHW: { value: w / 2 }, uA: { value: 0 } }, transparent: true, depthWrite: false, vertexShader: CHEER_VS, fragmentShader: CHEER_FS });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 36, 8), mat); mesh.renderOrder = 30; mesh.position.set(x - ov.W / 2, ov.H / 2 - y, 80); ov.scene.add(mesh);
  const lab = null;
  CHEER.list.push({ word, P, mesh, mat, lab, x, y, w, h, t: 0, n });
  const cols = [P.col, 0xffffff]; for (let q = 0; q < P.bub; q++) ovFx.emit(x + rand(-w * .42, w * .42), y + rand(-h * .25, h * .35), 1, rand(40, 110), cols[q & 1], 1);
  for (let q = 0; q < P.spk; q++) ovFx.emit(x + rand(-w * .5, w * .5), y + rand(-h * .4, h * .3), 1, rand(20, 60), 0xfff3b0, 1);
}
const WIN_VS = `uniform float uT, uArc, uHW; varying vec2 vUv; varying float vSl;
void main(){ vUv = uv; vec3 p = position; float u = p.x / uHW;
  float ph = u * 3. - uT * 6., env = 0. * (1. - smoothstep(0., 1.6, uT)); p.y += sin(ph) * env; vSl = cos(ph) * env / 5.;
  float R = uHW / max(uArc, .001), a = u * uArc, r = R + p.y; p.x = r * sin(a); p.y = r * cos(a) - R;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`;
function winTitleUpdate(dt) {   // LEVEL COMPLETE!: the painted title bent along an arch, unrolling into place, rippling like water, then fading (the burst and the confetti are drawn by paintWinText in src/ui/panels.ts)
  const I = window.__winText, tex = cheerTex('level_complete');
  if (!I) { if (CHEER.win) winTitleClear(); return; }
  if (!CHEER.win) {
    if (!tex.userData.ok || !tex.image) return;
    const w = Math.min(ov.W * .64, 290) * 1.1, h = w * tex.image.height / tex.image.width;
    const mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: tex }, uT: { value: 0 }, uArc: { value: 1 }, uHW: { value: w / 2 }, uA: { value: 0 } }, transparent: true, depthWrite: false, vertexShader: WIN_VS, fragmentShader: CHEER_FS });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 56, 12), mat); mesh.renderOrder = 32; ov.scene.add(mesh); CHEER.win = { mesh, mat, w, h };
  }
  const E = CHEER.win, t = (performance.now() - I.t0) / 1000, k = clamp(t / .6, 0, 1), s = k <= 0 ? .01 : 1 + 2.2 * Math.pow(k - 1, 3) + 1.3 * Math.pow(k - 1, 2), fade = 1 - clamp((t - 1.72) / .28, 0, 1);
  E.mat.uniforms.uT.value = t; E.mat.uniforms.uArc.value = .22 + .5 * Math.pow(1 - clamp(t / .7, 0, 1), 2) + .03 * Math.sin(t * 2.4); E.mat.uniforms.uA.value = Math.min(1, t * 8) * fade;
  const cy = ov.H * .36 + Math.sin(t * 1.8) * 4 - clamp((t - 1.72) / .28, 0, 1) * 18;
  E.mesh.position.set(0, ov.H / 2 - cy, 90); E.mesh.scale.set(s * (1 - (1 - k) * .1), s * (1 + (1 - k) * .14), 1); E.mesh.rotation.z = Math.sin(t * 9) * .05 * (1 - clamp(t / .7, 0, 1));
}
const TIERTXT = [null, { fill: '#b98aff', stroke: '#3b1a78' }, { fill: '#ff7a94', stroke: '#6e0f2a' }], LVBONE = [null, new Image(), new Image()];
LVBONE[1].src = new URL('ui/new/lv_bone1.png', document.baseURI).href; LVBONE[2].src = new URL('ui/new/lv_bone2.png', document.baseURI).href;
const LVF = { json: null, img: [0, 1, 2].map(() => new Image()) };   // the painted LEVEL word and 0-9 digits, one sheet per tier (public/ui/new/lv_tier*.png, made by scripts/slice-level-font.py)
fetch(new URL('ui/new/lv_font.json', document.baseURI)).then(r => r.json()).then(j => { LVF.json = j; }).catch(() => { });
LVF.img.forEach((im, t) => { im.src = new URL('ui/new/lv_tier' + t + '.png', document.baseURI).href; });
function lvTitleClear() { const E = CHEER.lv; if (!E) return; ov.scene.remove(E.g); E.mesh.geometry.dispose(); E.mat.map && E.mat.uniforms.uMap.value.dispose(); E.mat.dispose(); CHEER.lv = null; }
const LV_VS = `uniform float uT, uAmp, uHW, uGw, uR; uniform vec2 uC; varying vec2 vUv; varying float vSl;
void main(){ vUv = uv; vec3 p = position; float u = p.x / uHW;
  float ph = u * 3.4 - uT * 7.5, env = uAmp * (1. - .65 * smoothstep(0., 1.4, uT)); p.y += sin(ph) * env; p.x += cos(ph) * env * .3; vSl = cos(ph) * env / max(uAmp, 1.);
  vec2 c = p.xy - uC; float a = uGw * smoothstep(uR, 0., length(c)), cs = cos(a), sn = sin(a); c = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y); p.xy = c + uC;   // at the end the words are wrung into a spiral like the finished tank
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`;
function lvTitleUpdate() {   // "LEVEL N" (with the fish bone(s) of a Hard / Super Hard level) is a flexible sheet in the overlay scene: it floats, a gentle water ripple runs along it, then it swirls into the bubble (the same times as LVT in tankFx)
  const I = window.__lvIntro; if (!I) { if (CHEER.lv) lvTitleClear(); return; }
  const t = (performance.now() - I.t0) / 1000; if (t < 0) return; if (t >= 2.15) { if (CHEER.lv) lvTitleClear(); return; }
  if (CHEER.lv && CHEER.lv.id !== I) lvTitleClear();
  if (!CHEER.lv) {
    const tr = window.__lvTier | 0, C = TIERTXT[tr], bone = LVBONE[tr], hasB = !!(bone && bone.complete && bone.naturalWidth), bw = tr === 2 ? 420 : 236, bh = hasB ? bw * bone.naturalHeight / bone.naturalWidth : 0;
    const J = LVF.json && LVF.json[tr], IM = LVF.img[tr], atlas = !!(J && IM.complete && IM.naturalWidth), th = 120, digs = String(I.n).split('').map(Number);
    let sw = 1, dsc = 1, ww = 0, total = 0; if (atlas) { sw = th / J.word[3]; ww = J.word[2] * sw; dsc = th * .94 / J.d[0][3]; total = ww + 26 + digs.reduce((a, d) => a + J.d[d][2] * dsc - 3, 3); }
    const W = atlas ? Math.max(640, Math.ceil(total) + 60) : 640, H = hasB ? Math.round(bh + th + 40) : th + 50, ty = hasB ? bh + 24 + th / 2 : H / 2;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (hasB) g.drawImage(bone, (W - bw) / 2, 4, bw, bh);
    if (atlas) {
      const OUTC = ['#0a2a5c', '#1c0c4c', '#4a0c1a'][tr] || '#0a2a5c', glyph = (sx, sy, sw, sh, dx, dy, dw, dh) => {   /* a thin dark outline round every letter (drawn as its own shadow in 12 directions), then the letter */
        g.save(); g.shadowColor = OUTC; g.shadowBlur = 0; for (let a = 0; a < 12; a++) { g.shadowOffsetX = Math.cos(a / 12 * 6.2832) * 3.2; g.shadowOffsetY = Math.sin(a / 12 * 6.2832) * 3.2; g.drawImage(IM, sx, sy, sw, sh, dx, dy, dw, dh); } g.restore(); g.drawImage(IM, sx, sy, sw, sh, dx, dy, dw, dh); };
      let x = (W - total) / 2; glyph(J.word[0], J.word[1], J.word[2], J.word[3], x, ty - th / 2, ww, th); x += ww + 26;
      for (const d of digs) { const b = J.d[d], dw = b[2] * dsc, dh = b[3] * dsc; glyph(b[0], b[1], b[2], b[3], x, ty - dh / 2 + 2, dw, dh); x += dw - 3; }
    } else { g.font = '92px "Lilita One", system-ui, sans-serif'; g.lineWidth = 16; g.strokeStyle = C ? C.stroke : '#0a3c6e'; g.strokeText('LEVEL ' + I.n, W / 2, ty); g.fillStyle = C ? C.fill : '#ffffff'; g.fillText('LEVEL ' + I.n, W / 2, ty); }
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; const k = .5, w = W * k, h = H * k;
    const my = (ty - H / 2) * k,   /* the sheet is hung by the MIDDLE OF THE WORDS, not by the middle of the picture: with the fish bones above them (Hard / Super Hard) the whole canvas is taller, and hanging it by its own middle pushed the words below where they sit on a normal level */ mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: tx }, uT: { value: 0 }, uAmp: { value: 0 }, uHW: { value: w / 2 }, uA: { value: 0 }, uGw: { value: 0 }, uR: { value: Math.hypot(w / 2, h / 2) * 1.1 }, uC: { value: new THREE.Vector2(0, -my) } }, transparent: true, depthWrite: false, vertexShader: LV_VS, fragmentShader: CHEER_FS });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 100, 28), mat), grp = new THREE.Group(); mesh.position.y = my; grp.add(mesh); grp.renderOrder = 33; mesh.renderOrder = 33; grp.position.z = 70; ov.scene.add(grp); CHEER.lv = { id: I, g: grp, mesh, mat };
  }
  const E = CHEER.lv, fade = clamp(t / .35, 0, 1), kk = clamp(t / .45, 0, 1), pop = t < .45 ? 1 + 2.70158 * Math.pow(kk - 1, 3) + 1.70158 * Math.pow(kk - 1, 2) : 1;
  let x = ov.W / 2 + Math.sin(t * 1.05) * 4, y = ov.H * .36 + Math.sin(t * 1.7) * 5, sc = Math.max(.001, pop), alpha = fade, gw = 0;
  if (t > 1.5) { const p = clamp((t - 1.5) / .65, 0, 1), e = p * p * (3 - 2 * p); gw = 15 * Math.pow(p, 1.35); sc = Math.max(.02, (1 - e * .92) * (1 + .1 * Math.sin(p * Math.PI))); alpha = 1 - clamp((p - .75) / .25, 0, 1); y -= Math.sin(p * Math.PI) * 14; }
  E.mat.uniforms.uGw.value = gw; E.mat.uniforms.uT.value = t; E.mat.uniforms.uA.value = alpha; E.g.position.set(x - ov.W / 2, ov.H / 2 - y, 70); E.g.scale.setScalar(sc);
}
function winTitleClear() { const E = CHEER.win; if (!E) return; ov.scene.remove(E.mesh); E.mesh.geometry.dispose(); E.mat.dispose(); CHEER.win = null; }
function cheerClear() { winTitleClear(); lvTitleClear(); for (const e of CHEER.list) { ov.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mat.dispose(); if (e.lab) { ov.scene.remove(e.lab); e.lab.geometry.dispose(); e.lab.material.map.dispose(); e.lab.material.dispose(); } } CHEER.list.length = 0; }
function cheerUpdate(dt) {
  winTitleUpdate(dt); lvTitleUpdate();
  const L = CHEER.list; for (let i = L.length - 1; i >= 0; i--) {
    const e = L[i], P = e.P; e.t += dt; const t = e.t, k = clamp(t / .5, 0, 1), s = k <= 0 ? .01 : 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2), out = clamp((t - P.hold) / .5, 0, 1);   // pop in with a soft overshoot
    const sq = (1 - k) * .16, sx = s * (1 - sq * .6), sy = s * (1 + sq) * (1 + .02 * Math.sin(t * 5));
    e.mat.uniforms.uT.value = t; e.mat.uniforms.uTilt.value = -1.05 * Math.pow(1 - k, 2) + .12 * Math.sin(t * 4.2) * Math.exp(-t * 1.6); e.mat.uniforms.uA.value = Math.min(1, t * 7) * (1 - out * out);
    const rise = out * out * 70 + Math.sin(t * 3.6) * 3, scl = 1 - out * .12;
    e.mesh.position.y = e.y !== undefined ? ov.H / 2 - e.y + rise : 0; e.mesh.scale.set(sx * scl, sy * scl, 1);
    if (e.lab) { const lk = clamp((t - .18) / .3, 0, 1), ls = lk <= 0 ? .01 : 1 + 2.2 * Math.pow(lk - 1, 3) + 1.2 * Math.pow(lk - 1, 2); e.lab.scale.setScalar(ls); e.lab.material.opacity = Math.min(1, lk * 3) * (1 - out); e.lab.position.y = ov.H / 2 - e.y - e.h * .5 - 6 + rise; }
    if (t < P.hold && Math.random() < dt * (3 + P.bub * .5)) ovFx.emit(e.x + rand(-e.w * .45, e.w * .45), e.y + e.h * .3, 1, rand(25, 70), Math.random() < .5 ? P.col : 0xffffff, 1);   // bubbles keep rising out of the word
    if (t > P.hold + .55) { ov.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mat.dispose(); if (e.lab) { ov.scene.remove(e.lab); e.lab.geometry.dispose(); e.lab.material.map.dispose(); e.lab.material.dispose(); } L.splice(i, 1); }
  }
}
for (const w of ['nice', 'great', 'super', 'wow', 'level_complete']) cheerTex(w);
const COMBO_MS = 7500;   /* a correct tap this soon after the last one keeps the chain going */
const comboWord = n => n >= 7 ? 'wow' : n >= 5 ? 'super' : n >= 3 ? 'great' : n >= 2 ? 'nice' : '';
const COMBO_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];   /* a major scale up to the octave: each step of the chain is a clear note higher */
const comboStep = n => COMBO_STEPS[Math.min(Math.max(n - 1, 0), COMBO_STEPS.length - 1)];   /* ready for a pitched step sound: nothing plays it yet */
function cheerSpot(i) {   /* the cheer word sits just under the tank the fish went into, above the Backup strip */
  const q = boxEls[i] && boxEls[i].aq.getBoundingClientRect(), b = $('backup').getBoundingClientRect(), a = $('app').getBoundingClientRect(), t = $('targets').getBoundingClientRect();
  const x = q && q.width > 5 ? q.left + q.width / 2 : a.left + a.width / 2, bottom = q && q.height > 5 ? q.bottom : t.bottom;
  return { x, y: b.height > 5 && b.top > bottom ? (bottom + b.top) / 2 : bottom + 26, center: true };
}
function comboHit(from) {   // a correct tap: the chain is counted now (so its window runs from the tap) and the cheer word and the rising sound come at once, where the fish was tapped
  if (G.lastTapP) { const tp = projectToClient(G.lastTapP); if (tp && isFinite(tp.x)) from = tp; }   /* the cheer pops up right where the fish was tapped, at the moment of the tap */
  const now = performance.now(); G.combo = (now < G.comboUntil ? G.combo : 0) + 1; G.comboUntil = now + COMBO_MS; const n = G.combo;
  if (n >= 2) { cheerPop(comboWord(n), n, from); Snd.play('combo', { n: Math.min(4, n - 1) }); }   /* the word and the rising sound together, at the tap; from the fourth step on the top sound plays until the chain breaks */
  return n;
}
function giveToTarget(i, from, delay, size = 56, sprite = null, combo = 0) {
  const t = G.targets[i]; const k = t.count; const slotEl = boxEls[i].slotEls[k]; t.count++; const gi = gid;
  const sp = sprite || makeSprite('fish', null, t.type);
  flySprite(sp, from, slotEl, { delay, size0: size, dur: 720, mode: 'target', onland: () => {
    if (gi !== gid) return; Snd.play('totank'); t.res[k] = sp; t.shown++; updateBox(i); miniSplash(boxEls[i], slotEl); tankFx.splash(i, slotEl.getBoundingClientRect().left + slotEl.getBoundingClientRect().width / 2);
    if (t.shown >= perOf(t.type) && !t.done) { t.done = true; setTimeout(() => { if (gi === gid) completeTarget(i); }, 300); }
  } });
}
function completeTarget(i) {
  if (G.status !== 'play') return;
  if (G.completed + 1 >= G.cfg.goal) winStopEvents();
  G.completed++; updateGoal(true); const gc = gid;   /* the lid shuts first (it starts closing as the last fish lands), then the tank whirls, shrinks into a bubble and flies up into the progress gauge */
  setTimeout(() => { if (gc !== gid || !G) return; Snd.play('tankdone'); boxEls[i].root.classList.add('done'); tankFx.startClear(i); kick(2.5); }, 900);
  if (G.completed >= G.cfg.goal) { G.status = 'won'; winPrep(); clearBackup(true); const gw = gid; setTimeout(() => { if (gw === gid && G && !G.celebrated) { G.celebrated = true; celebrate(); } }, 3500); return; }   // (the celebration starts when the last bubble reaches the gauge)
  const gi = gid, old = G.targets[i]; setTimeout(() => { if (gi !== gid) return; old.res.forEach(ovRemove); old.res = []; if (G.status === 'play' && G.targets[i] === old) assignTarget(i, false); }, 1700);   /* 900 ms of lid and CLEARED! before the swirl, then the same 800 ms as before */
}
function updateGoal(bump) {
  $('goalNow').textContent = G.completed; $('goalFill').style.width = (G.completed / G.cfg.goal * 100) + '%';
  if (bump) { const g = $('goal'); g.classList.remove('bump'); void g.offsetWidth; g.classList.add('bump'); }
}
function renderBackup() {
  const host = $('backup'); let slots = host.querySelectorAll('.slot');
  if (slots.length !== BACKUP_MAX) { slots.forEach(x => x.remove()); for (let i = 0; i < BACKUP_MAX; i++) { const d = document.createElement('div'); d.className = 'slot'; host.appendChild(d); } slots = host.querySelectorAll('.slot'); }
  slots.forEach((d, i) => { const it = G.backup[i]; d.classList.toggle('junk', !!(it && it.junk && !it.filler)); d.classList.toggle('inkfill', !!(it && it.filler)); });
  host.classList.toggle('warn', G.backup.length >= BACKUP_MAX - 1); refreshClearBtn();
}

/* ============================== 3D overlay: flying + resident fish ============================== */
const ov = { canvas: document.createElement('canvas'), W: 1, H: 1, flights: [], sprites: new Set() };
ov.canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:48;pointer-events:none';
ov.wrap = document.createElement('div'); ov.wrap.id = 'ovwrap'; ov.wrap.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:48;pointer-events:none'; ov.wrap.appendChild(ov.canvas); document.body.appendChild(ov.wrap);   // the wrapper is what gets cut to the game frame (the canvas's own clip-path is used by the pop-up holes)
ov.renderer = new THREE.WebGLRenderer({ canvas: ov.canvas, alpha: true, antialias: AA_OV });
ov.renderer.setPixelRatio(prFor());
ov.scene = new THREE.Scene(); ov.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000); ov.cam.position.z = 800;
ov.scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x5a7aa0, 1.7));
{ const dl = new THREE.DirectionalLight(0xffffff, 2.3); dl.position.set(-200, 300, 500); ov.scene.add(dl); const fl = new THREE.DirectionalLight(0x7fd8ff, .8); fl.position.set(300, -100, 300); ov.scene.add(fl); }
function appClip(el) { const a = document.getElementById('app'); if (!a || !el) return; const r = a.getBoundingClientRect(); el.style.clipPath = `inset(${Math.max(0, r.top)}px ${Math.max(0, innerWidth - r.right)}px ${Math.max(0, innerHeight - r.bottom)}px ${Math.max(0, r.left)}px)`; }   // full-window effect layers (the overlay 3D canvas, the curtains, the highlight dim) are cut to the phone-shaped game frame, so nothing spills over the blue side borders
function ovResize() { appClip(ov.wrap); appClip(document.getElementById('spotOv')); ov.W = window.innerWidth; ov.H = window.innerHeight; ov.renderer.setPixelRatio(prFor()); ov.renderer.setSize(ov.W, ov.H, false); Object.assign(ov.cam, { left: -ov.W / 2, right: ov.W / 2, top: ov.H / 2, bottom: -ov.H / 2 }); ov.cam.updateProjectionMatrix(); }
window.addEventListener('resize', ovResize); ovResize();
function makeSprite(kind, id, type, hue) {
  const built = kind === 'fish' ? buildFish(SPECIES[type]) : id === 'urchin' ? buildUrchin() : id === 'squid' ? buildSquid() : buildJelly(hue);
  const holder = new THREE.Group(), model = built.group; holder.rotation.order = 'ZYX'; holder.add(model);
  const box = built.bounds ? built.bounds.clone() : new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3()); model.position.sub(ctr);
  holder.visible = false; ov.scene.add(holder);
  const sp = { holder, model, built, kind, id, sx: size.x, sy: size.y, dim: Math.max(size.x, size.y) / (id === 'jelly' ? 1.15 : 1), ph: Math.random() * 6.28, yaw: 0, age: 0 };   /* (the jellyfish is drawn a little bigger in the Backup and in flight) */ ov.sprites.add(sp); return sp;
}
const BK_RO = -17.5;
function spTop(sp, on) {   /* a fish in flight is drawn above every layer of the overlay (the lids, the tanks, the Backup glass): it leaves the big tank and comes out over everything; once it lands it goes back between the back and the front of its tank */
  if (!!sp.zTop === !!on) return; sp.zTop = !!on; sp.holder.traverse(o => { if (o.isMesh || o.isSprite) { if (o._ro === undefined) o._ro = o.renderOrder; o.renderOrder = on ? 60 : o._ro; const mt = o.material; if (mt && !Array.isArray(mt)) { if (on) { if (o._tr0 === undefined) o._tr0 = mt.transparent; mt.transparent = true; } else if (o._tr0 !== undefined) { mt.transparent = o._tr0; o._tr0 = undefined; } } } });   /* in flight it is drawn in the TRANSPARENT pass too, sorted by renderOrder (60): an opaque animal is drawn before every transparent layer, so the Backup's bars and water (depth test off) were drawn over it and it seemed to go behind the slots */
}
function spPlace(sp, x, y, size, rotZ = 0, yaw = 0, rotX = 0) {
  sp.holder.visible = true; sp.holder.position.set(x - ov.W / 2, ov.H / 2 - y, sp.zTop ? 400 : 0); sp.holder.scale.setScalar(Math.max(.001, size) / sp.dim); sp.holder.rotation.set(rotX, yaw, rotZ);
}
function spFade(sp, a) {   // fades a whole sprite (all its materials), like the boosters fade while the camera moves
  if (!sp._fm) { sp._fm = []; sp.holder.traverse(m => { if (m.material) for (const mt of [].concat(m.material)) if (!sp._fm.some(x => x.m === mt)) sp._fm.push({ m: mt, o: mt.opacity, t: mt.transparent }); }); }
  if (sp._fa !== a) { sp._fa = a; for (const x of sp._fm) { x.m.transparent = a < .995 || x.t; x.m.opacity = x.o * a; } }
  if (a < .02) sp.holder.visible = false;
}
function spAnimate(sp, t, dt, speed) {
  if (sp.kind === 'fish') { if (sp.built.update) sp.built.update(dt * (.55 + speed * .5)); tickBlink(sp, sp.built, t); sp.built.tail.rotation.y = Math.sin(t * 7 * speed + sp.ph) * .55; sp.built.body.rotation.y = Math.sin(t * 7 * speed + sp.ph + 1.2) * .08; }
  else if (sp.id === 'jelly') { const p = (Math.sin(t * 2.2 + sp.ph) + 1) * .5; sp.built.bell.scale.set(1 + p * .12, 1 - p * .22, 1 + p * .12); sp.built.tents.forEach((m, i) => { m.rotation.x = Math.sin(t * 2.2 + i + sp.ph) * .2; m.rotation.z = Math.cos(t * 1.8 + i * 1.3) * .2; }); }
  else if (sp.built.oct) {   /* speed: .6 sitting in the Backup, 3-4.5 flying / thrown at the glass: the arms flail, the push cycle is quick and the arms fly open */
    const pc = clamp((speed - 1) / 3, 0, 1), cy = octoCycle(((t * (1 + 1.6 * pc) / 1.8) + sp.ph) % 1); sp.bkv = (sp.bkv || 0) + ((sp.inBk ? 1 : 0) - (sp.bkv || 0)) * (1 - Math.exp(-dt * 3));
    octoAnim(sp.built, dt, { wt: t * (2.6 + 5 * pc), contract: cy.contract * (1 - sp.bkv), thrust: cy.thrust * .6 * (1 - sp.bkv), glide: cy.glide * (1 - sp.bkv), ink: pc * .55, hp: Math.sin(t * 1.3 + sp.ph) * (.15 + .3 * pc), hr: Math.sin(t * .9 + sp.ph) * (.12 + .3 * pc) }); octoBlink(sp.built, dt);
  }
  else sp.model.rotation.y += dt * .5;
}
/* ============================== 3D tanks in the overlay: the two target tanks and the backup tank ============================== */
const ovFx = (() => {   // small screen-space particles (bubbles, splashes) drawn in the overlay, so they sit above the UI
  const N = 240, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), alp = new Float32Array(N), siz = new Float32Array(N), s0 = new Float32Array(N), vel = new Float32Array(N * 2), life = new Float32Array(N); let head = 0, live = 0;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('alpha', new THREE.BufferAttribute(alp, 1)); geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));
  const mat = new THREE.ShaderMaterial({ uniforms: { uPR: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute vec3 color; attribute float alpha; attribute float size; uniform float uPR; varying vec3 vC; varying float vA; void main(){ vC = color; vA = alpha; gl_PointSize = size * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .12, d) * vA; if (a < .01) discard; gl_FragColor = vec4(vC, a); }' });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 20; ov.scene.add(pts);
  return {
    emit(x, y, n, spd, color = 0xbfeaff, spread = 1) { const c = new THREE.Color(color); for (let k = 0; k < n; k++) { const i = head; head = (head + 1) % N; pos[i * 3] = x - ov.W / 2; pos[i * 3 + 1] = ov.H / 2 - y; pos[i * 3 + 2] = 10; const a = Math.random() * 6.283, v = spd * (.3 + Math.random()); vel[i * 2] = Math.cos(a) * v * spread; vel[i * 2 + 1] = Math.sin(a) * v; life[i] = .5 + Math.random() * .6; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; s0[i] = 4 + Math.random() * 6; } live = 90; },
    update(dt) {
      if (live <= 0) return; live--; mat.uniforms.uPR.value = ov.renderer.getPixelRatio();
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { alp[i] = 0; continue; } live = 90; life[i] -= dt * 1.1; const l = Math.max(0, life[i]);
        vel[i * 2] *= .97; vel[i * 2 + 1] = vel[i * 2 + 1] * .97 + 50 * dt; pos[i * 3] += vel[i * 2] * dt; pos[i * 3 + 1] += vel[i * 2 + 1] * dt; alp[i] = Math.min(1, l * 1.6); siz[i] = s0[i] * (.55 + .45 * l);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.alpha.needsUpdate = true; geo.attributes.size.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    }
  };
})();
const TANK_ART = {};   // the painted tank pictures (public/ui/tanks/*.png)
function loadTankArt() {
  const ld = new THREE.TextureLoader();
  return Promise.all(['target_back', 'target_front', 'backup_back', 'backup_front', 'bubble_orb', 'bubble'].map(n => new Promise(res => ld.load(new URL('ui/tanks/' + n + '.png', document.baseURI).href, t => {
    if (n === 'bubble_orb') {   // the orb is turned from aqua to the green of the progress gauge's water
      const im = t.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); hueRotate(c, -34); t = new THREE.CanvasTexture(c);
    }
    if (n === 'backup_front') {   // a red copy of the glass rim: it fades in and out over the real rim when the backup tank is nearly full
      const im = t.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g2 = c.getContext('2d'); g2.drawImage(im, 0, 0); g2.globalCompositeOperation = 'source-in'; const gr = g2.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, '#ff8f7d'); gr.addColorStop(.5, '#ff3b3b'); gr.addColorStop(1, '#d81a2c'); g2.fillStyle = gr; g2.fillRect(0, 0, c.width, c.height); const rt = new THREE.CanvasTexture(c); rt.colorSpace = THREE.SRGBColorSpace; rt.anisotropy = 4; TANK_ART.backup_front_red = rt;
    }
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TANK_ART[n] = t; res();
  }, undefined, () => res()))));
}
/* ============================== water on the glass of the screen (lose sequence) ==============================
   A thin film of water is simulated on a small grid: a splash leaves a patch of thick water, gravity drains it (thick water runs fast, thin water barely moves),
   the lower edge breaks into tongues that wind around spots where the glass holds on to the water, the head of each stream swells, and what runs out dries up.
   A shader lights the thickness like real water on glass (rim, caustic, highlight). */
const glassWater = (() => {
  const nowS = () => window.__gwNow ?? performance.now() / 1000;   // (the test hook can fix the clock)
  const GW = 200, G = 2.4, STEPS = 3; let GH = 280, K = 1, h, hn, pin, rel, data, tex, mesh = null, end = 0, lastHit = 0;
  function build() {
    GH = Math.max(40, Math.round(GW * ov.H / ov.W)); K = GW / ov.W; const N = GW * GH; h = new Float32Array(N); hn = new Float32Array(N); rel = new Float32Array(N); pin = new Float32Array(N);
    const cw = Math.ceil(GW / 3.5) + 3, ch = Math.ceil(GH / 26) + 3, g = Float32Array.from({ length: cw * ch }, () => Math.random()), sm = t => t * t * (3 - 2 * t);   // where the glass holds the water: smooth noise, stretched downwards so streams follow channels
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const fx = x / 3.5, fy = y / 26, x0 = fx | 0, y0 = fy | 0, tx = sm(fx - x0), ty = sm(fy - y0), q = (j, i) => g[(y0 + j) * cw + x0 + i];
      pin[y * GW + x] = .12 + .5 * ((q(0, 0) * (1 - tx) + q(0, 1) * tx) * (1 - ty) + (q(1, 0) * (1 - tx) + q(1, 1) * tx) * ty); }
    data = new Uint8Array(N * 4); for (let i = 3; i < data.length; i += 4) data[i] = 255;
    tex = new THREE.DataTexture(data, GW, GH, THREE.RGBAFormat); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { uH: { value: tex }, uPx: { value: new THREE.Vector2(1 / GW, 1 / GH) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform sampler2D uH; uniform vec2 uPx; varying vec2 vUv;
        float H(vec2 p){ return texture2D(uH,vec2(p.x,1.-p.y)).r; }
        void main(){ float hh=H(vUv);
          float hx=H(vUv+vec2(uPx.x,0.))-H(vUv-vec2(uPx.x,0.)), hy=H(vUv+vec2(0.,uPx.y))-H(vUv-vec2(0.,uPx.y));
          float m=smoothstep(.06,.2,hh); if(m<.004) discard;
          vec3 n=normalize(vec3(-hx*2.4,-hy*2.4,1.)); vec3 L=normalize(vec3(-.5,.6,.62));
          float diff=dot(n,L); float edge=1.-n.z; float rim=smoothstep(0.,.3,edge);
          vec3 Hh=normalize(L+vec3(0.,0.,1.)); float sp=pow(max(dot(n,Hh),0.),60.);
          float cau=pow(max(-dot(normalize(n.xy+1e-4),L.xy),0.),1.4)*smoothstep(0.,.25,edge);
          vec3 col=vec3(.78,.94,1.)*(.62+.38*clamp(diff,0.,1.));
          col=mix(col,vec3(.22,.55,.88),rim*(diff<0.?.65:.15));
          col+=vec3(.5,.92,1.)*cau*.9+vec3(1.)*sp*1.5;
          float a=m*(.3+.4*rim+.6*sp+.4*cau);
          gl_FragColor=vec4(col,clamp(a,0.,1.)); }` }));
    mesh.scale.set(ov.W, ov.H, 1); mesh.position.z = 120; mesh.renderOrder = 40; mesh.frustumCulled = false; ov.scene.add(mesh);
  }
  function stamp(cx, cy, rad, val, relT) {   // put water on the glass in a soft disc
    const x0 = Math.max(0, Math.floor(cx - rad - 1)), x1 = Math.min(GW - 1, Math.ceil(cx + rad + 1)), y0 = Math.max(0, Math.floor(cy - rad - 1)), y1 = Math.min(GH - 1, Math.ceil(cy + rad + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d = Math.hypot(x - cx, y - cy) / rad; if (d >= 1) continue; const v = val * (1 - .5 * d * d * d), i = y * GW + x; if (v > h[i]) h[i] = v; if (relT > rel[i]) rel[i] = relT; }
  }
  function step(t) {   // gravity drains the thick water downwards; the glass steers it sideways a little
    hn.set(h);
    for (let y = 0; y < GH - 1; y++) for (let x = 0; x < GW; x++) {
      const i = y * GW + x, v = h[i]; if (v < .006 || t < rel[i]) continue; const eff = v - pin[i] * .9; if (eff <= 0) continue;
      const f = Math.min(v * .42, G * eff * eff * eff), xl = x > 0 ? x - 1 : x, xr = x < GW - 1 ? x + 1 : x, j = i + GW;
      let sb = (pin[y * GW + GW + xl] - pin[y * GW + GW + xr]) * 6; sb = sb > .45 ? .45 : sb < -.45 ? -.45 : sb; const fR = f * (sb > 0 ? sb : 0), fL = f * (sb < 0 ? -sb : 0);
      hn[i] -= f; hn[j] += f - fR - fL; hn[y * GW + GW + xl] += fL; hn[y * GW + GW + xr] += fR;
    }
  }
  return {
    get live() { return !!mesh; }, done: () => !mesh || nowS() > end,
    clear() { if (mesh) { ov.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); tex.dispose(); mesh = null; } h = hn = pin = rel = data = null; },
    hit(x, y, r, dwell = .8) {   // a splash hits the glass at (x, y): a thick patch with a ragged edge, tongues thrown outwards and a few droplets; it starts to run when the fish does
      if (!mesh) build(); const t = nowS(); lastHit = t; end = Math.max(end, t + 3); const cx = x * K, cy = y * K, Rc = r * K * .62, rl = t + dwell * .8, p1 = rand(0, 6.28), p2 = rand(0, 6.28);
      const x0 = Math.max(0, Math.floor(cx - Rc * 1.5)), x1 = Math.min(GW - 1, Math.ceil(cx + Rc * 1.5)), y0 = Math.max(0, Math.floor(cy - Rc * 1.5)), y1 = Math.min(GH - 1, Math.ceil(cy + Rc * 1.5));
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const dx = xx - cx, dy = yy - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), R = Rc * (1 + .22 * Math.sin(3 * a + p1) + .13 * Math.sin(5 * a + p2)); if (d >= R) continue;
        const v = .85 * (1 - .6 * Math.pow(d / R, 3)), i = yy * GW + xx; if (v > h[i]) h[i] = v; if (rl > rel[i]) rel[i] = rl; }
      const nf = 11 + ((Math.random() * 5) | 0); for (let k = 0; k < nf; k++) { const a = rand(0, 6.28), len = Rc * rand(.5, 1.5), c = Math.cos(a), s2 = Math.sin(a); for (let u = 0; u <= len; u += .6) stamp(cx + c * (Rc * .75 + u), cy + s2 * (Rc * .75 + u), 1.15 - .35 * u / len, .62 - .2 * u / len, rl); }
      for (let k = 0; k < 10; k++) { const a = rand(0, 6.28), dd = Rc * rand(1.2, 2); stamp(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, rand(1.1, 1.9), .7, rl + rand(0, .3)); }
    },
    feed(x, y, rad) { if (mesh) stamp(x * K, y * K, Math.max(1.5, rad * K), .55, 0); },   // a fish sliding down drags water along with it
    update(dt = .016) {
      if (!mesh || window.__gwFreeze) return; const t = nowS(); for (let s = 0; s < STEPS; s++) { step(t); const q = h; h = hn; hn = q; }
      const boost = t > lastHit + 2.2 ? .9 : 0, D = .05, d1 = dt * .03;
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const i = y * GW + x; let v = h[i];
        if (v >= .004) { const l = x > 0 ? h[i - 1] : v, r2 = x < GW - 1 ? h[i + 1] : v, u = y > 0 ? h[i - GW] : v, d = y < GH - 1 ? h[i + GW] : v; v += D * ((l + r2 + u + d) * .25 - v); v -= dt * ((v < pin[i] ? .14 : 0) + .02 + boost) ; if (v < .003) v = 0; hn[i] = v; } else hn[i] = 0;
        const b = v * 255; data[i * 4] = b > 255 ? 255 : b;
      }
      const q = h; h = hn; hn = q; tex.needsUpdate = true;
    }
  };
})();

const hudAl = () => { const n = performance.now(); return window.__hudFadeT0 ? 1 - Math.min(1, (n - window.__hudFadeT0) / 450) : window.__hudInT0 ? Math.max(0, Math.min(1, (n - window.__hudInT0) / 350)) : 1; };   // the same fade as the top UI row (see Hud.ts): the 3D target tanks and the backup tank follow it
const tankFx = (() => {
  const plane = new THREE.PlaneGeometry(1, 1), tri = new THREE.CircleGeometry(1, 3);
  const S = { list: [], fx: [], wait: [], back: null, shards: [], brk: null, last: 0 };
  const lerp = (a, b, k) => a + (b - a) * k, sm = u => u * u * (3 - 2 * u), nowS = () => performance.now() / 1000;
  // A tank is three flat pictures (water, glass, and a light shimmer) placed one behind the other and tilted a little, so it reads as 3D but looks like the game's own art.
  // Fish are drawn between the back and the front picture.
  const dropFx = (() => {   // crisp water droplets thrown up by a landing fish: each flies in an arc under gravity, stays inside its tank (bounces off the glass walls and the top rim) and, falling back onto the water, leaves a small ring and is gone
    const N = 160, pos = new Float32Array(N * 3), alp = new Float32Array(N), siz = new Float32Array(N), vel = new Float32Array(N * 2), life = new Float32Array(N), s0 = new Float32Array(N), bd = new Float32Array(N * 5), tk = new Int8Array(N).fill(-1); let head = 0, live = 0;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('alpha', new THREE.BufferAttribute(alp, 1)); geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { uPR: { value: 1 } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute float alpha; attribute float size; uniform float uPR; varying float vA; void main(){ vA = alpha; gl_PointSize = size * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'varying float vA; void main(){ vec2 p = gl_PointCoord - .5; float d = length(p); float a = smoothstep(.5, .4, d) * (.3 + .7 * smoothstep(.15, .44, d)) * vA; if (a < .01) discard; gl_FragColor = vec4(mix(vec3(.2, .62, .84), vec3(.9, .99, 1.), smoothstep(.34, .48, d)), a * .95); }' });   // a clear little drop: a faint disk with a brighter rim, drawn normally (not added up into a glowing blob)   // soft light-blue dots added to the picture, like the drops of the big tank
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 21; ov.scene.add(pts);
    return {
      emit(x, y, n, spd, B, jet) { for (let k = 0; k < n; k++) { const i = head; head = (head + 1) % N; pos[i * 3] = x - ov.W / 2 + rand(-14, 14); pos[i * 3 + 1] = ov.H / 2 - y; pos[i * 3 + 2] = 12; const isJet = jet && k < jet, a = Math.PI / 2 + (isJet ? rand(-.14, .14) : rand(-.95, .95)), v = spd * (isJet ? 1.25 + Math.random() * .3 : .45 + Math.random() * .75); vel[i * 2] = Math.cos(a) * v; vel[i * 2 + 1] = Math.sin(a) * v; life[i] = 1.4; s0[i] = isJet ? 4.5 + Math.random() * 2.5 : 2.2 + Math.random() * 3.2;
        if (B) { bd[i * 5] = B.x0 - ov.W / 2; bd[i * 5 + 1] = B.x1 - ov.W / 2; bd[i * 5 + 2] = ov.H / 2 - B.top; bd[i * 5 + 3] = ov.H / 2 - B.surf; bd[i * 5 + 4] = B.idx; tk[i] = B.idx; } else tk[i] = -1; } live = 90; },
      update(dt, onLand) { if (live <= 0) return; live--; mat.uniforms.uPR.value = ov.renderer.getPixelRatio();
        for (let i = 0; i < N; i++) { if (life[i] <= 0) { alp[i] = 0; continue; } live = 90; life[i] -= dt; vel[i * 2 + 1] -= 820 * dt; pos[i * 3] += vel[i * 2] * dt; pos[i * 3 + 1] += vel[i * 2 + 1] * dt; alp[i] = Math.min(1, life[i] * 4); siz[i] = s0[i];
          if (tk[i] >= 0) {
            const x0 = bd[i * 5], x1 = bd[i * 5 + 1], top = bd[i * 5 + 2], sf = bd[i * 5 + 3];
            if (pos[i * 3] < x0) { pos[i * 3] = x0; vel[i * 2] = Math.abs(vel[i * 2]) * .4; } else if (pos[i * 3] > x1) { pos[i * 3] = x1; vel[i * 2] = -Math.abs(vel[i * 2]) * .4; }
            if (pos[i * 3 + 1] > top) { pos[i * 3 + 1] = top; vel[i * 2 + 1] = -Math.abs(vel[i * 2 + 1]) * .25; }
            if (vel[i * 2 + 1] < 0 && pos[i * 3 + 1] <= sf) { life[i] = 0; alp[i] = 0; if (onLand) onLand(tk[i], pos[i * 3] + ov.W / 2 - x0 - ov.W / 2, x1 - x0); }
          } }
        geo.attributes.position.needsUpdate = true; geo.attributes.alpha.needsUpdate = true; geo.attributes.size.needsUpdate = true; }
    };
  })();
  const dropLand = (idx, rel, w) => { const T = S.list[idx]; if (T && T.jar) { T.rx = clamp(rel / w, .05, .95); T.basic.uniforms.uRx.value = T.rx; T.rt = 0; } };   // a droplet fell back: a small ring spreads from where it landed
  const TWIST_VS = 'uniform float uGw; uniform float uAsp; uniform vec2 uOff; varying vec2 vU; void main(){ vU = uv; vec3 p = position + vec3(uOff, 0.); vec2 c = p.xy * vec2(uAsp, 1.); float R = length(vec2(uAsp * .5, .5)) * 1.1 + 1.2 * max(0., uOff.y), r = length(c), a = uGw * smoothstep(R, 0., r), cs = cos(a), sn = sin(a); c = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y); p.xy = c / vec2(uAsp, 1.); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }';   // a finished tank (glass, water and its plate) is twisted like a wrung cloth: the centre turns the most, the twist reaches the whole shape, so the sides curl too
  function frontMat(tex, off) { return new THREE.ShaderMaterial({ uniforms: { uMap: { value: tex }, uA: { value: 1 }, uGw: { value: 0 }, uAsp: { value: 2 }, uOff: { value: off || new THREE.Vector2() } }, transparent: true, depthWrite: false, vertexShader: TWIST_VS, fragmentShader: 'uniform sampler2D uMap; uniform float uA; varying vec2 vU; void main(){ vec4 t = texture2D(uMap, vU); gl_FragColor = vec4(t.rgb, t.a * uA);\n#include <colorspace_fragment>\n}' }); }
  const JAR_FILL = .84;   // the surface of the water in a target tank, as a fraction of its height
  let _tm = null;
  function tankMask() {   // the inside of the glass of a target tank = the silhouette of the painted water picture (so the code water never sticks out), eroded by 2 px
    if (_tm) return _tm; const im = TANK_ART.target_back.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data, W = c.width, H = c.height, o = new Uint8ClampedArray(W * H), E = 3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 255; for (let k = -E; k <= E && m; k += E) for (let q = -E; q <= E; q += E) { const xx = x + q, yy = y + k; if (xx < 0 || yy < 0 || xx >= W || yy >= H || a[(yy * W + xx) * 4 + 3] < 128) { m = 0; break; } } o[y * W + x] = m; }
    for (let k = 0; k < W * H; k++) { a[k * 4] = a[k * 4 + 1] = a[k * 4 + 2] = 255; a[k * 4 + 3] = o[k]; } g.putImageData(d, 0, 0); _tm = new THREE.CanvasTexture(c); _tm.colorSpace = THREE.SRGBColorSpace; return _tm;
  }
  const BOX_EY = 1.7, BOX_EZ = -4.5, BOX_DP = .55;   /* the tank is a box seen from a little above and in front: the eye, and the depth of the box, in units of the height of the water */
  const TANKP = { base: new THREE.TextureLoader().load(new URL('ui/tanks/tank_base.png', document.baseURI).href), rim: new THREE.TextureLoader().load(new URL('ui/tanks/tank_rim.png', document.baseURI).href) }; for (const k in TANKP) { TANKP[k].colorSpace = THREE.SRGBColorSpace; TANKP[k].anisotropy = 4; }   /* the painted base slab and top rim of the target tanks (public/ui/tanks/tank_*.png, made with ChatGPT) */
  function waterMat(mask) {   // the water of a target tank, all in code: a glass box (back wall, side walls, sand floor, surface) seen in perspective, with light shafts, caustics, a rippling surface that sloshes (kicked by every fish that lands)
    return new THREE.ShaderMaterial({ uniforms: { uMask: { value: mask }, uGw: { value: 0 }, uOff: { value: new THREE.Vector2() }, uRx: { value: .5 }, uRt: { value: 99 }, uDr: { value: 0 }, uT: { value: 0 }, uA: { value: 1 }, uTw: { value: 0 }, uSl: { value: 0 }, uAsp: { value: 1 }, uM: { value: mask }, uBase: { value: TANKP.base }, uRim: { value: TANKP.rim } }, transparent: true, depthWrite: false,
      vertexShader: TWIST_VS,
      fragmentShader: `uniform sampler2D uMask, uBase, uRim; uniform float uT, uA, uTw, uSl, uRx, uRt, uDr, uAsp; varying vec2 vU;
        float caus(vec2 p, float t){ float a = sin(p.x * 7. + sin(p.y * 5. + t) * 1.5), b = sin(p.y * 7. + sin(p.x * 4. - t * .8) * 1.5); return pow(1. - abs(a * b), 7.); }
        void main(){ vec2 pc = (vU - .5) * vec2(uAsp, 1.), hf = vec2(uAsp * .5, .5), dq = abs(pc) - hf + .03; float sdf = length(max(dq, vec2(0.))) + min(max(dq.x, dq.y), 0.) - .03, m = smoothstep(.004, -.004, sdf); if (m < .01 || vU.y > .915) discard;   // a plain rectangle with small corners: a real glass tank (the lid is a separate mesh above it)
          vec2 c = (vU - vec2(.5, .45)) * vec2(uAsp, 1.); float r = length(c), tw = uTw * smoothstep(.5, .0, r), cs = cos(tw), sn = sin(tw); vec2 q = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y) / vec2(uAsp, 1.) + vec2(.5, .45);   // the swirl turns in a round space (the tank is wide), the deeper the faster
          float surf = ${JAR_FILL.toFixed(3)} - uDr * .5 + sin(q.x * 9. + uT * 2.2) * .018 + sin(q.x * 4.5 - uT * 1.4) * .022 + sin(q.x * 15. + uT * 3.3 + 1.) * .008 + uSl * (sin(q.x * 7. - uT * 7.) * .03 + (q.x - .5) * sin(uT * 5.5) * .12) + sin((q.x - uRx) * 70. - uRt * 24.) * .014 * exp(-uRt * 2.6) * exp(-abs(q.x - uRx) * 5.);   // uRx/uRt: the ring left by the last droplet that fell back
          vec2 b = vec2((q.x - .012) / .976, (q.y - .13) / .75); float W = max(uAsp, .5); vec3 col; float alpha = m * uA; float vy = vU.y, vx = vU.x; bool frame = true;
          if (vy > .865) {   // the top rim: the painted strip
            float k2 = (vy - .865) / .05; col = mix(vec3(.62, .86, .98), vec3(.93, .99, 1.), smoothstep(.2, 1., k2)); alpha *= .55 + .3 * k2;   // just a thin glass edge (the lid covers it): no painted strip
          } else if (vy < .13) {   // the base: the painted slab
            if (vy < .05) { col = mix(vec3(.18, .38, .62), vec3(.36, .62, .86), vy / .05); }
            else { float k = (vy - .05) / .08; col = mix(vec3(.4, .68, .92), vec3(.7, .9, 1.), k); col += vec3(.6) * smoothstep(.8, 1., k) * .4; col = mix(col, vec3(.25, .5, .78), smoothstep(.3, .0, k) * .35); }
          } else if (vx < .012 || vx > .988) {   // the glass edge at the sides: as thin as the walls of the big tank, mostly clear with a bright line
            float e = vx < .5 ? vx / .012 : (1. - vx) / .012; col = mix(vec3(.95, 1., 1.), vec3(.6, .88, 1.), smoothstep(.2, 1., e)); alpha *= .6;
          } else { frame = false; }
          if (!frame) {
            const float DP = ${BOX_DP.toFixed(3)}; vec3 P0 = vec3(clamp(b.x, 0., 1.) * W, clamp(b.y, 0., 1.), 0.), E = vec3(W * .5, ${BOX_EY.toFixed(3)}, ${BOX_EZ.toFixed(3)}), D = P0 - E; float Ys = (surf - .13) / .75;
            vec3 S = P0; bool viaSurf = false;
            if (P0.y > Ys) { float ts = (Ys - P0.y) / D.y; S = P0 + D * ts; viaSurf = true; if (S.z > DP || S.x < 0. || S.x > W) discard; }
            float tz = (DP - S.z) / D.z, tx = D.x < 0. ? -S.x / D.x : (W - S.x) / D.x, tf = -S.y / D.y, t = min(tz, min(tx, tf)); vec3 H = S + D * t; float zf = clamp(H.z / DP, 0., 1.), depthY = clamp((Ys - H.y) / max(Ys, .1), 0., 1.);
            vec3 shallow = vec3(.42, .88, .9), mid = vec3(.08, .56, .76), deep = vec3(.03, .28, .5);
            if (t == tf) {   // sand floor: warm, rippled, with a net of light from the surface, darker towards the back
              vec3 sc = mix(vec3(.93, .76, .46), vec3(.62, .5, .32), zf); float rip = sin(H.x * 30. + sin(H.z * 9.) * 2.) * .03; col = sc * (1. + rip);
              col = mix(col, mid, .1 + .45 * zf); col += vec3(.75, 1., .95) * caus(H.xz * vec2(1. / W * 2.2, 1.) * 3., uT) * .12 * (1. - zf * .6);
            } else if (t == tz) {   // back wall: bright near the surface, deeper below, with slanted shafts of light and a net of light on the lower part
              col = mix(shallow, mix(mid, deep, smoothstep(.3, 1., depthY)), smoothstep(.0, .55, depthY));
              float shaft = pow(max(0., sin((H.x / W * 2.2 + H.y * .3) * 5. + sin(H.y * 1.5 + uT * .3) * .9 - uT * .2)), 2.) * (1. - depthY * .8); col += vec3(.7, .98, .92) * shaft * .1;
              col += vec3(.6, .95, .95) * caus(H.xy * vec2(1. / W * 2.2, 1.) * 3., uT * .9 + 3.) * .06 * smoothstep(.2, .9, depthY); col *= mix(.72, 1., smoothstep(.0, .3, H.y));
            } else {   // side walls: glass seen edge-on, tinted, lighter near the front, darker as it recedes
              col = mix(mix(vec3(.45, .88, .98), mid, smoothstep(.0, 1., zf)), deep, smoothstep(.4, 1., zf) * .4 + depthY * .2); col += vec3(.7, 1., 1.) * smoothstep(.3, .0, zf) * .14;
            }
            col = mix(col, deep, smoothstep(.0, 1., zf) * .28);   // the far water is hazier
            float mote = pow(max(0., sin(H.x * 21. + H.y * 13. + uT * .6) * sin(H.z * 17. - H.y * 9. - uT * .5)), 14.); col += vec3(.9, 1., 1.) * mote * .22 * (1. - depthY * .5);   // a few specks of light floating in the water
            if (viaSurf) { float rp = sin(S.x * 13. + uT * 2. + sin(S.z * 6. + uT) * 1.6) * sin(S.z * 18. - uT * 1.3); col = mix(col, vec3(.88, 1., 1.), .3 + .25 * smoothstep(.0, .12, S.z)); col += vec3(.7) * smoothstep(.55, 1., rp) * .35; }
            col = mix(col, vec3(1.), smoothstep(.035, .0, abs(P0.y - Ys)) * .6); col = mix(col, vec3(.1, .5, .75), smoothstep(.0, .06, Ys - P0.y) * smoothstep(.12, .05, Ys - P0.y) * .12);   // a bright foam line along the waterline, and a slightly deeper band just under it
            col += vec3(.9, 1., 1.) * smoothstep(.07, .0, abs(vU.x - (.36 + vU.y * .5))) * .07 * smoothstep(.1, .5, vU.y);   // a soft diagonal reflection on the front glass
          }
          col = mix(col, vec3(.02, .38, .66), smoothstep(.16, .0, r) * clamp(uDr * 1.2, 0., .55)) + vec3(.6, .95, 1.) * smoothstep(.05, .0, abs(r - .1 - .1 * uDr)) * clamp(uDr * 1., 0., .45);   // the eye of the whirlpool and a bright ring round it
          gl_FragColor = vec4(col, alpha); }` });
  }
  const CAGE = { img: {}, ready: 0 };   /* the painted steel frame of the Backup (public/ui/tanks/cage_*.png): a rail, a post, a corner and a bar, made with ChatGPT and keyed with scripts/key-cage.py */
  for (const [k, f] of [['h', 'cage_rail_h'], ['v', 'cage_rail_v'], ['c', 'cage_corner'], ['b', 'cage_bar']]) { const im = new Image(); im.onload = () => { CAGE.ready++; }; im.src = new URL('ui/tanks/' + f + '.png', document.baseURI).href; CAGE.img[k] = im; }
  function drawCageFrame(q, FW, FH, arr, barW) {   /* the frame of the Backup on a canvas: the opening is left empty; used by the game, by the Out of space pop-up and by the pieces of the broken tank */
    const pw = .014 * FW, capH = (1 - .905) * FH, baseH = .16 * FH, I = CAGE.img; q.imageSmoothingQuality = 'high';
    for (let k = 1; k < 7; k++) { const x = arr[k] * FW; q.drawImage(I.b, x - barW / 2, capH - 2, barW, FH - capH - baseH + 4); }
    /* only the straight part of each piece is used (no rounded ends, no transparent margin), so the rails, the posts and the corners meet edge to edge */
    q.drawImage(I.h, 29, 7, 1067, 147, pw, 0, FW - 2 * pw, capH); q.drawImage(I.h, 29, 7, 1067, 147, pw, FH - baseH, FW - 2 * pw, baseH); q.drawImage(I.v, 8, 30, 147, 748, 0, capH, pw, FH - capH - baseH); q.drawImage(I.v, 8, 30, 147, 748, FW - pw, capH, pw, FH - capH - baseH);
    const corner = (sx, sy, w, h, tx, ty) => { q.save(); q.translate(tx, ty); q.scale(sx, sy); q.drawImage(I.c, 8, 7, 147, 147, 0, 0, w, h); q.restore(); };
    corner(1, 1, pw, capH, 0, 0); corner(-1, 1, pw, capH, FW, 0); corner(1, -1, pw, baseH, 0, FH); corner(-1, -1, pw, baseH, FW, FH);
  }
  function cageCanvas(W, H, layer) {   /* a picture of the Backup cell: 'back' = the murky water with its floor, 'front' = frame and bars, 'all' = both */
    if (CAGE.ready < 4) return null; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const q = cv.getContext('2d'), pw = .014 * W, capH = (1 - .905) * H, baseH = .16 * H, ix = pw, iy = capH, iw = W - 2 * pw, ih = H - capH - baseH;
    if (layer !== 'front') {
      let gr = q.createLinearGradient(0, iy, 0, iy + ih); gr.addColorStop(0, '#7fb9c2'); gr.addColorStop(.35, '#4d8fa4'); gr.addColorStop(1, '#244f69'); q.fillStyle = gr; q.fillRect(ix, iy, iw, ih);
      gr = q.createLinearGradient(0, iy + ih * .8, 0, iy + ih); gr.addColorStop(0, 'rgba(176,160,128,0)'); gr.addColorStop(1, 'rgba(150,136,110,.95)'); q.fillStyle = gr; q.fillRect(ix, iy + ih * .8, iw, ih * .2);
      q.strokeStyle = 'rgba(235,252,255,.75)'; q.lineWidth = Math.max(2, H * .012); q.beginPath(); for (let x = 0; x <= iw; x += 6) { const y = iy + ih * .1 + Math.sin(x / iw * 12) * ih * .018; x ? q.lineTo(ix + x, y) : q.moveTo(ix, y); } q.stroke();
      q.fillStyle = 'rgba(215,240,246,.2)'; q.fillRect(ix, iy, iw, ih * .1);
      q.strokeStyle = 'rgba(150,170,196,.5)'; q.lineWidth = 2; for (let k = 1; k < 7; k++) { const x = ix + iw * k / 7; q.beginPath(); q.moveTo(x, iy); q.lineTo(x, iy + ih); q.stroke(); }
    }
    if (layer !== 'back') drawCageFrame(q, W, H, Array.from({ length: 8 }, (_, k) => k / 7), Math.max(4, W * .0034));
    return cv;
  }
  function cageFrame(T, arr) {   /* builds the frame texture of the Backup; the canvas never changes size (a texture whose canvas changes size shows twice) */
    if (CAGE.ready < 4 || T.rw < 40) return; const sig = Math.round(T.rw) + 'x' + Math.round(T.rh) + '|' + Array.from(arr).map(v => v.toFixed(3)).join(','); if (sig === T.frameSig || performance.now() - (T.frameT || 0) < 400) return; T.frameSig = sig; T.frameT = performance.now();
    const FW = 1024, FH = 192, cv = T.frameCv || (T.frameCv = document.createElement('canvas')); if (cv.width !== FW || cv.height !== FH) { cv.width = FW; cv.height = FH; } const q = cv.getContext('2d'); q.clearRect(0, 0, FW, FH);
    drawCageFrame(q, FW, FH, arr, Math.max(4, 3.2 / T.rw * FW));
    if (!T.frameTex) { T.frameTex = new THREE.CanvasTexture(cv); T.frameTex.anisotropy = 4; T.cage.uniforms.uFrame.value = T.frameTex; T.cage.uniforms.uHas.value = 1; } T.frameTex.needsUpdate = true;
  }
  function cageMat(pass) {   /* pass 0: the inside of the cell, drawn behind the fish; pass 1: the steel frame and the bars, drawn in front of them, so the fish are really behind bars */   /* the Backup: a holding cell. Steel frame with rivets, a steel lid and base, murky dim water, a row of steel bars in front of the glass, one cell per slot, and a red warning light when it fills up */
    return new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 }, uT: { value: 0 }, uAsp: { value: 7 }, uHot: { value: 0 }, uSl: { value: 0 }, uHas: { value: 0 }, uFrame: { value: null }, uBw: { value: .003 }, uBx: { value: new Float32Array(8).map((_, k) => k / 7) } }, transparent: true, depthWrite: false, defines: { PASS: pass },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform float uA, uT, uAsp, uHot, uSl, uBw, uHas; uniform sampler2D uFrame; uniform float uBx[8]; varying vec2 vU;
        float caus(vec2 p, float t){ float a = sin(p.x * 7. + sin(p.y * 5. + t) * 1.5), b = sin(p.y * 7. + sin(p.x * 4. - t * .8) * 1.5); return pow(1. - abs(a * b), 7.); }
        void main(){ vec2 pc = (vU - .5) * vec2(uAsp, 1.), hf = vec2(uAsp * .5, .5), dq = abs(pc) - hf + .02; float sdf = length(max(dq, vec2(0.))) + min(max(dq.x, dq.y), 0.) - .02, m = smoothstep(.004, -.004, sdf); if (m < .01) discard;
          float vy = vU.y, vx = vU.x; vec3 col; float alpha = m * uA; float pulse = .5 + .5 * sin(uT * 7.); bool frame = false, isBar = false;
          const float OX = .014, OY0 = .16, OY1 = .905; float X = vx * uAsp, ox0 = OX * uAsp, ox1 = (1. - OX) * uAsp;
          float dx = max(max(ox0 - X, X - ox1), 0.), dy = max(max(OY0 - vy, vy - OY1), 0.); frame = dx > 0. || dy > 0.;
          if (frame && uHas > .5) { vec4 ft = texture2D(uFrame, vU); col = ft.rgb; alpha = m * uA * ft.a; if (vy > OY1) col = mix(col, vec3(1., .18, .12), uHot * (.3 + .3 * pulse)); }   // the painted frame (see cageFrame)
          else if (frame) {   // one continuous steel frame round the opening, each side cut at 45 degrees where it meets the next, like a picture frame: a bevelled inner edge, a bright outer rim, an amber stripe that runs all the way round, rivets on the lid and the base
            bool topSide = vy > OY1; float tH = topSide ? 1. - OY1 : OY0, tx = dx / (OX * uAsp), ty = dy / tH; bool onPost = tx >= ty; float k = clamp(onPost ? tx : ty, 0., 1.), along = onPost ? vy : X;
            col = mix(vec3(.34, .44, .6), vec3(.88, .92, .98), smoothstep(.0, .22, k)); col = mix(col, vec3(.62, .7, .83), smoothstep(.45, 1., k)); col += vec3(.5) * smoothstep(.9, 1., k) * .35; col += vec3(.018) * sin(along * 26.);
            col = mix(col, vec3(1., .72, .22), smoothstep(.07, .0, abs(k - .42)) * .9); col += vec3(1., .8, .4) * smoothstep(.12, .0, abs(k - .42)) * .1;
            float seam = smoothstep(.06, .0, abs(tx - ty)) * step(.001, min(tx, ty)); col = mix(col, vec3(.24, .32, .46), seam * .5);   /* the mitre joint at the corners */
            col = mix(col, vec3(.14, .22, .38), smoothstep(.06, .0, k) * .55);   /* the dark line where the frame meets the glass */
            if (!onPost && topSide) col = mix(col, vec3(1., .18, .12), uHot * (.35 + .35 * pulse) * smoothstep(.4, .0, k));
          }
          if (!frame) {
            vec2 b = vec2((vU.x - .014) / .972, (vU.y - .16) / .745); float W = max(uAsp, .5); const float DP = ${BOX_DP.toFixed(3)}; vec3 P0 = vec3(clamp(b.x, 0., 1.) * W, clamp(b.y, 0., 1.), 0.), E = vec3(W * .5, ${BOX_EY.toFixed(3)}, ${BOX_EZ.toFixed(3)}), D = P0 - E; float Ys = .87 + sin(vU.x * 9. + uT * 2.2) * .03 + sin(vU.x * 4.5 - uT * 1.4) * .035 + sin(vU.x * 15. + uT * 3.3 + 1.) * .014 + uSl * (sin(vU.x * 7. - uT * 7.) * .06 + (vU.x - .5) * sin(uT * 5.5) * .16);
            vec3 S = P0; bool viaSurf = false; if (P0.y > Ys) { float ts = (Ys - P0.y) / D.y; S = P0 + D * ts; viaSurf = true; if (S.z > DP || S.x < 0. || S.x > W) discard; }
            float tz = (DP - S.z) / D.z, tx = D.x < 0. ? -S.x / D.x : (W - S.x) / D.x, tf = -S.y / D.y, t = min(tz, min(tx, tf)); vec3 H = S + D * t; float zf = clamp(H.z / DP, 0., 1.), dY = clamp((Ys - H.y) / Ys, 0., 1.);
            if (t == tf) { float gr = fract(sin(dot(floor(H.xz * vec2(60. / W * 2.2, 60.)), vec2(12.9, 78.2))) * 43758.5); col = mix(vec3(.68, .64, .55), vec3(.38, .38, .4), zf) * (.92 + gr * .16); col += vec3(.6, .9, .9) * caus(H.xz * 3., uT * .6) * .06; }
            else if (t == tz) { col = mix(vec3(.46, .72, .76), vec3(.14, .36, .5), smoothstep(.0, .85, dY)); for (int i = 1; i < 7; i++) { float Xk = (uBx[i] - .014) / .972 * W; col = mix(col, vec3(.6, .67, .76), smoothstep(.022, .008, abs(H.x - Xk)) * .8); } }
            else { col = mix(vec3(.42, .68, .74), vec3(.14, .34, .48), smoothstep(.0, 1., zf) * .8 + dY * .2); }
            col = mix(col, vec3(.16, .34, .42), .14 + .22 * zf); col *= .97;
            if (viaSurf) { float rp = sin(S.x * 13. + uT * 2. + sin(S.z * 6. + uT) * 1.6) * sin(S.z * 18. - uT * 1.3); col = mix(col, vec3(.72, .9, .92), .4); col += vec3(.6) * smoothstep(.55, 1., rp) * .3; }
            col = mix(col, vec3(1.), smoothstep(.035, .0, abs(P0.y - Ys)) * .5);
            col = mix(col, vec3(.95, .15, .1), uHot * (.16 + .16 * pulse));
          }
          if (!frame && uHas > .5) { vec4 bt = texture2D(uFrame, vU); if (bt.a > .02) { col = mix(col, bt.rgb, bt.a); alpha = m * uA; isBar = true; } }
          else if (!frame) { for (int i = 1; i < 7; i++) { float w = uBw; float d = abs(vU.x - uBx[i]); if (d < w) { float t2 = d / w; float sh = vU.x > uBx[i] ? 1. : 0.; col = mix(vec3(.98, .99, 1.), vec3(.42, .52, .66), mix(t2 * t2, .35 + .65 * t2, sh)); col = mix(col, vec3(.35, .45, .6), smoothstep(.88, .91, vy) * .5 + smoothstep(.2, .165, vy) * .5); alpha = m * uA; isBar = true; } } }
          #if PASS == 1
          if (!(frame || isBar)) { float by2 = (vU.y - .16) / .745; if (by2 > .86 || by2 < 0.) discard; col = mix(vec3(.5, .8, .9), vec3(.1, .32, .46), clamp((.86 - by2) / .86, 0., 1.) * .8 + .1); alpha = m * uA * (.2 + .14 * clamp((.86 - by2) / .86, 0., 1.)); col += vec3(.5, .8, .9) * caus(vU * vec2(uAsp, 1.) * .8, uT * .6) * .05; }   /* a veil of water IN FRONT of the animals in the cell, so they sit inside the water and not on top of it */
          #else
          if (frame || isBar) discard;
          #endif
          gl_FragColor = vec4(col, alpha); }` });
  }
  const TD = 6;   /* half the depth of a tank in screen pixels: the water picture sits TD behind the middle, the glass picture TD in front, the walls join them */
  const wallMat = k => new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 }, uK: { value: k } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uA; uniform float uK; varying vec2 vU; void main(){ float e = smoothstep(.0, .5, vU.x) * (1. - smoothstep(.5, 1., vU.x)); vec3 c = uK < .5 ? mix(vec3(.2, .62, .92), vec3(.55, .88, 1.), vU.y * .6 + (1. - e) * .4) : vec3(.82, .97, 1.); float a = uK < .5 ? .5 - .22 * e : .75; gl_FragColor = vec4(c, a * uA); }' });
  const shadowTex = glowTexLate(); function glowTexLate() { const c = document.createElement('canvas'); c.width = c.height = 128; const q = c.getContext('2d'), gr = q.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(6,26,66,.55)'); gr.addColorStop(.6, 'rgba(6,26,66,.22)'); gr.addColorStop(1, 'rgba(6,26,66,0)'); q.fillStyle = gr; q.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
  function make(kind) {
    const g = new THREE.Group(), tank = new THREE.Group(), inner = new THREE.Group(); g.add(tank); tank.add(inner);
    const bk = kind === 'backup', A = TANK_ART, jar = !bk, bt = bk ? A.backup_back : jar ? tankMask() : A.target_back, ft = bk ? A.backup_front : A.target_front, mat = t => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
    const pgeo = jar ? new THREE.PlaneGeometry(1, 1, 120, 48) : plane, back = new THREE.Mesh(pgeo, mat(bt)); back.position.z = -TD; back.renderOrder = 1;
    const front = new THREE.Mesh(pgeo, jar ? frontMat(ft) : mat(ft)); front.position.z = TD; front.renderOrder = 3; front.visible = false;
    const shim = new THREE.Mesh(plane, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uM: { value: bt }, uA: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform sampler2D uM; uniform float uT; uniform float uA; varying vec2 vU; void main(){ float m = texture2D(uM, vU).a; float r = pow(sin((vU.x * 5.5 - vU.y * 1.2) - uT * .9) * .5 + .5, 6.); gl_FragColor = vec4(vec3(.85, .97, 1.) * r * .3, m * uA * r * .5); }' })); shim.position.z = -TD - 8; shim.renderOrder = 2; shim.visible = !bk;
    const redT = TANK_ART.backup_front_red || ft, rimMat = add => new THREE.MeshBasicMaterial({ map: redT, transparent: true, opacity: 0, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });   // the red rim (backup tank warning): a red copy of the glass rim that fades in over the real one, plus a soft red bloom
    const rim1 = new THREE.Mesh(plane, rimMat(false)); rim1.position.z = TD + 16; rim1.renderOrder = 4; const rim2 = new THREE.Mesh(plane, rimMat(true)); rim2.position.z = TD + 15; rim2.scale.set(1.03, 1.1, 1); rim2.renderOrder = 4; rim1.visible = rim2.visible = bk;
    const bp = new Float32Array(8 * 3), bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    const bub = new THREE.Points(bg, new THREE.PointsMaterial({ map: dotTex(true), color: 0xffffff, size: 7, sizeAttenuation: false, transparent: true, opacity: .8, depthWrite: false })); bub.frustumCulled = false; bub.renderOrder = 2; bub.visible = !bk;   /* no bubbles in the Backup */
    const crackC = [rand(-.22, .22), rand(-.12, .12)], cr = []; {   // a web of cracks around the impact point: rays that bend, joined by rings; clipped to the tank, ordered from the centre outwards so they can grow
      const A = 5.5, nr = 11, rays = [], segs = [];
      for (let k = 0; k < nr; k++) { let a0 = k / nr * 6.283 + rand(-.25, .25), x = crackC[0], y = crackC[1]; const pts = [[x, y]]; for (let st = 0; st < 9; st++) { a0 += rand(-.3, .3); const L = rand(.1, .2); x += Math.cos(a0) * L / A; y += Math.sin(a0) * L; if (Math.abs(x) > .49 || Math.abs(y) > .49) { x = Math.max(-.49, Math.min(.49, x)); y = Math.max(-.49, Math.min(.49, y)); pts.push([x, y]); break; } pts.push([x, y]); } rays.push(pts); }
      const D = (x, y) => Math.hypot((x - crackC[0]) * A, y - crackC[1]);
      rays.forEach(pts => { for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]); });
      for (const lv of [2, 4, 6]) for (let k = 0; k < nr; k++) { const p1 = rays[k][lv], p2 = rays[(k + 1) % nr][lv]; if (p1 && p2 && Math.random() < .8) { const m = [(p1[0] + p2[0]) / 2 + rand(-.01, .01), (p1[1] + p2[1]) / 2 + rand(-.03, .03)]; segs.push([p1, m], [m, p2]); } }
      segs.sort((u, v) => D((u[0][0] + u[1][0]) / 2, (u[0][1] + u[1][1]) / 2) - D((v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2)); segs.forEach(sg => cr.push(sg[0][0], sg[0][1], 20, sg[1][0], sg[1][1], 20));
    }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cr, 3)); const cracks = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })), cracks2 = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x103a68, transparent: true, opacity: 0 })); cracks.renderOrder = 5; cracks2.renderOrder = 4; cracks2.position.set(.003, -.006, 0); cracks.frustumCulled = cracks2.frustumCulled = false; cg.setDrawRange(0, 0);
    const twirl0 = new THREE.ShaderMaterial({ uniforms: { uM: { value: bt }, uTw: { value: 0 }, uA: { value: 1 }, uAsp: { value: 3 }, uT: { value: 0 } }, transparent: true, depthWrite: false,   // the water pictures swirls down a drain while a tank is cleared
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform sampler2D uM; uniform float uTw; uniform float uA; uniform float uAsp; uniform float uT; varying vec2 vU; void main(){ vec2 c = (vU - .5) * vec2(uAsp, 1.); float r = length(c); float a = uTw * smoothstep(.75, .0, r); float cs = cos(a), sn = sin(a); c = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs); vec2 uv = c / vec2(uAsp, 1.) + .5; vec4 t = texture2D(uM, uv); float edge = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.); vec3 col = mix(t.rgb, vec3(.8, .95, 1.), smoothstep(.45, .0, r) * uTw * .03); gl_FragColor = vec4(col, t.a * uA * edge);\n#include <colorspace_fragment>\n}' });
    const wm = jar ? waterMat(bt) : null, twirl = jar ? wm : twirl0, basic = jar ? wm : back.material; if (jar) back.material = wm;
    let cage = null;
    if (bk) {   /* the Backup is drawn by the cage shader; the old picture only stays as the skin of the pieces when the tank breaks */
      cage = cageMat(0); back.material = cage; const cageF = cageMat(1); cageF.depthTest = false; cageF.uniforms = cage.uniforms;   /* the bars ignore depth: a thick fish (the squid) can never stand in front of them */ front.material = cageF; front.visible = true; rim1.visible = rim2.visible = false;
    }
    const wm2 = [wallMat(0), wallMat(0), wallMat(1)], wl = new THREE.Mesh(new THREE.PlaneGeometry(2 * TD, 1), wm2[0]), wr = new THREE.Mesh(new THREE.PlaneGeometry(2 * TD, 1), wm2[1]), wt = new THREE.Mesh(new THREE.PlaneGeometry(1, 2 * TD), wm2[2]);   /* the two side walls and the top rim of the glass box */
    wl.rotation.y = wr.rotation.y = Math.PI / 2; wl.position.x = -.5; wr.position.x = .5; wt.rotation.x = -Math.PI / 2; wt.position.y = .5; wt.scale.y = .08; wt.visible = false; wl.renderOrder = wr.renderOrder = 2; wt.renderOrder = 4;
    const sh2 = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh2.renderOrder = 0; g.add(sh2);
    const slices = []; for (let k = 1; k <= 0; k++) { const sm = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: ft, transparent: true, opacity: .11, depthWrite: false })); sm.position.z = -TD + k * (2 * TD) / 12; sm.renderOrder = 2; slices.push(sm); inner.add(sm); }   /* copies of the glass rim stacked between the water and the front glass: seen at an angle they smear into the thick edge of a glass box that follows the rounded outline exactly */
    const bev = new THREE.Mesh(plane, new THREE.ShaderMaterial({ uniforms: { uM: { value: bt }, uA: { value: 1 }, uPx: { value: new THREE.Vector2(.01, .01) }, uK: { value: bk ? 1 : 0 }, uS: { value: 1 } }, transparent: true, depthWrite: false,   /* a lit bevel cut from the outline of the glass: light comes from the top left, so the top and left edges catch it and the bottom and right edges sink into shadow, which is what gives a flat picture the look of a thick glass box without turning it */
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D uM; uniform float uA; uniform vec2 uPx; uniform float uK; uniform float uS; varying vec2 vU;
        float mk(vec2 o){ return texture2D(uM, vU + o * uS * uPx).a; }
        void main(){ float m = mk(vec2(0.)); if (m < .02) discard;
          float e1 = mk(vec2(-3., 3.)) - mk(vec2(3., -3.)), e2 = mk(vec2(-8., 8.)) - mk(vec2(8., -8.)), e3 = mk(vec2(-14., 14.)) - mk(vec2(14., -14.));
          float lit = clamp(e1, 0., 1.) * 1.1 + clamp(e2, 0., 1.) * .5 + clamp(e3, 0., 1.) * .15, sh = clamp(-e1, 0., 1.) * .8 + clamp(-e2, 0., 1.) * .45 + clamp(-e3, 0., 1.) * .2;
          float edge = 1. - mk(vec2(0., 0.)) * mk(vec2(-5., 0.)) * mk(vec2(5., 0.)) * mk(vec2(0., 5.)) * mk(vec2(0., -5.));
          float top = smoothstep(.0, .22, 1. - vU.y) * (1. - smoothstep(.22, .45, 1. - vU.y)) * .1 + smoothstep(.2, .0, vU.y) * smoothstep(.0, .05, vU.y) * .14;
          vec3 c = vec3(.93, 1., 1.); float a = lit * .7 + top; vec3 d = vec3(.02, .1, .32);
          vec4 o = vec4(mix(c, d, clamp(sh * 1.6, 0., 1.) * (1. - clamp(lit, 0., 1.))), clamp(a + sh * .55, 0., .95) + edge * .12);
          gl_FragColor = vec4(o.rgb, o.a * uA * m); }` }));
    bev.renderOrder = 3; bev.position.z = TD + 2; bev.visible = false; inner.add(bev);
    let lidO = null, lidI = null, lidAttr = null, lidCv = null, lidTex = null, lipM = null, lipAttr = null, hinges = null, rimM = null, rimAttr = null;
    if (jar) {   /* the lid: ONE hinged plate. Shut, it is the top of the tank (its outer face is seen from above); opened on its back hinge it stands up behind the tank and its inner face is the sign that shows the fish to find and how many are left */
      const NX = 10, NY = 6, n = (NX + 1) * (NY + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), iO = [], iI = [];
      for (let j = 0; j <= NY; j++) for (let k = 0; k <= NX; k++) { uv[(j * (NX + 1) + k) * 2] = k / NX; uv[(j * (NX + 1) + k) * 2 + 1] = j / NY; }
      for (let j = 0; j < NY; j++) for (let k = 0; k < NX; k++) { const a0 = j * (NX + 1) + k, b0 = a0 + 1, c0 = a0 + NX + 1, d0 = c0 + 1; iI.push(a0, b0, c0, b0, d0, c0); iO.push(a0, c0, b0, b0, c0, d0); }
      lidAttr = new THREE.BufferAttribute(pos, 3); lidAttr.setUsage(THREE.DynamicDrawUsage);
      const mk = idx => { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', lidAttr); g2.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g2.setIndex(idx); return g2; };
      lidCv = document.createElement('canvas'); lidCv.width = 780; lidCv.height = 256; lidTex = new THREE.CanvasTexture(lidCv); lidTex.colorSpace = THREE.SRGBColorSpace; lidTex.anisotropy = 4;
      const oc = document.createElement('canvas'); oc.width = 512; oc.height = 128; { const q = oc.getContext('2d'); lidPlate(q, 512, 128); }   /* the outer face wears the same plate as the inner one */
      const otex = new THREE.CanvasTexture(oc); otex.colorSpace = THREE.SRGBColorSpace;
      lidI = new THREE.Mesh(mk(iI), new THREE.MeshBasicMaterial({ map: lidTex, transparent: true, depthWrite: false })); lidO = new THREE.Mesh(mk(iO), new THREE.MeshBasicMaterial({ map: otex, transparent: true, depthWrite: false }));
      lidI.renderOrder = lidO.renderOrder = 5; lidI.frustumCulled = lidO.frustumCulled = false; inner.add(lidI, lidO);
      /* the thickness of the lid: a lip hanging from its free edge, so a shut lid sits over the rim of the box and closes it; and two hinges at the back edge, which stay where the lid turns */
      const lp = new Float32Array(2 * (NX + 1) * 3), luv = new Float32Array(2 * (NX + 1) * 2), li = []; for (let k = 0; k <= NX; k++) { luv[k * 2] = k / NX; luv[k * 2 + 1] = 1; luv[(NX + 1 + k) * 2] = k / NX; luv[(NX + 1 + k) * 2 + 1] = 0; }
      for (let k = 0; k < NX; k++) { const a0 = k, b0 = k + 1, c0 = NX + 1 + k, d0 = c0 + 1; li.push(a0, c0, b0, b0, c0, d0); }
      lipAttr = new THREE.BufferAttribute(lp, 3); lipAttr.setUsage(THREE.DynamicDrawUsage); const lg = new THREE.BufferGeometry(); lg.setAttribute('position', lipAttr); lg.setAttribute('uv', new THREE.BufferAttribute(luv, 2)); lg.setIndex(li);
      const lc = document.createElement('canvas'); lc.width = 256; lc.height = 32; { const q = lc.getContext('2d'), gr = q.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, '#e9f8ff'); gr.addColorStop(.5, '#a9dcf7'); gr.addColorStop(1, '#5aa6dc'); q.fillStyle = gr; q.fillRect(0, 0, 256, 32); q.fillStyle = 'rgba(255,255,255,.7)'; q.fillRect(0, 0, 256, 3); q.fillStyle = 'rgba(20,80,140,.6)'; q.fillRect(0, 29, 256, 3); }
      const ltex = new THREE.CanvasTexture(lc); ltex.colorSpace = THREE.SRGBColorSpace; lipM = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ map: ltex, transparent: true, depthWrite: false })); lipM.renderOrder = 5; lipM.frustumCulled = false; inner.add(lipM);
      const rp = new Float32Array(12 * 3), rg = new THREE.BufferGeometry(), ru = new Float32Array(12 * 2), ri = []; for (let q2 = 0; q2 < 3; q2++) { const o = q2 * 4; ru.set([0, 1, 1, 1, 0, 0, 1, 0], o * 2); ri.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      rimAttr = new THREE.BufferAttribute(rp, 3); rimAttr.setUsage(THREE.DynamicDrawUsage); rg.setAttribute('position', rimAttr); rg.setAttribute('uv', new THREE.BufferAttribute(ru, 2)); rg.setIndex(ri);
      rimM = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: ltex, transparent: true, depthWrite: false, side: THREE.DoubleSide })); rimM.renderOrder = 3.5; rimM.frustumCulled = false; inner.add(rimM);   /* the top frame of the box: two side rails and the back rail, so the hinge sits on the tank itself and the lid is clearly part of it */
      const hc = document.createElement('canvas'); hc.width = 96; hc.height = 32; { const q = hc.getContext('2d'), gr = q.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, '#d9efff'); gr.addColorStop(.3, '#ffffff'); gr.addColorStop(.55, '#8fc0e6'); gr.addColorStop(1, '#2f6a9e'); q.fillStyle = gr; q.beginPath(); q.roundRect ? q.roundRect(2, 3, 92, 26, 12) : q.rect(2, 3, 92, 26); q.fill(); q.strokeStyle = '#174a78'; q.lineWidth = 3; q.stroke(); q.fillStyle = 'rgba(23,74,120,.55)'; q.fillRect(30, 4, 2, 24); q.fillRect(64, 4, 2, 24); }
      const htex = new THREE.CanvasTexture(hc); htex.colorSpace = THREE.SRGBColorSpace; hinges = [0].map(() => { const h = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: htex, transparent: true, depthWrite: false })); h.renderOrder = 4; h.scale.set(.16, .085, 1); h.frustumCulled = false; inner.add(h); return h; });   /* one hinge, in the middle of the back edge of the tank: drawn behind the lid, so the lid turns over it */
    }
    inner.add(back, shim, bub, front, rim2, rim1, cracks2, cracks); ov.scene.add(g); g.visible = false;
    for (let k = 0; k < 8; k++) { bp[k * 3] = rand(-.4, .4); bp[k * 3 + 1] = rand(-.4, .3); bp[k * 3 + 2] = -8; }
    if (bk) g.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) o.renderOrder -= 20; });   /* the Backup is drawn before the target tanks: when it slides up it goes under them, never over them */
    return { jar, cage, sl: 0, lastN: 0, wm2, slices, bev, sh2, lidO, lidI, lidAttr, lidCv, lidTex, lipM, lipAttr, hinges, rimM, rimAttr, lidKey: '', sl: 0, rt: 99, rw: 100, rh: 100, g, tank, inner, back, front, shim, cracks, cracks2, crackC, bub, bp, bg, twirl, basic, rim1, rim2, kind, yaw: 0, sc: 1, spin: 0, cx: 0, cy: 0, ph: Math.random() * 6, clear: null, gone: false, drain: 0, speeds: Array.from({ length: 8 }, () => rand(.12, .3)) };
  }
    const PLATE_IMG = new Image(); PLATE_IMG.src = new URL('ui/ui_plate.png', document.baseURI).href;
  function boardMesh(T, i, q) {   // the plate above the tank (frame, fish picture, count) painted on a canvas and added to the tank's mesh, so it is twisted along with it
    const el = boxEls[i], bEl = el.root.querySelector('.board'); if (!bEl || !PLATE_IMG.complete) return; const br = bEl.getBoundingClientRect(), K = 3, cv = document.createElement('canvas'); cv.width = Math.round(br.width * K); cv.height = Math.round(br.height * K);
    const g = cv.getContext('2d'); g.drawImage(PLATE_IMG, 0, 0, cv.width, cv.height); const sig = el.sig, bodyH = br.height * .8 * K, cy = bodyH * .5 + K, txt = el.cnt.textContent;
    g.font = `${23 * K}px "Lilita One", system-ui, sans-serif`; g.textBaseline = 'middle'; g.lineJoin = 'round'; const tw = g.measureText(txt).width, ih = bodyH * 1.06, iw = sig && sig.naturalWidth ? ih * sig.naturalWidth / sig.naturalHeight : 0, gap = iw ? 6 * K : 0, x0 = (cv.width - (iw + gap + tw)) / 2;
    if (iw) g.drawImage(sig, x0, cy - ih / 2, iw, ih); g.lineWidth = 4 * K; g.strokeStyle = '#0c5b8e'; g.strokeText(txt, x0 + iw + gap, cy + K); g.fillStyle = '#fff'; g.fillText(txt, x0 + iw + gap, cy + K);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const off = new THREE.Vector2(((br.left + br.width / 2) - (q.left + q.width / 2)) / q.width, -((br.top + br.height / 2) - (q.top + q.height / 2)) / q.height);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(br.width / q.width, br.height / q.height, 40, 14), frontMat(tx, off)); m.position.z = TD + 1; m.renderOrder = 3; m.frustumCulled = false; T.inner.add(m); T.bmesh = m;
  }
  function setOp(T, op) { if (T.bmesh) T.bmesh.material.uniforms.uA.value = op; const a = op * (1 - T.drain); if (!T.jar) T.basic.opacity = a; T.twirl.uniforms.uA.value = a; if (T.jar) T.front.material.uniforms.uA.value = op; else T.front.material.opacity = op; T.shim.material.uniforms.uA.value = op; { const a2 = op * (1 - T.drain); if (T.cage) { T.cage.uniforms.uA.value = a2; } T.slices.forEach(m => { m.material.opacity = a2 * .11; }); T.bev.material.uniforms.uA.value = a2; if (T.lidI) { T.lidI.material.opacity = T.lidO.material.opacity = T.lipM.material.opacity = T.rimM.material.opacity = a2; T.hinges.forEach(h => { h.material.opacity = a2; }); } T.sh2.material.opacity = a2; } }
  function lidPlate(q, W, H) {   /* the plate of the lid, the same on both faces: a pale bevelled frame round a teal panel with a gloss and a fine sheen; the inner face adds the fish and the count */
    const rr = (x, y, w, h, r) => { q.beginPath(); q.roundRect ? q.roundRect(x, y, w, h, r) : q.rect(x, y, w, h); }, u = H / 256;
    let gr = q.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.45, '#c4ecfa'); gr.addColorStop(1, '#5fb0da'); q.fillStyle = gr; rr(0, 0, W, H, 30 * u); q.fill();
    q.strokeStyle = '#1a6a99'; q.lineWidth = 6 * u; rr(3 * u, 3 * u, W - 6 * u, H - 6 * u, 28 * u); q.stroke();
    const px = 18 * u, py = 16 * u, pw = W - 2 * px, ph = H - py - 34 * u;
    gr = q.createRadialGradient(W / 2, py + ph * .35, ph * .1, W / 2, py + ph * .5, Math.max(pw, ph) * .62); gr.addColorStop(0, '#62d8f0'); gr.addColorStop(.55, '#22a3cf'); gr.addColorStop(1, '#0f6f9d'); q.fillStyle = gr; rr(px, py, pw, ph, 20 * u); q.fill();
    q.save(); rr(px, py, pw, ph, 20 * u); q.clip(); q.strokeStyle = 'rgba(255,255,255,.07)'; q.lineWidth = 10 * u; for (let x = -ph; x < pw + ph; x += 38 * u) { q.beginPath(); q.moveTo(px + x, py + ph); q.lineTo(px + x + ph, py); q.stroke(); }
    gr = q.createLinearGradient(0, py, 0, py + ph); gr.addColorStop(0, 'rgba(255,255,255,.42)'); gr.addColorStop(.5, 'rgba(255,255,255,.02)'); gr.addColorStop(1, 'rgba(0,40,80,.28)'); q.fillStyle = gr; q.fillRect(px, py, pw, ph); q.restore();
    q.strokeStyle = '#ffffff'; q.lineWidth = 4 * u; rr(px, py, pw, ph, 20 * u); q.stroke(); q.strokeStyle = 'rgba(6,60,100,.6)'; q.lineWidth = 3 * u; rr(px + 5 * u, py + 5 * u, pw - 10 * u, ph - 10 * u, 16 * u); q.stroke();
    return { px, py, pw, ph };
  }
  function trimThumb(img) {   /* the fish picture cut to the fish itself (its alpha box), so a big fish and a small one in the same frame fill the sign alike */
    if (img._trim) return img._trim; const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = 0, y1 = 0, op = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { op++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return (img._trim = { src: img, sx: 0, sy: 0, sw: w, sh: h });
    return (img._trim = { src: img, sx: x0, sy: y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1, op });
  }
  function paintLid(T, i) {   /* the inner face of the lid is an LED sign: a dark glass screen, a lit grid of dots, the fish in glowing light and the count in lit digits. It is drawn in the exact proportions it has on the screen, so nothing is stretched */
    const b = boxEls[i], scH = -BOX_EZ / (BOX_DP - BOX_EZ), pxW = 1.02 * scH * .976 * T.rw, pxH = (BOX_DP + .05) * 1.55 * scH * .75 * T.rh, asp = clamp(pxW / Math.max(1, pxH), 1.5, 6), gain = T.ledG === undefined ? 1 : T.ledG;
    const H = 256; if (!T.lidW || Math.abs(Math.round(H * asp) / T.lidW - 1) > .18) {   /* the canvas keeps its size: a canvas that changes size under a texture makes the sign jump and show twice, so a new texture is made only when the proportions really change */
      T.lidW = Math.round(H * asp); const c2 = document.createElement('canvas'); c2.width = T.lidW; c2.height = H; const tex = new THREE.CanvasTexture(c2); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; if (T.lidTex) T.lidTex.dispose(); T.lidCv = c2; T.lidTex = tex; T.lidI.material.map = tex; T.lidI.material.needsUpdate = true; }
    const W = T.lidW, cv2 = T.lidCv; const q = cv2.getContext('2d'), img = b.sig, ok = img && img.complete && img.naturalWidth, txt = b.cnt.textContent; q.clearRect(0, 0, W, H);
    const { px, py, pw, ph } = lidPlate(q, W, H), rr = (x, y, w, h, r) => { q.beginPath(); q.roundRect ? q.roundRect(x, y, w, h, r) : q.rect(x, y, w, h); };
    q.save(); rr(px, py, pw, ph, 20 * H / 256); q.clip();
    let gr = q.createRadialGradient(W / 2, py + ph * .5, ph * .1, W / 2, py + ph * .5, Math.max(pw, ph) * .6); gr.addColorStop(0, '#16508c'); gr.addColorStop(.6, '#0a2f58'); gr.addColorStop(1, '#051a35'); q.fillStyle = gr; q.fillRect(px, py, pw, ph);   /* the dark glass of the screen */
    const cell = Math.max(3, ph / 30); q.fillStyle = 'rgba(2,14,34,.5)'; for (let x = px; x < px + pw; x += cell) q.fillRect(x, py, Math.max(1, cell * .2), ph); for (let y = py; y < py + ph; y += cell) q.fillRect(px, y, pw, Math.max(1, cell * .2));   /* the grid of LED dots, drawn on the glass only: the picture and the digits are lit on top of it, so they stay clear */
    q.globalAlpha = .25 + .75 * gain;
    q.textBaseline = 'middle'; q.lineJoin = 'round'; const tt = T.ledTT === undefined ? 9 : T.ledTT, lit = (str, x, y, a, bloom) => { q.save(); q.globalAlpha = Math.max(0, Math.min(1, a)) * (.25 + .75 * gain); q.shadowColor = bloom > .3 ? 'rgba(255,255,255,1)' : 'rgba(110,255,180,1)'; q.shadowBlur = ph * (.2 + .5 * bloom); q.lineWidth = ph * .05; q.strokeStyle = '#0b4a3a'; q.strokeText(str, x, y); q.fillStyle = bloom > .5 ? '#ffffff' : '#f2fff7'; q.fillText(str, x, y); q.restore(); };
    if (T.ledCleared) {   /* the tank is done: CLEARED! lights up letter by letter, flashes white as each one comes on, then glows and a band of light sweeps over it */
      const word = 'CLEARED!'; let fs = ph * .66; q.font = Math.round(fs) + 'px "Lilita One", system-ui, sans-serif'; const w0 = q.measureText(word).width; if (w0 > pw * .9) { fs *= pw * .9 / w0; q.font = Math.round(fs) + 'px "Lilita One", system-ui, sans-serif'; }
      const w1 = q.measureText(word).width, xs = (W - w1) / 2, ys = py + ph / 2 + ph * .04, pulse = .5 + .5 * Math.sin(tt * 7);
      for (let k = 0; k < word.length; k++) { const on = tt - k * .05, x = xs + q.measureText(word.slice(0, k)).width; if (on < 0) continue; const a = Math.min(1, on / .05), fl = Math.max(0, 1 - on / .22);
        q.save(); q.globalAlpha = a * (.25 + .75 * gain); q.shadowColor = fl > .3 ? 'rgba(255,255,255,1)' : 'rgba(110,255,180,1)'; q.shadowBlur = ph * (.22 + .5 * fl + (tt > .5 ? .12 * pulse : 0)); q.lineWidth = ph * .06; q.strokeStyle = '#0b4a3a'; q.strokeText(word[k], x, ys);
        const g2 = q.createLinearGradient(0, ys - fs * .5, 0, ys + fs * .5); g2.addColorStop(0, fl > .5 ? '#ffffff' : '#ffffe6'); g2.addColorStop(.5, fl > .5 ? '#ffffff' : '#c8ffd8'); g2.addColorStop(1, fl > .5 ? '#eafff4' : '#6dffb0'); q.fillStyle = g2; q.fillText(word[k], x, ys); q.restore(); }
      if (tt > .45) { const sw = ((tt - .45) * 1.4 % 1.2) * (w1 + fs) - fs * .5; q.save(); q.globalAlpha = .85 * (.25 + .75 * gain); const g3 = q.createLinearGradient(xs + sw - fs * .4, 0, xs + sw + fs * .4, 0); g3.addColorStop(0, 'rgba(255,255,255,0)'); g3.addColorStop(.5, 'rgba(255,255,255,.95)'); g3.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = g3; q.fillText(word, xs, ys); q.restore(); }
    } else {
      q.font = Math.round(ph * .72) + 'px "Lilita One", system-ui, sans-serif'; const tw = q.measureText(txt).width, tm = ok ? trimThumb(img) : null, slotW = ph * 1.45, fs2 = ok ? Math.min(ph * .98 / tm.sh, slotW / tm.sw, ph * .86 / Math.sqrt(tm.op || tm.sw * tm.sh * .7)) : 0, iw = ok ? tm.sw * fs2 : 0, ih = ok ? tm.sh * fs2 : 0, gap = ok ? ph * .12 : 0, x0 = (W - ((ok ? slotW : 0) + gap + tw)) / 2, xi = x0 + (slotW - iw) / 2, cy = py + ph / 2;   // every fish gets a slot of the same width and is centred in it, so the picture and the count sit in the same places on both signs
      q.globalAlpha = .25 + .75 * gain; if (ok) { q.save(); q.shadowColor = 'rgba(120,235,255,.95)'; q.shadowBlur = ph * .18; q.drawImage(tm.src, tm.sx, tm.sy, tm.sw, tm.sh, xi, cy - ih / 2, iw, ih); q.shadowBlur = 0; q.drawImage(tm.src, tm.sx, tm.sy, tm.sw, tm.sh, xi, cy - ih / 2, iw, ih); q.restore(); }
      const tx0 = x0 + (ok ? slotW : 0) + gap, ty0 = cy + ph * .04;
      if (T.ledMode === 2 && tt < .4 && T.ledOldTxt) {   /* the count changes like a digital counter: the "x" stays, and in the cell of the number the old digit rolls up and out while the new one rolls in from below and lights with a white flash */
        const pre = '\u00d7', pw2 = q.measureText(pre).width, dOld = T.ledOldTxt.slice(1), dNew = txt.slice(1), cw = Math.max(q.measureText(dOld).width, q.measureText(dNew).width) + 4, e = Math.min(1, tt / .26), ee = e * e * (3 - 2 * e), roll = ph * .95;
        lit(pre, tx0, ty0, 1, 0); q.save(); q.beginPath(); q.rect(tx0 + pw2 - 2, py + 3, cw + 6, ph - 6); q.clip(); lit(dOld, tx0 + pw2, ty0 - ee * roll, 1 - ee, 0); lit(dNew, tx0 + pw2, ty0 + (1 - ee) * roll, Math.min(1, ee * 1.4), Math.max(0, 1 - (tt - .18) / .22)); q.restore();
      } else lit(txt, tx0, ty0, 1, 0);
    }
    q.globalAlpha = 1; q.fillStyle = 'rgba(2,14,34,.14)'; for (let y = py; y < py + ph; y += cell) q.fillRect(px, y, pw, Math.max(1, cell * .2));   /* a faint scan line over everything */
    gr = q.createLinearGradient(0, py, 0, py + ph); gr.addColorStop(0, 'rgba(255,255,255,.16)'); gr.addColorStop(.45, 'rgba(255,255,255,.02)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = gr; q.fillRect(px, py, pw, ph * .5);   /* a gloss on the glass */
    q.restore(); q.strokeStyle = '#ffffff'; q.lineWidth = 3 * H / 256; rr(px, py, pw, ph, 20 * H / 256); q.stroke(); q.strokeStyle = 'rgba(6,50,90,.7)'; q.lineWidth = 3 * H / 256; rr(px + 5 * H / 256, py + 5 * H / 256, pw - 10 * H / 256, ph - 10 * H / 256, 16 * H / 256); q.stroke();
    T.lidTex.needsUpdate = true;
  }
  function lidApply(T, i, th) {   /* every vertex of the hinged lid is projected with the same eye that looks into the water box, so the lid and the box agree in perspective at every angle */
    if (!(T.rw > 20 && T.rh > 20)) { T.lidI.visible = T.lidO.visible = T.lipM.visible = false; T.lidKey = ''; return; }   /* the box has not been placed on the screen yet (its size is still 0): the sign would be painted for the wrong proportions and show stretched for a frame, as the lid starts to open */
    const key = (boxEls[i].sig.getAttribute('src') || '') + '|' + boxEls[i].cnt.textContent + '|' + (boxEls[i].sig.complete ? 1 : 0) + '|' + Math.round((T.ledG === undefined ? 1 : T.ledG) * 10) + '|' + ((T.ledG === undefined || T.ledG >= 1) ? Math.floor(performance.now() / 1500) : 0) + '|' + (T.ledCleared ? 'C' + (T.ledTT < 1.4 ? Math.floor(T.ledTT * 30) : '') : '') + (T.ledMode === 2 && T.ledTT < .45 ? Math.floor(T.ledTT * 30) : ''); if (key !== T.lidKey) { T.lidKey = key; paintLid(T, i); }
    const W = Math.max(T.rw / Math.max(1, T.rh), .5), L = BOX_DP + .05, sn = Math.sin(th), cs = Math.cos(th), pos = T.lidAttr.array, NX = 10, NY = 6, scH = -BOX_EZ / (BOX_DP - BOX_EZ), wk = 1.02, hk = 1 + sn * .55;   /* hk: standing up it is also cut taller, so the sign is not a flat strip */   /* wk: the lid overhangs the tank a little on each side (as a real lid does); the hinges are fixed at its back corners, they never move */
    for (let j = 0; j <= NY; j++) { const v = j / NY, Y = 1 + v * L * sn * hk, Z = BOX_DP - v * L * cs, sc = -BOX_EZ / (Z - BOX_EZ), sy = BOX_EY + sc * (Y - BOX_EY);
      for (let k = 0; k <= NX; k++) { const X = W / 2 + (k / NX - .5) * W * wk, sx = W / 2 + sc * (X - W / 2), o = (j * (NX + 1) + k) * 3; pos[o] = .012 + sx / W * .976 - .5; pos[o + 1] = .13 + sy * .75 - .5; pos[o + 2] = TD + 3; } }
    T.lidAttr.needsUpdate = true; T.lidI.visible = T.lidO.visible = T.lipM.visible = true;
    { const rt = .05, Zf = -.05, pr = (X, Z, o, arr) => { const sc2 = -BOX_EZ / (Z - BOX_EZ), sx = W / 2 + sc2 * (X - W / 2), sy = BOX_EY + sc2 * (1 - BOX_EY); arr[o] = .012 + sx / W * .976 - .5; arr[o + 1] = .13 + sy * .75 - .5; arr[o + 2] = TD + 2; }, ra = T.rimAttr.array;
      const quads = [[0, rt, Zf, BOX_DP], [W - rt, W, Zf, BOX_DP], [0, W, BOX_DP - rt, BOX_DP]];   /* x0, x1, z0, z1 of each rail */
      quads.forEach((qd, k) => { const o = k * 12; pr(qd[0], qd[2], o, ra); pr(qd[1], qd[2], o + 3, ra); pr(qd[0], qd[3], o + 6, ra); pr(qd[1], qd[3], o + 9, ra); }); T.rimAttr.needsUpdate = true; T.rimM.visible = true; }
    { const Yf = 1 + L * sn * hk, Zf = BOX_DP - L * cs, th2 = .11, Yb = Yf - th2 * cs, Zb = Zf - th2 * sn, lp = T.lipAttr.array, sa = -BOX_EZ / (Zf - BOX_EZ), sb = -BOX_EZ / (Zb - BOX_EZ), sya = BOX_EY + sa * (Yf - BOX_EY), syb = BOX_EY + sb * (Yb - BOX_EY);   /* the lip hangs from the free edge, against the outward side of the lid */
      for (let k = 0; k <= NX; k++) { const X = W / 2 + (k / NX - .5) * W * wk, o1 = k * 3, o2 = (NX + 1 + k) * 3; lp[o1] = .012 + (W / 2 + sa * (X - W / 2)) / W * .976 - .5; lp[o1 + 1] = .13 + sya * .75 - .5; lp[o1 + 2] = TD + 3.5; lp[o2] = .012 + (W / 2 + sb * (X - W / 2)) / W * .976 - .5; lp[o2 + 1] = .13 + syb * .75 - .5; lp[o2 + 2] = TD + 3.5; }
      T.lipAttr.needsUpdate = true;
      { const sx = W / 2, sy = BOX_EY + scH * (1.02 - BOX_EY), m = T.hinges[0]; m.position.set(.012 + sx / W * .976 - .5, .13 + sy * .75 - .5, TD + 2.5); m.visible = true; } }
  }
  function lidStep(T, i, tg, now, dt) {   /* the lid of a target tank: shut while the tank is new (and once it is full), then it swings up on its back hinge and shows which fish to find */
    if (T.lid === undefined || T.lidTg !== tg) { T.lid = 0; T.lidAt = now + .95; T.lidTg = tg; T.doneAt = 0; T.ledCleared = false; T.ledMode = 0; T.ledOldTxt = ''; }   /* a new target (a new level, a restart, a refilled tank) always starts with the lid shut and opens it once the tank is on screen */
    if (tg && tg.done && !T.doneAt) { T.doneAt = now; T.ledCleared = true; T.ledT0 = now; T.ledMode = 1; }   /* the tank is full: the sign switches to CLEARED! (the screen flickers on again) and the lid stays open for a moment before it shuts */
    const goal = !T.clear && tg && now >= T.lidAt && (!tg.done || now - T.doneAt < .65) ? 1 : 0, before = T.lid;
    T.lid = clamp(T.lid + clamp(goal - T.lid, -dt / .4, dt / .6), 0, 1); window.__lid[i] = T.lid;
    let th;   /* opening: it swings up, overshoots upright by a few degrees and settles back to exactly upright; closing: it starts slowly and drops faster, to a firm stop */
    if (goal) { const p = T.lid, c1 = 1.5, c3 = c1 + 1, pp = p - 1, eob = 1 + c3 * pp * pp * pp + c1 * pp * pp; th = eob * Math.PI / 2; } else { const p1 = 1 - T.lid; th = (1 - Math.pow(p1, 2.2)) * Math.PI / 2 * (T.lid > 0 ? 1 : 0); }
    const cnt = boxEls[i].cnt.textContent; if (T.lid >= .98 && !T.ledOn) { T.ledOn = true; T.ledT0 = now; T.ledMode = 1; } if (T.lid < .5) T.ledOn = false; if (T.ledCnt !== undefined && cnt !== T.ledCnt && T.lid >= .98 && !T.ledCleared) { T.ledT0 = now; T.ledMode = 2; T.ledOldTxt = T.ledCnt; } T.ledCnt = cnt;
    { const tt = now - (T.ledT0 || -9); T.ledTT = tt; T.ledG = T.ledMode === 1 ? (tt < .06 ? .15 : tt < .12 ? 1 : tt < .2 ? .3 : tt < .27 ? 1 : tt < .34 ? .6 : 1) : 1; }   /* the screen powers on with a stutter when the lid opens, and blinks once when the count changes */
    lidApply(T, i, th);
    const x = T.cx, y = T.cy - T.rh / 2;
    if (before < .02 && T.lid >= .02 && goal) { ovFx.emit(x, y - 4, 12, 150, 0xbff4ff, 1.2); ovFx.emit(x, y - 4, 6, 90, 0xffffff, 1); }   /* a little glitter as the lid lifts */
    if (before < 1 && T.lid >= 1) { ovFx.emit(x - T.rw * .3, y - 26, 5, 80, 0xfff3b0, 1); ovFx.emit(x + T.rw * .3, y - 26, 5, 80, 0xfff3b0, 1); ovFx.emit(x, y - 30, 8, 110, 0xffffff, 1); }
    if (before > 0 && T.lid <= 0 && !goal) { ovFx.emit(x, y - 2, 8, 100, 0xffffff, 1); }   /* and a puff as it shuts */
  }
  function parallaxAngles() { return { y: 0, p: 0 }; }   /* the boxes turn a little with the camera of the big tank: the player rotates the water and the glass boxes above answer, so they read as solid */
  function place(T, r, sc, o = {}) {
    const cx = r.left + r.width / 2 + (o.dx || 0), cy = r.top + r.height / 2 + (o.dy || 0); T.cx = cx; T.cy = cy; T.rw = r.width * sc; T.rh = r.height * sc;
    T.g.position.set(cx - ov.W / 2, ov.H / 2 - cy, 0); T.g.rotation.set(0, 0, o.rz || 0); T.inner.scale.set(Math.max(.01, r.width * sc), Math.max(.01, r.height * sc), 1);
    const pa = parallaxAngles(); T.tank.rotation.set(.08 + pa.p, T.yaw + pa.y + (o.ry || 0), 0); T.g.visible = true;
    if (T.cage) { T.cage.uniforms.uAsp.value = T.rw / T.rh; T.cage.uniforms.uBw.value = 1.1 / Math.max(10, T.rw); } if (T.jar && !T.clear) T.basic.uniforms.uAsp.value = T.rw / T.rh; T.bev.material.uniforms.uPx.value.set(1 / Math.max(8, T.rw), 1 / Math.max(8, T.rh)); T.bev.material.uniforms.uS.value = clamp(T.rh / 100, .4, 1); T.sh2.position.set(0, -T.rh / 2 - 2, -TD - 12); T.sh2.scale.set(T.rw * 1.04, Math.max(10, T.rh * .24), 1);
  }
  function anim(T, t, dt, warn) {
    T.shim.material.uniforms.uT.value = t + T.ph; if (T.basic.color) T.basic.color.setRGB(1, 1 - .12 * (warn || 0), 1 - .14 * (warn || 0));
    if (T.jar) { T.sl *= Math.exp(-dt * 1.7); T.rt = Math.min(99, T.rt + dt); const u = T.basic.uniforms; u.uSl.value = T.sl; u.uRt.value = T.rt; if (!T.clear) u.uT.value = t + T.ph; }
    for (let k = 0; k < 8; k++) { T.bp[k * 3 + 1] += T.speeds[k] * dt; if (T.bp[k * 3 + 1] > .34) { T.bp[k * 3 + 1] = -.38; T.bp[k * 3] = rand(-.4, .4); } T.bp[k * 3] += Math.sin(t * 2 + k) * .0008; }
    T.bg.attributes.position.needsUpdate = true;
  }
  let rimTex = null, haloTex = null;
  const glowTex = (stops) => { const c = document.createElement('canvas'); c.width = c.height = 128; const q = c.getContext('2d'), gr = q.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(([o, col]) => gr.addColorStop(o, col)); q.fillStyle = gr; q.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  function ballMake(tex = TANK_ART.bubble_orb) {   // the bubble the finished tank turns into: the orb picture (the level number flies in as the plain soap bubble, with a bright rim and a soft halo so it stands out on the water)
    const g = new THREE.Group(), m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); m.scale.setScalar(2.1); g.add(m);
    if (tex === TANK_ART.bubble) {
      haloTex ||= glowTex([[0, 'rgba(190,240,255,0)'], [.5, 'rgba(190,240,255,.0)'], [.72, 'rgba(190,240,255,.5)'], [1, 'rgba(190,240,255,0)']]); rimTex ||= glowTex([[0, 'rgba(255,255,255,0)'], [.78, 'rgba(255,255,255,0)'], [.9, 'rgba(255,255,255,.95)'], [.96, 'rgba(210,245,255,.5)'], [1, 'rgba(255,255,255,0)']]);
      const halo = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), rim = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: rimTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(3.3); rim.scale.setScalar(2.2); halo.userData.k = .75; rim.userData.k = 1; g.add(halo, rim);
    } g.renderOrder = 15; g.position.z = 60; ov.scene.add(g); return g;
  }
  const LVT = { squeeze: 2.15, arrive: 2.65 }, LVO = { ball: null, pp: null, ang: 0, done: false, id: null };   // (the words are painted by paintLevelIntro in src/ui/panels.ts; the same times)
  const setBallOp = (b, v) => b.children.forEach(c => { c.material.opacity = v * (c.userData.k ?? 1); });
  function levelOrb(dt) {   // after the level words melt away, a water bubble (the orb of the tank-clear animation) flies, weaving and stretching like jelly, into the level badge
    const I = window.__lvIntro;
    if (!I) { if (LVO.ball) { ov.scene.remove(LVO.ball); LVO.ball = null; } LVO.id = null; return; }
    if (LVO.id !== I) { LVO.id = I; LVO.done = false; if (LVO.ball) { ov.scene.remove(LVO.ball); LVO.ball = null; } }
    const t = (performance.now() - I.t0) / 1000, sx0 = ov.W / 2, sy0 = ov.H * .36, F0 = 1.5;
    if (t < F0 || LVO.done) return;
    const br = document.querySelector('.topbar .lvl').getBoundingClientRect(), bx = br.left + br.width / 2, by = br.top + br.height / 2, R = 28;
    if (!LVO.ball) { LVO.ball = ballMake(TANK_ART.bubble || TANK_ART.bubble_orb); setBallOp(LVO.ball, 0); LVO.pp = [sx0, sy0]; LVO.ang = 0; const tb = window.__lvTier | 0; if (tb) LVO.ball.children.forEach(c => c.material.color.set(c.userData.k === undefined ? TIERBALL[tb] : TIERFX[tb])); }
    const q = clamp((t - F0) / (LVT.squeeze - F0), 0, 1);   // 0..1 while the words swirl into the bubble
    if (t < LVT.squeeze) {
      const born = sm(q), over = 1 + .3 * Math.max(0, (q - .7) / .3) * (1 - q * .2), cx = sx0 + Math.sin(t * 1.05) * 4, cy = sy0 + Math.sin(t * 1.7) * 5 - Math.sin(q * Math.PI) * 14;
      setBallOp(LVO.ball, clamp((q - .25) / .5, 0, 1)); LVO.ball.position.set(cx - ov.W / 2, ov.H / 2 - cy, 60); LVO.ball.rotation.z = q * 5; LVO.ball.scale.setScalar(Math.max(.01, R * (.2 + .8 * born) * over)); LVO.pp = [cx, cy];
      const a = t * 16, rad = (1 - q) * 70 + 8; if (Math.random() < .9) ovFx.emit(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * .7, 1, 22, fxc(0xe6fff0));   // droplets spiral into the bubble
      if (q > .85 && !LVO.popped) { LVO.popped = true; for (let k = 0; k < 12; k++) { const aa = k / 12 * 6.283; ovFx.emit(cx + Math.cos(aa) * 26, cy + Math.sin(aa) * 26, 1, 70, fxc(0xbff4ff)); } }
      return;
    }
    LVO.popped = false;
    const u = clamp((t - LVT.squeeze) / (LVT.arrive - LVT.squeeze), 0, 1), e2 = .5 - .5 * Math.cos(Math.PI * u), p0 = [sx0, sy0 - 14], side = bx > p0[0] ? -1 : 1, p1 = [lerp(p0[0], bx, .25) + side * 60, Math.min(p0[1], by) - 80];
    let x = (1 - e2) * (1 - e2) * p0[0] + 2 * (1 - e2) * e2 * p1[0] + e2 * e2 * bx, y = (1 - e2) * (1 - e2) * p0[1] + 2 * (1 - e2) * e2 * p1[1] + e2 * e2 * by;
    x += Math.sin(u * 8) * 5 * Math.sin(u * Math.PI); y += Math.cos(u * 6) * 3 * Math.sin(u * Math.PI);   // a little weave on the way
    const vx = x - LVO.pp[0], vy = y - LVO.pp[1], spd = Math.hypot(vx, vy) / Math.max(dt, .008), kt = clamp(spd / 1000, 0, .5); LVO.k = (LVO.k || 0) + (kt - (LVO.k || 0)) * (1 - Math.exp(-dt * 12)); const k = LVO.k + .02 * Math.sin(t * 16);   // the stretch follows the speed smoothly
    if (spd > 30) LVO.ang = Math.atan2(-vy, vx); LVO.pp = [x, y];
    setBallOp(LVO.ball, 1); LVO.ball.position.set(x - ov.W / 2, ov.H / 2 - y, 60); LVO.ball.rotation.z = LVO.ang; LVO.ball.scale.set(Math.max(.01, R * (1 - .45 * e2) * (1 + k)), Math.max(.01, R * (1 - .45 * e2) * (1 - k * .7)), 1);
    ovFx.emit(x, y, 3, 55, fxc(0xbff4ff)); ovFx.emit(x - vx * 2, y - vy * 2, 1, 25, 0xffffff); if (Math.random() < .35) ovFx.emit(x, y, 1, 90, fxc(0xfff3b0));
    if (u >= 1) { ovFx.emit(bx, by, 26, 190, fxc(0xbff4ff)); ovFx.emit(bx, by, 14, 110, 0xffffff); ov.scene.remove(LVO.ball); LVO.ball = null; LVO.done = true; window.__lvShown = true; window.__lvPop = performance.now(); Snd.play('complete'); }
  }
  let winBall = null;
  function setWinBall(x, y, r, a) {   // the soap bubble the fish merge into at the end of the win sequence (same picture as the level-start bubble, with its bright rim and halo)
    if (!winBall) { winBall = ballMake(TANK_ART.bubble || TANK_ART.bubble_orb); setBallOp(winBall, 0); }
    setBallOp(winBall, a); winBall.position.set(x - ov.W / 2, ov.H / 2 - y, 62); winBall.scale.setScalar(Math.max(.01, r)); winBall.rotation.z = Math.sin(performance.now() / 260) * .05;
  }
  function clearWinBall() { if (winBall) { ov.scene.remove(winBall); winBall = null; } }
  const gaugePt = () => { const r = $('goal').getBoundingClientRect(), f = clamp(((G.goalShown || 0) + 1) / Math.max(1, G.cfg.goal), 0, 1); return [r.left + 8 + (r.width - 16) * f * .96, r.top + r.height / 2]; };
  function clearStep(T, now, dt) {   // wind-up squash, the water swirls down, the tank squeezes into the orb, the orb pops out and flies up into the gauge like a blob of jelly, then splashes in
    const c = T.clear, el = now - c.t0, r = c.r, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const wind = clamp(el / .35, 0, 1), e = sm(clamp(el / .5, 0, 1)), m = sm(clamp((el - .3) / .4, 0, 1));
    T.spin = Math.pow(clamp(el / .78, 0, 1), 1.35) * Math.PI * 2.6; T.sc = Math.max(0, 1 - m); T.cx = cx; T.cy = cy;
    T.twirl.uniforms.uT.value = now; if (T.jar) { const ew = clamp(el / .78, 0, 1), gw = 14 * Math.pow(ew, 1.35), fu = T.front.material.uniforms; T.twirl.uniforms.uGw.value = gw; fu.uGw.value = gw; fu.uAsp.value = T.twirl.uniforms.uAsp.value; if (T.bmesh) { const bu = T.bmesh.material.uniforms; bu.uGw.value = gw; bu.uAsp.value = fu.uAsp.value; } T.twirl.uniforms.uDr.value = e; T.shim.visible = false; T.bub.visible = false; } else { T.twirl.uniforms.uTw.value = 10 * e; if (T.twirl.uniforms.uDr) T.twirl.uniforms.uDr.value = e; }
    (window.__whirl || (window.__whirl = {}))[T.idx] = { cx, cy, spin: T.spin, sc: T.sc };   // the plate above the tank follows the whirl (paintTargets in src/ui/panels.ts)
    if (!c.burst) { c.burst = true; for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283; ovFx.emit(cx + Math.cos(a) * r.width * .4, cy + Math.sin(a) * r.height * .35, 1, 60, 0xe6fff0); } }
    const squash = Math.sin(wind * Math.PI) * .12, jel = Math.sin(el * 26) * Math.exp(-el * 2.5) * .05;
    const wm = lerp(r.width * (1 + squash * .6 + jel), c.R * 2, m), hm = lerp(r.height * (1 - squash - jel), c.R * 2, m);
    if (el < .75) { place(T, { left: cx - wm / 2, top: cy - hm / 2, width: wm, height: hm }, 1, { rz: T.spin * .25 }); setOp(T, 1 - clamp((m - .45) / .55, 0, 1)); } else T.g.visible = false;
    if (el < .55 && Math.random() < .9) { const a = Math.random() * 6.283, rr = r.width * .42 * (1 - e * .7); ovFx.emit(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .5, 1, 36, 0xe6fff0); }
    if (el >= .3) {
      if (!c.ball) { c.ball = ballMake(); c.p0 = [cx, cy]; c.pp = [cx, cy]; c.ball.children[0].material.opacity = 0; }
      if (el >= .62 && !c.pop) { c.pop = true; ovFx.emit(cx, cy, 18, 170, 0xb4ffd2); ovFx.emit(cx, cy, 8, 90, 0xffffff); Snd.play('land'); }
      const [gx, gy] = gaugePt(), u = clamp((el - .66) / .6, 0, 1), e2 = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2, p0 = c.p0, side = gx > p0[0] ? -1 : 1, p1 = [lerp(p0[0], gx, .25) + side * 46, Math.min(p0[1], gy) - 60];
      let x = (1 - e2) * (1 - e2) * p0[0] + 2 * (1 - e2) * e2 * p1[0] + e2 * e2 * gx, y = (1 - e2) * (1 - e2) * p0[1] + 2 * (1 - e2) * e2 * p1[1] + e2 * e2 * gy;
      const wob = Math.sin(u * 14) * 9 * Math.sin(u * Math.PI); x += wob; y += Math.cos(u * 11) * 5 * Math.sin(u * Math.PI);   // a little weave on the way
      const vx = x - c.pp[0], vy = y - c.pp[1], spd = Math.hypot(vx, vy) / Math.max(dt, .008), k = clamp(spd / 1000, 0, .5) + .05 * Math.sin(el * 22);
      const born = m < 1 ? .35 + .65 * m : 1, over = el >= .62 ? 1 + .3 * Math.max(0, 1 - (el - .62) / .18) : 1, base = c.R * born * over * (1 - .35 * e2);
      if (spd > 30) c.ang = Math.atan2(-vy, vx); c.pp = [x, y];
      c.ball.children[0].material.opacity = clamp((m - .1) / .5, 0, 1);
      c.ball.position.set(x - ov.W / 2, ov.H / 2 - y, 60); c.ball.rotation.z = c.ang || 0; c.ball.scale.set(Math.max(.01, base * (1 + k)), Math.max(.01, base * (1 - k * .7)), 1);
      if (u > 0) { ovFx.emit(x, y, 3, 55, 0xb4ffd2); ovFx.emit(x - vx * 2, y - vy * 2, 1, 25, 0xffffff); if (Math.random() < .35) ovFx.emit(x, y, 1, 90, 0xfff3b0); }
      if (u >= 1) {
        ovFx.emit(gx, gy, 30, 210, 0xb4ffd2); ovFx.emit(gx, gy, 16, 120, 0xffffff); ovFx.emit(gx, gy, 6, 150, 0xfff3b0); ov.scene.remove(c.ball);
        if (c.gid === gid && G) { if (G.status === 'won' && !G.celebrated) { G.celebrated = true; celebrate(); } G.goalShown = Math.min(G.cfg.goal, (G.goalShown || 0) + 1); window.__gaugePulse = performance.now(); Snd.play('gaugehit'); Snd.play('gaugefill', { at: .1 }); }
        T.back.material = T.basic; T.clear = null; T.g.visible = false; if (window.__whirl) window.__whirl[T.idx] = undefined;
      }
    }
  }
  function tankPieces(T, r) {   // the tank itself breaks: its picture is cut into jagged pieces that fly out from the crack centre and fall
    const cols = 11, rows = 3, w = r.width, h = r.height, vx = [], g = new THREE.Group(); g.position.set(r.left + w / 2 - ov.W / 2, ov.H / 2 - (r.top + h / 2), 30); g.rotation.set(.08, T.yaw, 0);
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const jx = i === 0 || i === cols ? 0 : rand(-.38, .38), jy = j === 0 || j === rows ? 0 : rand(-.38, .38); vx.push({ x: (i + jx) / cols, y: (j + jy) / rows }); }
    const V = (i, j) => vx[j * (cols + 1) + i], mat = T.cage ? (T.snapTex || (T.snapTex = (() => { const cvs = cageCanvas(1024, Math.max(96, Math.round(1024 * h / w)), 'all'); if (!cvs) return T.basic.map; const t2 = new THREE.CanvasTexture(cvs); t2.colorSpace = THREE.SRGBColorSpace; return t2; })())) : T.basic.map, cx0 = T.crackC[0] * w, cy0 = T.crackC[1] * h, pcs = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const q = [V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)], tris = Math.random() < .5 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 3], [1, 2, 3]];
      for (const t3 of tris) { const P = t3.map(k => q[k]), mx = (P[0].x + P[1].x + P[2].x) / 3, my = (P[0].y + P[1].y + P[2].y) / 3, pos = [], uv = [];
        P.forEach(p => { pos.push((p.x - mx) * w, -(p.y - my) * h, 0); uv.push(p.x, 1 - p.y); }); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        const m = new THREE.MeshBasicMaterial({ map: mat, transparent: true, side: THREE.DoubleSide, depthWrite: false }), mesh = new THREE.Mesh(geo, m), em = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9 }), edge = new THREE.LineLoop(geo, em); mesh.add(edge); mesh.renderOrder = 11; edge.renderOrder = 12;
        const px = (mx - .5) * w, py = -(my - .5) * h, dx = px - cx0, dy = py + cy0, dd = Math.hypot(dx, dy) + 1, sp = rand(260, 720); mesh.position.set(px, py, 0); g.add(mesh);
        pcs.push({ mesh, m, em, vx: dx / dd * sp + rand(-120, 120), vy: dy / dd * sp * .6 + rand(80, 380), vr: rand(-6, 6), vx3: rand(-5, 5), vy3: rand(-5, 5) }); } }
    ov.scene.add(g); S.pieces = { g, pcs, life: 0 };
  }
  const shardGeos = Array.from({ length: 9 }, () => { const n = 3 + ((Math.random() * 3) | 0), pts = []; for (let i = 0; i < n; i++) { const an = (i + rand(-.3, .3)) / n * 6.283, r = rand(.55, 1); pts.push(new THREE.Vector2(Math.cos(an) * r * (i % 2 ? .6 : 1), Math.sin(an) * r)); } const sh = new THREE.Shape(pts); return { g: new THREE.ShapeGeometry(sh), e: new THREE.BufferGeometry().setFromPoints([...pts, pts[0]].map(q => new THREE.Vector3(q.x, q.y, 0))) }; });
  function shardSpawn(x, y, vx, vy, size) {   // one piece of the broken glass: an irregular shard that tumbles in 3D, catches the light and has a bright edge
    const G2 = shardGeos[(Math.random() * shardGeos.length) | 0], g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xd6f1ff, emissive: 0x3a86b8, emissiveIntensity: .45, roughness: .06, metalness: .25, transparent: true, opacity: .62, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(G2.g, mat), em = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false }), edge = new THREE.Line(G2.e, em); mesh.renderOrder = edge.renderOrder = 12; g.add(mesh, edge);
    g.scale.setScalar(size); g.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)); g.position.set(x - ov.W / 2, ov.H / 2 - y, 50 + rand(0, 40)); ov.scene.add(g);
    S.shards.push({ m: g, mat, em, vx, vy, vr: rand(-9, 9), vx3: rand(-7, 7), vy3: rand(-7, 7), life: 0 });
  }
  return {
    list: S.list,
    cageCanvas,
    busy: () => !!(S.brk || S.shards.length || S.fx.length || S.pieces),
    clearing: i => S.fx.find(T => T.idx === i && T.clear) || null,
    revive(i) { S.wait[i] = false; },
    info(i) { const T = S.list[i]; return T && T.jar ? { rt: +T.rt.toFixed(2), rx: T.rx, sl: +T.sl.toFixed(2) } : null; },
    splash(i, cx) { const T = S.list[i]; if (!T || !T.jar) return; T.sl = Math.min(1.2, T.sl + .9); const sy = T.cy - (JAR_FILL - .5) * T.rh, x = cx == null ? T.cx : cx; dropFx.emit(x, sy, 22, 185, { x0: T.cx - T.rw / 2 + 8, x1: T.cx + T.rw / 2 - 8, top: T.cy - T.rh / 2 + 6, surf: sy, idx: i }, 4); T.rx = clamp((x - (T.cx - T.rw / 2)) / T.rw, .06, .94); T.basic.uniforms.uRx.value = T.rx; T.rt = 0; for (let k = 0; k < 6; k++) ovFx.emit(x + rand(-.12, .12) * T.rw, sy + rand(4, .3 * T.rh), 1, 30, 0xffffff, .6); },   // a fish lands: the water sloshes, a ring spreads from the spot, a crown of light droplets flies up inside the tank (a short jet in the middle) and falls back, a few bubbles rise
    startClear(i) {   // the finishing tank becomes an effect of its own; a fresh tank takes its place when the next target arrives
      const T = S.list[i] || make('target'), q = boxEls[i].aq.getBoundingClientRect(); T.idx = i; T.clear = { t0: nowS(), r: { left: q.left, top: q.top, width: q.width, height: q.height }, gid, R: clamp(q.height * .45, 16, 28) };
      if (T.lidI) { T.lidI.visible = T.lidO.visible = T.lipM.visible = T.rimM.visible = false; T.hinges.forEach(h => { h.visible = false; }); } T.back.material = T.twirl; T.twirl.uniforms.uAsp.value = q.width / q.height; if (T.jar) boardMesh(T, i, q); S.fx.push(T); S.list[i] = null; S.wait[i] = true;
    },
    winBall: setWinBall, winBallOff: clearWinBall,
    reset() {
      clearWinBall(); const keepW = window.__keepWater;
      for (const T of S.list) if (T) { T.g.visible = false; T.back.material = T.basic; }
      window.__whirl = {}; for (const T of S.fx) { if (T.clear && T.clear.ball) ov.scene.remove(T.clear.ball); ov.scene.remove(T.g); } S.fx.length = 0; S.wait.length = 0;
      if (S.back) { const B = S.back; B.g.visible = false; B.front.visible = true; B.shim.visible = true; B.rim1.material.opacity = B.rim2.material.opacity = 0; B.rim1.visible = B.rim2.visible = true; B.drain = 0; B.back.position.y = 0; B.back.visible = true; B.cracks.geometry.setDrawRange(0, 0); B.cracks2.material.opacity = 0; B.cracks.material.opacity = 0; }
      for (const s of S.shards) ov.scene.remove(s.m); S.shards.length = 0; if (S.pieces) { ov.scene.remove(S.pieces.g); S.pieces.pcs.forEach(q => { q.m.dispose(); q.em.dispose(); q.mesh.geometry.dispose(); }); S.pieces = null; } S.brk = null; if (!keepW) glassWater.clear(); document.getElementById('splat')?.remove(); document.body.classList.remove('wet'); window.__wetT0 = 0;
    },
    breakBackup() {
      if (S.brk || !S.back || !G) return; const fish = G.backup.map(it => it && it.res ? { sp: it.res, tx: ov.W * rand(.2, .8), ty: ov.H * rand(.32, .62), delay: rand(0, .12), spin: rand(-1.2, 1.2), dwell: rand(.75, 1.0), gone: false, hit: false } : null);
      const cells = []; for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 3; c2++) cells.push([c2, r]); for (let i = cells.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [cells[i], cells[j]] = [cells[j], cells[i]]; }   // spread the fish over the screen, one per cell of a 3x4 grid
      fish.forEach((f, i) => { if (!f) return; const [c2, r] = cells[i % cells.length]; f.tx = ov.W * (.17 + .66 * (c2 + .5) / 3) + rand(-.04, .04) * ov.W; f.ty = ov.H * (.2 + .56 * (r + .5) / 4) + rand(-.03, .03) * ov.H; f.big = rand(2.5, 3.5); });
      S.brk = { t0: nowS(), shattered: false, fish, hit: false };
    },
    fishPos(k, x, y, size) {   // a fish shot out of the bursting backup tank: flies at the screen, sticks to the glass, then slides down leaving droplets
      const B = S.brk; if (!B || !B.shattered) return null; const f = B.fish[k]; if (!f || f.gone) return null;
      const t = nowS() - B.t0, p = clamp((t - .35 - f.delay) / .2, 0, 1), e = 1 - Math.pow(1 - p, 3);   // shot straight at the glass in 0.2 s
      if (p < 1) return [lerp(x, f.tx, e), lerp(y, f.ty, e), size * (1 + (f.big - 1) * e), e * f.spin];
      const ts = t - (.55 + f.delay), s = ts - f.dwell, sz = size * f.big * (1 + .28 * Math.exp(-ts * 8) * Math.cos(ts * 30));   // squashes against the glass, then wobbles
      if (s <= 0) return [f.tx, f.ty, sz, f.spin];
      const yy = f.ty + 40 * s + 900 * s * s;
      if (yy - sz > ov.H) { f.gone = true; ovRemove(f.sp); return null; }
      glassWater.feed(f.tx + Math.sin(s * 9) * 4, yy - sz * .1, sz * .3); if (Math.random() < .5) ovFx.emit(f.tx + rand(-.2, .2) * sz, yy + sz * .25, 1, 25, 0xdff4ff);
      return [f.tx + Math.sin(s * 9) * 4, yy, sz * (1 - .1 * s), f.spin + s * .4];
    },
    update() {
      const now = nowS(), dt = Math.min(.05, now - (S.last || now)); S.last = now; window.__tank3d = true;
      if (!G) { for (const T of [...S.list, S.back]) if (T) T.g.visible = false; levelOrb(dt); cheerUpdate(dt); dropFx.update(dt, dropLand); ovFx.update(dt); glassWater.update(dt); return; }
      boxEls.forEach((b, i) => {
        (window.__lid = window.__lid || [])[i] = 0; const T = S.list[i] || (S.list[i] = make('target')); T.yaw = i ? -.08 : .08; T.sc = 1; T.spin = 0;
        const tg = G.targets[i]; if (!tg || S.wait[i] || b.root.classList.contains('empty')) { T.g.visible = false; return; }
        const r = b.aq.getBoundingClientRect(); if (r.width < 4) { T.g.visible = false; return; }
        const op = parseFloat(getComputedStyle(b.root).opacity); if (!(op > .02)) { T.g.visible = false; return; }
        const al = hudAl(); if (al < .02) { T.g.visible = false; return; } if (T.bornTg !== tg) { T.bornTg = tg; T.born = now + (window.__introTank ? i * .12 : 0); }
        const bk0 = Math.max(0, Math.min(1, (now - T.born) / .75)), bo = bk0 >= 1 ? 1 : 1 + 2.7 * Math.pow(bk0 - 1, 3) + 1.7 * Math.pow(bk0 - 1, 2), bsc = bk0 <= 0 ? .001 : Math.min(1, .55 + .45 * bo);   /* never lower or wider than its place: the overshoot used to push it over the Backup */   /* a new tank drops in from above with a springy overshoot, squashing a little as it lands, with a ring of droplets */
        setOp(T, op * al * Math.min(1, bk0 * 3)); place(T, r, bsc * .94, { dy: -Math.max(0, 1 - bo) * 90 - r.height * .05 });   /* a little smaller and lifted: the tank, its shadow and its base always stay clear of the Backup under it */ anim(T, now, dt, 0); lidStep(T, i, tg, now, dt);
        if (!T.landFx && bk0 >= .62 && bk0 < 1) { T.landFx = true; ovFx.emit(T.cx, T.cy + T.rh / 2, 14, 200, 0xdff6ff, 1.2); ovFx.emit(T.cx, T.cy + T.rh / 2, 8, 120, 0xffffff, 1); kick(.8); } if (bk0 <= .05) T.landFx = false;
      });
      for (let i = S.fx.length - 1; i >= 0; i--) { const T = S.fx[i]; clearStep(T, now, dt); if (!T.clear) { ov.scene.remove(T.g); S.fx.splice(i, 1); } }
      // the backup tank: shakes when almost full, cracks and bursts when it overflows
      const bk = $('backup'), br = bk.getBoundingClientRect(), BT = S.back || (S.back = make('backup'));
      if (!G.cfg.backup || br.width < 4) BT.g.visible = false;
      else {
        const n = G.backup.length, warn = n >= BACKUP_MAX - 1, B = S.brk, el = B ? now - B.t0 : 0;
        const sh = B ? (el < .35 ? 1.2 : 0) : warn ? (n >= BACKUP_MAX ? .5 : .22) : 0, pulse = warn || B ? .5 + .5 * Math.sin(now * 9) : 0;
        if (!B || !B.shattered) {
          place(BT, br, 1, { dx: Math.sin(now * 44) * 2.4 * sh, dy: Math.cos(now * 37) * 1.3 * sh, rz: Math.sin(now * 31) * .02 * sh }); const al = hudAl() * (window.__bkA ?? 1); if (al < .02) BT.g.visible = false; else setOp(BT, al); anim(BT, now, dt, warn || B ? pulse * (n >= BACKUP_MAX ? 1 : .6) : 0);
        } else BT.g.visible = false;
        { const hot = B ? 1 : n >= BACKUP_MAX ? 1 : warn ? .85 : 0, u = BT.cage.uniforms, arr = u.uBx.value, sl = [...bk.querySelectorAll('.slot')];   /* the bars sit between the slots; the warning light follows how full the cell is */
          for (let k = 0; k <= 7; k++) { if (k === 0) arr[k] = .014; else if (k === 7) arr[k] = .986; else { const a0 = sl[k - 1], b0 = sl[k]; arr[k] = a0 && b0 ? ((a0.getBoundingClientRect().right + b0.getBoundingClientRect().left) / 2 - br.left) / br.width : k / 7; } }   /* the bars inside the three cells of a squid are taken out: they are one cell for it, so no bar crosses it */
          if (n > BT.lastN) BT.sl = Math.min(1.3, BT.sl + 1); BT.lastN = n; BT.sl *= Math.exp(-dt * 1.6); u.uT.value = now; u.uHot.value = hot; u.uSl.value = BT.sl; cageFrame(BT, arr); }   /* a fish dropped in: the water of the cell sloshes */   // a soft red 3D glow on the rim, pulsing gently
        if (B) {
          { const pr = B.shattered ? 0 : clamp(el / .3, 0, 1), cnt = BT.cracks.geometry.attributes.position.count; BT.cracks.geometry.setDrawRange(0, Math.floor(cnt * pr / 2) * 2); BT.cracks.material.opacity = pr > 0 ? 1 : 0; BT.cracks2.material.opacity = pr > 0 ? .55 : 0; }
          if (el >= .35 && !B.shattered) {
            B.shattered = true; BT.front.visible = false; BT.shim.visible = false; BT.g.visible = false; BT.cracks.material.opacity = BT.cracks2.material.opacity = 0; tankPieces(BT, br);
            const cx = br.left + br.width / 2, cy = br.top + br.height / 2; ovFx.emit(cx, cy, 60, 330, 0xbfeaff, 1.6); ovFx.emit(cx, cy, 30, 220, 0xffffff, 1.6); kick(5); Snd.play('bbreak');
            for (let k = 0; k < 64; k++) { const px = cx + rand(-.5, .5) * br.width, py = cy + rand(-.5, .5) * br.height, an = Math.atan2(py - cy, px - cx) + rand(-.4, .4), sp = rand(260, 760) * (k < 20 ? .7 : 1); shardSpawn(px, py, Math.cos(an) * sp, -Math.sin(an) * sp + rand(60, 320), k < 20 ? rand(22, 44) : rand(6, 20)); }
          }
          if (B.shattered) {
            BT.drain = 1;   // the tank is gone: it flew apart in pieces
            for (const f of B.fish) if (f && !f.hit && el >= .55 + f.delay) {   // each fish hits the glass: water splashes right there
              f.hit = true; glassWater.hit(f.tx, f.ty, rand(60, 90), f.dwell); ovFx.emit(f.tx, f.ty, 18, 300, 0xdff4ff, 1.2); ovFx.emit(f.tx, f.ty, 6, 200, 0xffffff, 1); kick(3); if ((B.n = (B.n || 0) + 1) % 3 === 1) Snd.play('splash');
              if (!B.hit) { B.hit = true; kick(7); Snd.play('bad'); document.body.style.setProperty('--wt', (3.7 - el) + 's'); document.body.classList.add('wet'); window.__wetT0 = performance.now(); window.__wetDur = 3.7 - el; }
            }
            if (el >= .7 && !B.hit && !B.fish.some(f => f)) for (let k = 0; k < 4; k++) B.fish.push({ sp: null, tx: ov.W * rand(.2, .8), ty: ov.H * rand(.3, .65), delay: 0, hit: false, gone: true });   // nothing to throw: the water still hits
            if (el >= .5 && !paused) paused = true;   // the whole game stalls for a moment
          }
        }
      }
      if (S.pieces) { const P = S.pieces; P.life += dt; for (const q of P.pcs) { q.vy -= 1500 * dt; q.mesh.position.x += q.vx * dt; q.mesh.position.y += q.vy * dt; q.mesh.rotation.z += q.vr * dt; q.mesh.rotation.x += q.vx3 * dt; q.mesh.rotation.y += q.vy3 * dt; const o = 1 - clamp((P.life - .7) / .5, 0, 1); q.m.opacity = o; q.em.opacity = .9 * o; }
        if (P.life > 1.3) { ov.scene.remove(P.g); P.pcs.forEach(q => { q.m.dispose(); q.em.dispose(); q.mesh.geometry.dispose(); }); S.pieces = null; } }
      for (let i = S.shards.length - 1; i >= 0; i--) { const s = S.shards[i]; s.life += dt; s.vy -= 900 * dt; s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.rotation.z += s.vr * dt; s.m.rotation.x += s.vx3 * dt; s.m.rotation.y += s.vy3 * dt; s.mat.opacity = Math.max(0, .62 - s.life * .45); s.em.opacity = Math.max(0, 1 - s.life * .7); if (s.life > 1.4) { ov.scene.remove(s.m); s.mat.dispose(); s.em.dispose(); S.shards.splice(i, 1); } }
      levelOrb(dt); cheerUpdate(dt); dropFx.update(dt, dropLand); ovFx.update(dt); glassWater.update(dt);
    }
  };
})();
/* win sequence (about 3.5 s, then straight into the next level):
   1  the fish wind up through the tank in a spiral, each leaving a glowing ribbon behind it; rings of light rise from the floor; the camera climbs from the tank to the rim at the pace of the fish
   2  the ribbon opens upward: every fish leaps out over the rim along its own arc, still trailing light, and flies to one point above the tank
   3  the fish melt into a soap bubble that swells (and wobbles like jelly) with every fish that arrives
   4  the bubble bursts and "LEVEL COMPLETE" pops out (painted by paintWinText in src/ui/panels.ts)
   5  a burst of soap bubbles fills the screen, the next level is built behind them and they pop to show it
   A tap at any moment jumps to step 5. */
function winStopEvents() {   // the level is won: no random event may start or stay (a stray event item used to hang in the middle of the win screen)
  G.nextEv = G.nextFeed = G.nextStartle = G.nextSwarm = 1e9; if (G.waves) G.waves.length = 0; resetEvents();
}
function winPrep() {   // before the last bubble arrives: the fish slow down and drift up
  for (const o of G.things) if (o.alive && o.kind === 'fish' && !o.big && !o.locked) { o.boost = 0; o.wp = new THREE.Vector3(o.pos.x, WATER_Y - .9, o.pos.z); o.wpT = 3; }
}
ov.cel = [];
const WIN = { brk: 1.0, burst: 4.6, cover: 5.6, N: 30 };
const ez = u => u * u * (3 - 2 * u), ezo = u => 1 - Math.pow(1 - u, 3);
/* a ribbon of light that follows a point: camera-facing strip, bright and wide at the head, thin and transparent at the tail */
const TRAIL_L = 15, trailMat = col => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false, uniforms: { uC: { value: new THREE.Color(col) }, uA: { value: 1 }, uT: { value: 0 }, uR: { value: 0 } },
  vertexShader: 'attribute float a; varying float vA; varying float vS; attribute float sd; void main(){ vA=a; vS=sd; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 uC; uniform float uA; uniform float uT; uniform float uR; varying float vA; varying float vS; void main(){ float edge=1.-abs(vS); float soft=smoothstep(0.,.65,edge); float flow=.78+.22*sin(vA*38.-uT*9.); vec3 water=mix(uC,vec3(1.),edge*vA*.55); vec3 rb=mix(.55+.45*cos(6.2832*(vA*.9+uT*.25+vec3(0.,.33,.67))),vec3(1.),.3+.3*edge); vec3 col=mix(water,rb,uR); float al=uA*pow(vA,1.4)*soft*flow*(.5+.22*uR); gl_FragColor=vec4(col, al); }' });   // a streak of water: soft edged, pale, rippling along its length, thinning to nothing
function makeTrail(col) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(TRAIL_L * 2 * 3), a = new Float32Array(TRAIL_L * 2), sd = new Float32Array(TRAIL_L * 2), idx = [];
  for (let i = 0; i < TRAIL_L; i++) { a[i * 2] = a[i * 2 + 1] = 1 - i / (TRAIL_L - 1); sd[i * 2] = -1; sd[i * 2 + 1] = 1; if (i < TRAIL_L - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('a', new THREE.BufferAttribute(a, 1)); g.setAttribute('sd', new THREE.BufferAttribute(sd, 1)); g.setIndex(idx);
  const m = new THREE.Mesh(g, trailMat(col)); m.frustumCulled = false; m.renderOrder = 14; scene.add(m);
  return { m, pts: [], tm: [], w: 1, alive: true };
}
const _tc = new THREE.Vector3(), _td = new THREE.Vector3(), _ts = new THREE.Vector3();
function trailUpdate(T, p, width, fade) {   // p: current point (or null to let the ribbon shrink back)
  if ((window.__winScale || 1) < .01) { /* frozen for inspection: the ribbon stays as it is */ } else if (p) { const now = performance.now() / 1000; T.pts.unshift(p.clone()); T.tm.unshift(now); while (T.pts.length > TRAIL_L || (T.pts.length > 2 && now - T.tm[T.tm.length - 1] > .2)) { T.pts.pop(); T.tm.pop(); } } else if (T.pts.length > 1) { T.pts.pop(); T.tm.pop(); }   // the ribbon only keeps the last fifth of a second, so a fast fish never drags a long line behind it
  const pos = T.m.geometry.attributes.position.array, n = T.pts.length;
  for (let i = 0; i < TRAIL_L; i++) {
    const q = T.pts[Math.min(i, n - 1)] || T.pts[0]; if (!q) continue; const nx = T.pts[Math.min(i + 1, n - 1)] || q, pv = T.pts[Math.max(0, Math.min(i, n - 1) - 1)] || q;
    _td.subVectors(pv, nx); if (_td.lengthSq() < 1e-8) _td.set(0, 1, 0); _td.normalize(); _tc.subVectors(q, cam.position).normalize(); _ts.crossVectors(_td, _tc).normalize();
    const w = width * (1 - i / (TRAIL_L - 1)) ** .7 * (i === 0 ? .6 : 1);
    pos[i * 6] = q.x - _ts.x * w; pos[i * 6 + 1] = q.y - _ts.y * w; pos[i * 6 + 2] = q.z - _ts.z * w; pos[i * 6 + 3] = q.x + _ts.x * w; pos[i * 6 + 4] = q.y + _ts.y * w; pos[i * 6 + 5] = q.z + _ts.z * w;
  }
  T.m.geometry.attributes.position.needsUpdate = true; T.m.material.uniforms.uA.value = fade; T.m.material.uniforms.uT.value = performance.now() / 1000; T.m.material.uniforms.uR.value += ((T.air ? 1 : 0) - T.m.material.uniforms.uR.value) * .25;
}
/* a real soap bubble: a sphere in the 3D scene, shaded with fresnel (clear in the middle, bright at the rim), a reflected sky, a thin-film colour shimmer and two window highlights; two layers (inside back face, outside front face) give it volume,
   and the fish that have flown into it are still seen through it */
const bubbleMat = back => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: back ? THREE.BackSide : THREE.FrontSide, fog: false, uniforms: { uT: { value: 0 }, uA: { value: 1 }, uW: { value: 0 } },
  vertexShader: 'uniform float uT; uniform float uW; varying vec3 vN; varying vec3 vV; void main(){ vec3 p=position*(1.+uW*(.07*sin(uT*13.+position.y*4.5)+.05*sin(uT*9.+position.x*5.+1.))); vec4 mv=modelViewMatrix*vec4(p,1.); vN=normalize(normalMatrix*normal); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }',
  fragmentShader: `uniform float uT; uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ vec3 N=normalize(vN); if(${back ? 'true' : 'false'}) N=-N; vec3 V=normalize(vV); float nv=clamp(dot(N,V),0.,1.); float f=pow(1.-nv,2.2);
    vec3 R=reflect(-V,N); vec3 sky=mix(vec3(.18,.45,.85),vec3(.95,.99,1.),smoothstep(-.3,.85,R.y));
    vec3 iri=.5+.5*cos(6.2832*(f*1.6+nv*.5+vec3(0.,.33,.67)+uT*.22+R.x*.4+R.y*.3));
    vec3 core=mix(vec3(1.,.82,.95),vec3(.7,.95,1.),.5+.5*sin(uT*2.+N.x*2.)); vec3 col=mix(vec3(.6,.88,1.),sky,clamp(f*1.3,0.,1.)); col=mix(col,core,pow(nv,2.5)*.4); col+=iri*(f*1.1+.28);
    float s1=pow(max(dot(R,normalize(vec3(-.45,.75,.5))),0.),70.)*1.3, s2=pow(max(dot(R,normalize(vec3(.6,-.3,.55))),0.),40.)*.45, rim=pow(1.-nv,6.)*.6;
    col+=vec3(1.)*(s1+s2+rim);
    float al=(${back ? '.07+f*.3' : '.14+f*.8+pow(nv,2.2)*.2'}+s1+s2*.6+rim*.5)*uA; gl_FragColor=vec4(col,clamp(al,0.,1.)); }` });
const glowTexW = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.35, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const starTexW = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.translate(64, 64); for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 4); const gr = g.createLinearGradient(-64, 0, 64, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,' + (k % 2 ? .45 : .95) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-64, -(k % 2 ? 1.6 : 3), 128, k % 2 ? 3.2 : 6); } const r = g.createRadialGradient(0, 0, 0, 0, 0, 22); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-64, -64, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const magicSprite = (tex, order) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 })); m.renderOrder = order; m.visible = false; scene.add(m); return m; };
function makeBubble() {
  const g = new THREE.SphereGeometry(1, 40, 28), back = new THREE.Mesh(g, bubbleMat(true)), front = new THREE.Mesh(g, bubbleMat(false)), grp = new THREE.Group();
  back.renderOrder = 15; front.renderOrder = 16; grp.add(back, front); grp.visible = false; scene.add(grp);
  grp.userData.glow = magicSprite(glowTexW, 14); grp.userData.rays = magicSprite(starTexW, 17); grp.userData.sparks = Array.from({ length: 20 }, () => magicSprite(starTexW, 18));   // the magic: a pulsing halo, slowly turning rays and sparkles orbiting the bubble
  return grp;
}
const _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _mc = new THREE.Color();
function bubbleMagic(b, pos, r, a, T) {
  const u = b.userData; cam.matrixWorld.extractBasis(_cr, _cu, _gd.set(0, 0, 0)); const vis = a > .01;
  u.glow.visible = u.rays.visible = vis; u.glow.position.copy(pos); u.rays.position.copy(pos);
  u.glow.scale.setScalar(r * (2.7 + .25 * Math.sin(T * 4))); _mc.setHSL((T * .12) % 1, 1, .68); u.glow.material.color.copy(_mc); u.glow.material.opacity = .62 * a;
  u.rays.scale.setScalar(r * 3.7); u.rays.material.rotation = T * .7; _mc.setHSL((T * .12 + .3) % 1, .6, .82); u.rays.material.color.copy(_mc); u.rays.material.opacity = .3 * a * (.75 + .25 * Math.sin(T * 6));
  u.sparks.forEach((sp, k) => { sp.visible = vis; const an = T * (1.1 + (k % 3) * .35) * (k % 2 ? 1 : -1) + k * .55, rad = r * (1.3 + .4 * Math.sin(T * 2.6 + k * 1.7)); sp.position.copy(pos).addScaledVector(_cr, Math.cos(an) * rad).addScaledVector(_cu, Math.sin(an) * rad * .85); sp.scale.setScalar(r * (.2 + .32 * Math.max(0, Math.sin(T * 7 + k * 2.1)))); sp.material.rotation = T * 2 + k; _mc.setHSL(((k * .11) + T * .1) % 1, .9, .8); sp.material.color.copy(_mc); sp.material.opacity = a * (.55 + .45 * Math.sin(T * 7 + k * 2.1)); });
}
function bubbleSet(b, pos, rWorld, a, wob, T) { bubbleMagic(b, pos, rWorld, a, T); b.visible = a > .01; b.position.copy(pos); b.scale.setScalar(Math.max(.001, rWorld)); for (const m of b.children) { m.material.uniforms.uT.value = T; m.material.uniforms.uA.value = a; m.material.uniforms.uW.value = wob; } }
const beadFx = (() => {   // little bubbles and sparkles that stay in the water behind a fish, drift up and fade
  const N = 420, pos = new Float32Array(N * 3), al = new Float32Array(N), sz = new Float32Array(N), kd = new Float32Array(N), vel = new Float32Array(N * 3), life = new Float32Array(N), s0 = new Float32Array(N); let head = 0, mesh = null;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('alpha', new THREE.BufferAttribute(al, 1)); geo.setAttribute('size', new THREE.BufferAttribute(sz, 1)); geo.setAttribute('kind', new THREE.BufferAttribute(kd, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false, uniforms: { uK: { value: 600 } },
    vertexShader: 'attribute float alpha; attribute float size; attribute float kind; uniform float uK; varying float vA; varying float vK; void main(){ vA=alpha; vK=kind; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=clamp(size*uK/max(.1,-mv.z),1.,70.); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying float vA; varying float vK; void main(){ vec2 p=gl_PointCoord-.5; float d=length(p)*2.; float a; vec3 c; if(vK<.5){ float ring=smoothstep(1.,.8,d)*smoothstep(.4,.82,d); float fill=smoothstep(1.,.1,d)*.1; float hl=smoothstep(.2,0.,length(p-vec2(-.17,-.17)))*.9; a=ring*.75+fill+hl; c=vec3(.85,.97,1.); } else { float st=max(smoothstep(.07,0.,abs(p.x))*smoothstep(.5,0.,abs(p.y)),smoothstep(.07,0.,abs(p.y))*smoothstep(.5,0.,abs(p.x))); a=st+smoothstep(.35,0.,length(p))*.5; c=vec3(1.,.97,.85); } if(a*vA<.01) discard; gl_FragColor=vec4(c,clamp(a*vA,0.,1.)); }' });
  return {
    add() { if (!mesh) { mesh = new THREE.Points(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 12; scene.add(mesh); } },
    remove() { if (mesh) { scene.remove(mesh); mesh = null; } life.fill(0); al.fill(0); },
    emit(p, kind, size, spread) { const i = head; head = (head + 1) % N; pos[i * 3] = p.x + (Math.random() - .5) * spread; pos[i * 3 + 1] = p.y + (Math.random() - .5) * spread; pos[i * 3 + 2] = p.z + (Math.random() - .5) * spread; vel[i * 3] = (Math.random() - .5) * .25; vel[i * 3 + 1] = .25 + Math.random() * .5; vel[i * 3 + 2] = (Math.random() - .5) * .25; life[i] = kind ? .55 + Math.random() * .4 : .9 + Math.random() * .9; s0[i] = size; kd[i] = kind; sz[i] = size; },
    update(dt) { if (!mesh) return; mat.uniforms.uK.value = renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360));
      for (let i = 0; i < N; i++) { if (life[i] <= 0) { al[i] = 0; continue; } life[i] -= dt; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt; const l = Math.max(0, life[i]); al[i] = Math.min(1, l * 2.2) * (kd[i] ? .75 + .25 * Math.sin(l * 40) : .9); sz[i] = s0[i] * (kd[i] ? .6 + .4 * l : 1); }
      geo.attributes.position.needsUpdate = geo.attributes.alpha.needsUpdate = geo.attributes.size.needsUpdate = true; }
  };
})();
const VY0 = FLOOR_Y + .5, VYH = WATER_Y - FLOOR_Y - .9;   // the height range of the helix
function makeVortex() {   // the water itself turns: bubbles and stirred-up sand specks are carried round the axis (faster near the middle, narrower deeper down, like a real whirl), with a thin thread of air down the core
  const mkPts = (n, map, size, color, blend, op) => { const pos = new Float32Array(n * 3), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map, size, color, transparent: true, opacity: 0, depthWrite: false, blending: blend, fog: false })); pts.frustumCulled = false; pts.renderOrder = 12; pts.visible = false; scene.add(pts); return { pts, pos, geo, n }; };
  const bub = mkPts(300, dotTex(true), .11, 0xdff6ff, THREE.AdditiveBlending, .5), spk = mkPts(260, dotTex(false), .1, 0xe6d3a3, THREE.NormalBlending, .75);
  const mk = n => Array.from({ length: n }, () => ({ r: .3 + Math.pow(Math.random(), .8) * (R - .75), th: Math.random() * 6.2832, k0: Math.random(), sp: .6 + Math.random() * .8 }));
  return { bub, spk, bb: mk(300), sb: mk(260), core: Array.from({ length: 40 }, () => ({ th: Math.random() * 6.2832, k0: Math.random(), sp: .5 + Math.random() * .6 })), S: 0 };
}
const _vo = (r, S) => 3.6 / (1 + (r / .9) * (r / .9)) * S;   // angular position gained: fast in the middle, slower out by the glass
function vortexUpdate(V, T, s, dt) {
  V.S += s * dt; const on = s > .01;
  for (const o of [V.bub, V.spk]) o.pts.visible = on;
  V.bub.pts.material.opacity = .5 * s; V.spk.pts.material.opacity = .75 * s; if (!on) return;
  const H = WATER_Y - FLOOR_Y - .15, S = V.S;
  for (let i = 0; i < 300; i++) {
    let x, y, z;
    if (i < 260) { const b = V.bb[i], k = ((b.k0 + S * .11 * b.sp) % 1), yy = FLOOR_Y + .1 + k * H, fun = .5 + .5 * Math.min(1, (yy - FLOOR_Y) / H), r = b.r * fun, an = b.th + _vo(r, S) * (1 + .4 * (1 - k)); x = Math.cos(an) * r; y = yy; z = Math.sin(an) * r; }
    else { const c = V.core[i - 260 < 40 ? i - 260 : 0], k = ((c.k0 + S * .22 * c.sp) % 1), yy = WATER_Y - .1 - k * 1.9, r = .05 + .12 * k, an = c.th + S * 7.5 + k * 12; x = Math.cos(an) * r; y = yy; z = Math.sin(an) * r; }
    V.bub.pos[i * 3] = x; V.bub.pos[i * 3 + 1] = y; V.bub.pos[i * 3 + 2] = z;
  }
  V.bub.geo.setDrawRange(0, 300); V.bub.geo.attributes.position.needsUpdate = true;
  for (let i = 0; i < 260; i++) {   // sand: lifted off the floor by the current, thrown outwards and lower down than the bubbles
    const b = V.sb[i], k = ((b.k0 + S * .07 * b.sp) % 1), yy = FLOOR_Y + .08 + Math.pow(k, .8) * 2.6, r = b.r * (.55 + .45 * Math.min(1, (yy - FLOOR_Y) / 2.2)), an = b.th + _vo(r, S) * 1.15;
    V.spk.pos[i * 3] = Math.cos(an) * r; V.spk.pos[i * 3 + 1] = yy; V.spk.pos[i * 3 + 2] = Math.sin(an) * r;
  }
  V.spk.geo.attributes.position.needsUpdate = true;
}
function celebrate() {
  window.__hudFadeT0 = performance.now(); window.__hudInT0 = undefined;   // the top UI fades away as the win sequence starts
  Snd.bgmStop(2.4); kick(2.5); const gw = gid, cr = canvas.getBoundingClientRect(); saveWin();
  const all = shuffle(G.things.filter(o => o.alive && o.kind === 'fish' && !o.big && !o.locked && !o.launch && !o.dive && !o.tubeP)), fish = all.slice(0, 10), watchers = all.slice(10).concat(G.things.filter(o => o.alive && o.kind === 'fish' && !all.includes(o) && !o.big && !o.launch && !o.dive && !o.tubeP));   // up to 10 fish take part; the others stay in the water and watch from the glass
  const W = G.win = { gid: gw, t: 0, cam0: { az: orbit.az, el: orbit.el, dist: orbit.dist, ty: orbit.target.y }, fish, arrived: 0, burst: false, cover: false, gp: new THREE.Vector3(0, TANK_H + 2, 0), sx: cr.left + cr.width / 2, sy: cr.top + cr.height * .4, n: fish.length, trails: [], rings: [], bub: makeBubble(), vort: makeVortex(), rOrb: 1.6 };
  beadFx.add(); const COLS = [0xaee9ff, 0x9fdcff, 0xc9f4ff, 0xb6efe8, 0xd4ecff], byY = fish.slice().sort((p, q) => p.pos.y - q.pos.y);
  const calm = o => { o.hv = 0; o.hvT = 0; o.hinted = false; if (o.parts.setGlow) o.parts.setGlow(0); if (o.parts.glows) for (const m of o.parts.glows) m.visible = false; if (o.mark) { fishRoot.remove(o.mark); o.mark = null; } };   // no gold highlight on any fish during the sequence
  W.watchers = watchers; watchers.forEach(o => { o.speed0 = o.speed; o.jumper = Math.random() < .42; calm(o); o.locked = false; o.wp0y = o.pos.y; const an = rand(0, 6.283), wr = Math.max(1.2, wallAt(Math.cos(an), Math.sin(an), WATER_Y - 2) - .55); o.wp = new THREE.Vector3(Math.cos(an) * wr, rand(FLOOR_Y + .8, WATER_Y - .9), Math.sin(an) * wr); o.wpT = 12; o.boost = 3.2; o.winWall = wr; o.winAng = an; o.pos.y = Math.min(o.pos.y, WATER_Y - 2.5); });   /* every other fish presses against the glass, out of the middle where the chosen ones swirl */
  fish.forEach((o, i) => {   // the chosen fish are beads on 2 or 3 helices: each one swims on from where it is to its place on a strand, the highest fish in front
    const STR = fish.length <= 9 ? 2 : 3, idx = byY.indexOf(o), strand = idx % STR, rk = Math.floor(idx / STR);
    o.vtx = { mode: 'helix', th0: strand * 6.2832 / STR + .4, rr: .97 + Math.random() * .06, dy: rand(-.08, .08), s0: rk * .085 - .05 + strand * (.085 / STR), ang: idx / fish.length * 6.2832 + rand(-.2, .2), om: rand(2.6, 4.1) * (Math.random() < .5 ? 1 : -1), rf: rand(.85, 1.2), ...orbitPlane(), last: o.pos.clone(), dur: rand(.75, .95), trail: makeTrail(COLS[i % COLS.length]) };
    W.trails.push(o.vtx.trail); calm(o); o.boost = 2; o.turnV = 1.8; o.dir.set(0, 0, 1);
  });
}
function winCleanup(W) { for (const T of W.trails) { scene.remove(T.m); T.m.geometry.dispose(); T.m.material.dispose(); } for (const r of W.rings) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); } if (W.bub) { const u = W.bub.userData; for (const sp of [u.glow, u.rays, ...u.sparks]) { scene.remove(sp); sp.material.dispose(); } scene.remove(W.bub); W.bub.children.forEach(m => m.material.dispose()); W.bub.children[0].geometry.dispose(); W.bub = null; } if (W.vort) { for (const o of [W.vort.bub, W.vort.spk]) { scene.remove(o.pts); o.geo.dispose(); o.pts.material.map.dispose(); o.pts.material.dispose(); } W.vort = null; } W.trails.length = 0; W.rings.length = 0; beadFx.remove(); }
function fitDecor() {   // every piece of decor must stay inside the glass: anything that reaches past it is slid toward the middle by exactly the overshoot
  tank.updateMatrixWorld(true); const box = new THREE.Box3(), inv = new THREE.Matrix4().copy(tank.matrixWorld).invert(), LIM = R - .22, cnt = { moved: 0 };
  for (const g of themeG) { g.updateMatrixWorld(true); for (const m of g.children) {
    box.setFromObject(m); box.applyMatrix4(inv); const rx = Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), rz = Math.max(Math.abs(box.min.z), Math.abs(box.max.z)); let rm = 0;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) rm = Math.max(rm, Math.hypot(x, z)); void rx; void rz;
    if (rm > LIM) { const pr = Math.hypot(m.position.x, m.position.z); if (pr > 1e-3) { const k = Math.max(0, pr - (rm - LIM)) / pr; m.position.x *= k; m.position.z *= k; cnt.moved++; } }
    if (box.max.y > TANK_H - .1) m.position.y -= box.max.y - (TANK_H - .1); } }
  return cnt.moved;
}
const SPIRAL_V = 1 / 2.2;   // the helix is climbed in 2.2 s
const helixPt = (s2, T, V, out) => {   // a point on the helix: it winds 2 turns up the tank, narrow at the bottom and opening toward the top, and the whole thing turns slowly
  const k = clamp(s2, 0, 1), y = FLOOR_Y + .5 + k * (WATER_Y - FLOOR_Y - .9) + V.dy, rad = 1.95 * Math.pow(1 - k, .7) * V.rr + .5, an = V.th0 + 6.2832 * 2 * k + T * 1.2;
  const kk = shK(Math.cos(an), Math.sin(an), y);
  return out.set(Math.cos(an) * rad * kk, y, Math.sin(an) * rad * kk);
};
const _hp = new THREE.Vector3(), _fa = new THREE.Color(), _ev = new THREE.Vector3();
function fishFade(o, a) {   // fade a fish out (it is being absorbed by the bubble)
  if (!o.fadeInit) { o.fadeInit = true; o.group.traverse(n => { if (n.isMesh && n.material && !n.userData.pickOnly && n.material.blending !== THREE.AdditiveBlending) { n.material.transparent = true; n.material.needsUpdate = true; } }); }
  o.group.traverse(n => { if (n.isMesh && n.material && !n.userData.pickOnly && n.material.blending !== THREE.AdditiveBlending) n.material.opacity = a; });
}
const _bz = new THREE.Vector3(), _oc = new THREE.Vector3(), _oR = new THREE.Vector3(), _oU = new THREE.Vector3(), _oB = new THREE.Vector3(), OMEGA = 3.3;
function orbitPlane() {   // every fish gets its own tilted orbit round the bubble: together they wrap it from every side, like electrons round a nucleus
  const n = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), ref = Math.abs(n.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), e1 = new THREE.Vector3().crossVectors(n, ref).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
  return { e1, e2 };
}
function orbitPt(W, V, T, out) { const an = V.ang + V.om * T, R0 = Math.min(1.0, W.rOrb) * V.rf; return out.copy(W.gp).addScaledVector(V.e1, Math.cos(an) * R0).addScaledVector(V.e2, Math.sin(an) * R0); }
function bez(a, c, b2, e, out) { const k = 1 - e; return out.set(k * k * a.x + 2 * k * e * c.x + e * e * b2.x, k * k * a.y + 2 * k * e * c.y + e * e * b2.y, k * k * a.z + 2 * k * e * c.z + e * e * b2.z); }
function vortexStep(o, dt, t) {   // a chosen fish in the win sequence: helix up, an arc out over the rim, circling the bubble, then an arc back into the water
  const W = G.win, V = o.vtx, T = W ? W.t : 99; if (!W) { o.vtx = null; return; }
  let flying = false;
  if (V.mode === 'helix') {
    const sNow = V.s0 + Math.max(0, T - .4) * SPIRAL_V; helixPt(sNow, T, V, _hp);   // the target slides up its strand; the fish chases it, slowly at first (it has to turn and swim to the strand from wherever it was), then tightly
    const kk = lerp(2.4, 15, ez(clamp((T - .2) / 1.3, 0, 1))), f = 1 - Math.exp(-dt * kk); o.pos.x += (_hp.x - o.pos.x) * f; o.pos.y += (_hp.y - o.pos.y) * f; o.pos.z += (_hp.z - o.pos.z) * f;
    if (sNow >= 1) { V.mode = 'fly'; V.b = o.pos.clone(); V.t0 = T; const out = new THREE.Vector3(V.b.x, 0, V.b.z).normalize(); V.c = new THREE.Vector3((V.b.x + W.gp.x) * .5 + out.x * rand(.4, .9), Math.min(W.gp.y - .1, V.b.y + 2.6), (V.b.z + W.gp.z) * .5 + out.z * rand(.4, .9)); W.anyOut = true;   // it keeps rising all the way to its orbit: nose up, never diving into it
 burstFx.emit(V.b, 0xffffff, 6, 1); }
  } else if (V.mode === 'fly') {   // out of the water in an arc over the rim to its place on the ring round the bubble
    const u = clamp((T - V.t0) / V.dur, 0, 1), e = u * u * (3 - 2 * u); V.u = u; orbitPt(W, V, T, _oc); bez(V.b, V.c, _oc, e, _bz); o.pos.copy(_bz); flying = true;
    if (!V.splashed && V.last.y < WATER_Y - .05 && o.pos.y >= WATER_Y - .05) { V.splashed = true; surfaceSplash(o.pos.x, o.pos.z, .9); exitSpray(o.pos.x, o.pos.z, _ev.set((o.pos.x - V.last.x) / Math.max(dt, .001), (o.pos.y - V.last.y) / Math.max(dt, .001), (o.pos.z - V.last.z) / Math.max(dt, .001))); addRipple(o.pos.x, o.pos.z, .08); burstFx.emit(new THREE.Vector3(o.pos.x, WATER_Y - .05, o.pos.z), 0xffffff, 8, 1.1); if (Math.random() < .3) Snd.play('splash'); }
    if (u >= 1) { V.mode = 'orbit'; W.arrived++; W.pulse = W.t; beadFx.emit(o.pos, 1, .2, .3); }
  } else if (V.mode === 'orbit') {   // circling the bubble
    orbitPt(W, V, T, _oc); o.pos.copy(_oc); flying = true;
    if (W.burst && T >= V.homeAt) { V.mode = 'home'; V.hb = o.pos.clone(); V.ht0 = T; const an = rand(0, 6.283), rr = rand(.5, RF * .85), hd = new THREE.Vector3(Math.cos(an) * rr, WATER_Y - .1, Math.sin(an) * rr), g = 11, vy0 = rand(3.2, 5.2), y0 = V.hb.y, tf = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * Math.max(0.1, y0 - hd.y))) / g; V.hv = new THREE.Vector3((hd.x - V.hb.x) / tf, vy0, (hd.z - V.hb.z) / tf); V.hg = g; V.htf = tf; V.hspin = rand(-1, 1) * 9; V.splashed = false; burstFx.emit(V.hb, 0xffffff, 6, 1.2); }
  } else if (V.mode === 'home') {   // thrown out of the burst: up, over and down into the water in a ballistic arc, tumbling
    const q = Math.min(V.htf, T - V.ht0); o.pos.set(V.hb.x + V.hv.x * q, V.hb.y + V.hv.y * q - .5 * V.hg * q * q, V.hb.z + V.hv.z * q); flying = true;
    if (!V.splashed && q >= V.htf) { V.splashed = true; surfaceSplash(o.pos.x, o.pos.z, 1.1); addRipple(o.pos.x, o.pos.z, .1); burstFx.emit(new THREE.Vector3(o.pos.x, WATER_Y - .05, o.pos.z), 0xffffff, 12, 1.3); burstFx.emit(new THREE.Vector3(o.pos.x, WATER_Y - .05, o.pos.z), 0xbfeaff, 8, 1.8); Snd.play('splash'); if (W.firstHome === undefined) W.firstHome = W.t; }
    if (q >= V.htf) { const dx = V.hv.x, dz = V.hv.z, dl = Math.hypot(dx, dz) || 1; o.vtx = null; o.boost = 2.6; o.dir.set(dx / dl, -.9, dz / dl).normalize(); o.wp = new THREE.Vector3(o.pos.x + rand(-1.2, 1.2), clamp(WATER_Y - rand(2.4, 3.4), FLOOR_Y + .8, WATER_Y - 1.6), o.pos.z + rand(-1.2, 1.2)); o.wpT = 3; o.plg = .7;   /* it sinks by its inertia, then rises */ V.trail.done = true; return; }
  }
  o.group.position.copy(o.pos);
  const vx = o.pos.x - V.last.x, vy = o.pos.y - V.last.y, vz = o.pos.z - V.last.z, vl = Math.hypot(vx, vy, vz); V.last.copy(o.pos);
  if (vl > 1e-4) { const yaw = Math.atan2(-vz, vx), pitch = clamp(Math.asin(clamp(vy / vl, -1, 1)), -1.2, 1.2), roll = V.mode === 'home' ? (T - V.ht0) * V.hspin : flying ? Math.sin(T * 12 + V.th0) * .3 : -.4; Y.set(roll, yaw, pitch, 'YZX'); qT.setFromEuler(Y); o.group.quaternion.slerp(qT, 1 - Math.exp(-dt * 14)); }
  o.boost = flying ? 2.2 : 1.7; o.turnV = flying ? 0 : 1.8; o.wph = (o.wph === undefined ? o.phase : o.wph) + dt * o.wag * (.7 + o.speed) * 3.4; if (o.parts.update) o.parts.update(dt * 2.2, o);   // a lively swim all the way: the body wave is at full strength and the body bends into the turn
  o.parts.tail.rotation.y = Math.sin(o.wph) * (SWAY.tail + .28); o.parts.body.rotation.y = Math.sin(o.wph + 1.2) * (SWAY.body + .06);
  trailUpdate(V.trail, o.pos, .085 * ez(clamp(T / .3, 0, 1)), 1);   // the water streak behind it
  if ((window.__winScale || 1) > .01) { const n = V.trail.pts.length; if (Math.random() < dt * 6 && n > 5) beadFx.emit(V.trail.pts[Math.min(n - 1, 4 + (Math.random() * 6 | 0))], 0, .045 + Math.random() * .05, .1); if (Math.random() < dt * 8 && n > 2) beadFx.emit(V.trail.pts[Math.min(n - 1, 1 + (Math.random() * 4 | 0))], 1, .14 + Math.random() * .14, .14); }
}
const _gv = new THREE.Vector3(), _gd = new THREE.Vector3(), _ct = new THREE.Vector3();
function placeCam(az, el, dist, ty) { const ce = Math.cos(el); _ct.set(orbit.target.x, ty, orbit.target.z); cam.position.set(_ct.x + dist * ce * Math.sin(az), _ct.y + dist * Math.sin(el), _ct.z + dist * ce * Math.cos(az)); cam.lookAt(_ct); cam.updateMatrixWorld(); scene.fog.near = dist - R * .9; scene.fog.far = dist + R * 2.4; orbit.target.y = ty; }
function winCam(c, T) {   // the camera starts by pulling back wide, then closes in step by step while it climbs through the tank to the rim, drifting a little the way the fish turn
  const out = ez(clamp(T / .7, 0, 1)), inn = ez(clamp((T - .7) / 3.3, 0, 1)), climb = ez(clamp((T - .2) / 3.4, 0, 1)), swing = ez(clamp(T / 4.4, 0, 1));
  const base = orbit.fit, ty0 = PAN_Y0, ty = lerp(ty0, TANK_H + .1, climb), dist = base * (1 + .3 * out - .52 * inn), el = .3 + .1 * climb, az = c.az - .34 * swing; placeCam(az, el, dist, ty); return { az, el, dist, ty };   // (always from the standard framing, whatever the player had zoomed to, so every level gets the same close camera)
}
function celUpdate(dt) {
  const W = G && G.win; if (!W) { if (VORT.v.x) VORT.v.x = 0; LENS.sw = 0; return; } if (W.gid !== gid) { winCleanup(W); G.win = null; window.__winText = undefined; return; }
  W.t += dt * (window.__winScale || 1); const T = W.t; if (!W.swirlSnd && T >= 1.1) { W.swirlSnd = true; Snd.play('swirl'); }   /* after the camera has pulled back, as the fish are winding up the helix */
   { const sw = ez(clamp((T - .15) / 1.0, 0, 1)) * (1 - ez(clamp((T - 3.0) / 1.2, 0, 1))); VORT.v.x = sw; VORT.v.y = -3.6 * T; LENS.sw = sw; if (W.vort) vortexUpdate(W.vort, T, sw, dt * (window.__winScale || 1)); sloshV.x += Math.cos(T * 4.2) * 3.5 * sw * dt; sloshV.y += Math.sin(T * 4.2) * 3.5 * sw * dt; }   // the whole water sways and shakes with the whirl: a rotating push on the surface tilt

  const  c = W.cam0; camTween.on = false; orbit.azV = 0; orbit.elV = 0;
  if (W.rinse) {   // the water of the lose animation hits the glass: the screen frosts, the next level is built behind it, the water runs down and the frost clears
    const R0 = W.rinse; placeCam(R0.end.az, R0.end.el, R0.end.dist, R0.end.ty);
    if (!R0.closedAt && R0.cu.p() > .96) R0.closedAt = performance.now();
    if (R0.closedAt && performance.now() - R0.closedAt > 220) {   // the curtains are shut and have settled: build the next level behind them, then open them
      const end = R0.end; winCleanup(W); G.win = null; window.__noIntro = true; nextLevel(c); winOut = { t0: performance.now(), c, end }; Snd.play('curtainopen', { at: .12 }); setTimeout(() => R0.cu.to(0), 120);
    }
    return;
  }
  if (W.watchers) for (const o of W.watchers) {   // the others, driven here (after every other update, so nothing can pull them back): out to the glass along their own angle and shape, down, then slowly up looking at the swirl; some jump in a small arc when the first swirling fish touches the water
    if (!o.alive || !o.group || o.gone) continue; const T2 = W.t, u = ez(clamp((T2 - 1.6) / 3.2, 0, 1)), ty = lerp(FLOOR_Y + .45, WATER_Y - .65, u);
    if (o.jumper && W.firstHome !== undefined && o.hop === undefined) { const an = rand(0, 6.283), rr = rand(.3, Math.max(.6, wallAt(Math.cos(an), Math.sin(an), WATER_Y) - 1.2)); o.hop = { t0: W.firstHome + rand(0, .18), p0: o.pos.clone(), p1: new THREE.Vector3(Math.cos(an) * rr, WATER_Y - .6, Math.sin(an) * rr), done: false }; }
    o.boost = 0; o.speed = .05; o.vtx = o.vtx || null; let yaw = null, pit = 0; if (o.winPos) o.pos.copy(o.winPos);   /* start from where this controller left it, not from where the fish's own update drifted it: two writers made it jitter */
    if (o.hop) {
      const h = o.hop, uu = (T2 - h.t0) / .85;
      if (uu >= 0 && uu <= 1) { o.pos.x = lerp(h.p0.x, h.p1.x, uu); o.pos.z = lerp(h.p0.z, h.p1.z, uu); o.pos.y = lerp(h.p0.y, h.p1.y, uu) + Math.sin(Math.PI * uu) * .7; const dx = h.p1.x - h.p0.x, dz = h.p1.z - h.p0.z; yaw = Math.atan2(-dz, dx); pit = Math.atan2(Math.cos(Math.PI * uu) * .7 * Math.PI + (h.p1.y - h.p0.y), Math.hypot(dx, dz) || 1); if (!h.done && o.pos.y > WATER_Y) { h.done = true; surfaceSplash(o.pos.x, o.pos.z, .6, true); } }
      else if (uu > 1) { surfaceSplash(o.pos.x, o.pos.z, .5, true); o.hop = null; o.winWall = 0; o.wp.set(o.pos.x, o.pos.y, o.pos.z); o.speed = o.speed0 ?? o.speed; }
    } else if (o.winWall) {
      const ca = Math.cos(o.winAng), sa = Math.sin(o.winAng), wr2 = Math.max(1.2, wallAt(ca, sa, o.pos.y) - .38 - .3 * (o.sz || 1)), ex = ca * wr2 - o.pos.x, ez2 = sa * wr2 - o.pos.z, k2 = Math.min(1, dt * 5);   // .38 from the glass: against it, never through it
      o.pos.x += ex * k2; o.pos.z += ez2 * k2; const tgy = T2 < 1.6 ? FLOOR_Y + .45 + (o.winAng % 1) * .25 : ty, dy = tgy - o.pos.y; o.pos.y += Math.sign(dy) * Math.min(Math.abs(dy), (T2 < 1.6 ? 4 : 1.3) * dt); o.speed = Math.abs(dy) > .08 ? (T2 < 1.6 ? 2.2 : 1.1) : .05;   /* while it moves up or down it swims: the tail beats in proportion to how fast */
      const rr0 = Math.hypot(o.pos.x, o.pos.z) || 1; yaw = Math.atan2(o.pos.z / rr0, -o.pos.x / rr0); pit = T2 < 1.6 ? -.5 : .55;   // facing the middle, nose up once they have dived
    }
    (o.winPos = o.winPos || new THREE.Vector3()).copy(o.pos); o.group.position.copy(o.pos); if (yaw !== null) { Y.set(0, yaw, pit, 'YZX'); qT.setFromEuler(Y); o.group.quaternion.slerp(qT, 1 - Math.exp(-dt * 12)); }
  }
  const cam1 = winCam(c, T);
  for (const r of W.rings) { const q = clamp((T - r.d) / 1.0, 0, 1); r.m.visible = q > 0 && q < 1; if (r.m.visible) { r.m.position.set(0, lerp(FLOOR_Y + .1, WATER_Y - .3, ezo(q)), 0); r.m.scale.setScalar(RF * (1.05 - .45 * q) * ringK(r.m.position.y)); r.m.material.opacity = .5 * Math.sin(Math.PI * q) ** 1.2; } }
  for (const T2 of W.trails) if (T2.done) { if (T2.doneT === undefined) T2.doneT = T; trailUpdate(T2, null, .05, clamp(1 - (T - T2.doneT) / .5, 0, 1)); if (T - T2.doneT > .5) T2.m.visible = false; }
  // the gathering point: the world point behind the screen spot where the bubble hangs, at the depth of the tank's middle
  const cr = canvas.getBoundingClientRect(); _gv.set(((W.sx - cr.left) / cr.width) * 2 - 1, -((W.sy - cr.top) / cr.height) * 2 + 1, .5).unproject(cam); _gd.copy(_gv).sub(cam.position).normalize(); W.gp.copy(cam.position).addScaledVector(_gd, cam.position.distanceTo(_ct));
  const frac = W.n ? W.arrived / W.n : 1, dpx = 2 * Math.tan(cam.fov * Math.PI / 360) * cam.position.distanceTo(W.gp) / cr.height;   // world units per screen pixel at the bubble
  W.rOrb = (18 + 80) * dpx * 1.1 + .15;   // the fish circle outside the finished bubble
  if (!W.burst && W.anyOut) {   // the bubble is born the moment the first fish leaves the water, and swells as the fish close in on it (and one more beat for each that melts into it)
    if (W.bubStart === undefined) { W.bubStart = T; W.rCur = 0; }
    let inflight = 0; for (const o of W.fish) if (o.vtx && o.vtx.mode === 'fly' && o.vtx.u) inflight += o.vtx.u * o.vtx.u * .7; const fr2 = W.n ? Math.min(1, (W.arrived + inflight) / W.n) : 1;
    W.rCur += (18 + 80 * fr2 - W.rCur) * (1 - Math.exp(-dt * (window.__winScale || 1) * 12));
    const bump = Math.max(0, 1 - (T - (W.pulse || -9)) / .26), rpx = W.rCur * (1 + .2 * bump * bump);
    W.rw = rpx * dpx; bubbleSet(W.bub, W.gp, W.rw, clamp((T - W.bubStart) / .18, 0, 1), .2 + .8 * bump, T); if (frac >= 1) W.full ??= T;
  } else if (!W.burst) W.rw = 12 * dpx;
  if (!W.burst && W.n && (W.full !== undefined && T - W.full > .85 || T >= WIN.burst)) {   // the bubble pops: it swells a little and thins away while drops fly out; the fish let go of the ring and swim back down
    W.burst = true; W.burstT = T; W.fish.forEach((o, i) => { if (o.vtx) o.vtx.homeAt = T + .12 + i * .05; }); Snd.play('winpop'); kick(2);
    burstFx.emit(W.gp, 0xffffff, 26, 2.4); burstFx.emit(W.gp, 0xff9ad9, 20, 3); burstFx.emit(W.gp, 0xfff3b0, 20, 3.4); burstFx.emit(W.gp, 0x9fe8ff, 20, 3); burstFx.emit(W.gp, 0xc9a8ff, 16, 2.6); for (let k2 = 0; k2 < 4; k2++) ovFx.emit(W.sx, W.sy, 22, 250 + k2 * 70, [0xff9ad9, 0xfff3b0, 0x9fe8ff, 0xc9a8ff][k2], 1.7);
    for (let k3 = 0; k3 < 14; k3++) { beadFx.emit(W.gp, k3 % 3 ? 0 : 1, .1 + Math.random() * .1, W.rw * .6); }
  }
  if (W.burst) {
    const q = clamp((T - W.burstT) / .26, 0, 1);
    { const mine = new Set(W.fish); for (const o of G.things) if (o.kind === 'fish' && o.alive && !mine.has(o) && o.group) o.winK = undefined; for (const o of W.fish) if (o.group && W.burst && !o.winFront) { o.winFront = true; o.group.traverse(m => { if (m.isMesh) { m.renderOrder = 40; for (const mt of [].concat(m.material)) mt.depthTest = false; } }); } }   // everyone else fades out of the picture, the orbiting fish are drawn in front
    for (const o of W.fish) if (o.vtx && o.vtx.mode !== 'orbit' && o.vtx.mode !== 'home' && T >= (o.vtx.homeAt || 1e9)) o.vtx.mode = 'orbit';
    if (W.bub) { if (q < 1) bubbleSet(W.bub, W.gp, (W.rw || 1) * (1 + .5 * ezo(q)), 1 - q, 1.3, T); else if (W.bub.visible) { bubbleMagic(W.bub, W.gp, 1, 0, T); W.bub.visible = false; } }
    if (!W.textOn && q >= 1) { W.textOn = true; window.__winText = { t0: performance.now() }; Snd.play('win', { at: .35 }); }   // the words come only once the bubble has gone
  }
  if (!W.cover && (!W.watchers || !W.watchers.some(o => o.hop)) && (T >= WIN.cover + 2 || (W.textOn && performance.now() - window.__winText.t0 > 2000))) { W.cover = true; startRinse(cam1); }
}
let winOut = null;
/* the aquarium curtains: two panels of cloth in their own 3D canvas. Each panel is a finely divided sheet bent into pleats by a vertex shader (pleats are deep when the cloth is gathered, shallow when it is pulled flat),
   lit from the top left, hung from a gold rod. The inner edge is pulled and the rest of the cloth follows later (the bottom lags the top), driven by springs, so the cloth overshoots a little, sways and settles. */
function makeCurtain(ti) {
  const TW = THEMES[ti != null ? ti : curLook].bg.wall, cA = new THREE.Color(TW[1]), cB = new THREE.Color(TW[3]), cV = new THREE.Color(TW[1]).multiplyScalar(.8);   // the cloth takes the colours of the hall of this look (wall gradient)
  const Wd = innerWidth, H = innerHeight, cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:300;pointer-events:all'; document.body.appendChild(cv); appClip(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(Wd, H, false);
  const sc = new THREE.Scene(), fov = 38, cm = new THREE.PerspectiveCamera(fov, Wd / H, 10, 8000); cm.position.z = H / 2 / Math.tan(fov * Math.PI / 360);
  sc.add(new THREE.AmbientLight(0xffffff, .9)); const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(-300, 500, 700); sc.add(dl);
  const mk = side => new THREE.ShaderMaterial({ uniforms: { uP: { value: 0 }, uPl: { value: 0 }, uV: { value: 0 }, uT: { value: 0 }, uS: { value: side }, uW: { value: Wd }, uH: { value: H }, uRod: { value: H / 2 - 26 }, uC0: { value: new THREE.Vector3(cA.r, cA.g, cA.b) }, uC1: { value: new THREE.Vector3(cB.r, cB.g, cB.b) } },
    vertexShader: `uniform float uP, uPl, uV, uT, uS, uW, uH, uRod; varying vec2 vUv; varying float vSlope, vFold;
      void main(){ vUv=uv; float u=uv.x, yt=1.-uv.y; float p=mix(uP,uPl,yt); float pu=clamp((p-(1.-u)*.4)/.6,0.,1.08); float e=pu<1.?pu*pu*(3.-2.*pu):1.+(pu-1.)*1.2;
        float gW=uW*.05, cW=uW*.5+8.; float xl=mix(-gW+u*gW, u*cW, e); float x=uS*(uW*.5-xl); float dxdu=max(mix(gW,cW,e),1.);
        float ph=u*56.55+uS*.6; float amp=mix(uW*.012,uW*.05,1.-e)*(.7+.3*yt); float sway=sin(uv.y*6.-uT*7.+u*3.)*uV*uH*.014*(.25+.75*yt);
        float z=amp*sin(ph)+sway+(uS>0.?0.:5.); vFold=sin(ph); vSlope=amp*cos(ph)*56.55/dxdu;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(x,uRod+(uv.y-1.)*uH*1.04,z,1.); }`,
    fragmentShader: `uniform float uS, uW, uH; uniform vec3 uC0, uC1; varying vec2 vUv; varying float vSlope, vFold;
      void main(){ vec3 n=normalize(vec3(uS*vSlope,0.,1.)); vec3 L=normalize(vec3(-.45,.6,.66)); float df=max(dot(n,L),0.);
        vec3 base=mix(uC0*.75,uC1*1.05,pow(vUv.y,1.4)); vec3 col=base*(.45+.8*df); col*=.8+.2*(vFold*.5+.5);
        col+=pow(max(dot(n,normalize(L+vec3(0.,0.,1.))),0.),22.)*.3*vec3(.85,1.,1.);
        vec2 g=fract(vec2(vUv.x*uW/38.,(1.-vUv.y)*uH/38.))-.5; col+=smoothstep(.13,.05,length(g))*.1;
        float eg=smoothstep(.962,.982,vUv.x); col=mix(col,vec3(1.,.83,.46)*(.7+.5*df),eg); col=mix(col,vec3(1.,.83,.46)*(.7+.5*df),smoothstep(.03,.012,vUv.y)); col*=mix(.62,1.,smoothstep(.0,.06,1.-vUv.y));
        gl_FragColor=vec4(col,1.); }`, side: THREE.DoubleSide });
  const mats = [mk(-1), mk(1)], geo = new THREE.PlaneGeometry(1, 1, 96, 54), panels = mats.map(m => { const q = new THREE.Mesh(geo, m); q.frustumCulled = false; sc.add(q); return q; });
  const rodY = H / 2 - 26, gold = new THREE.MeshPhongMaterial({ color: 0xe0a948, shininess: 90, specular: 0xffeebb });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, Wd * 1.04, 18).rotateZ(Math.PI / 2), gold); rod.position.set(0, rodY, 18); sc.add(rod);
  for (const sx of [-1, 1]) { const kn = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12), gold); kn.position.set(sx * (Wd * .5 + 4), rodY, 18); sc.add(kn); }
  const val = new THREE.Mesh(new THREE.BoxGeometry(Wd * 1.04, 34, 10), new THREE.MeshPhongMaterial({ color: cV, shininess: 40 })); val.position.set(0, H / 2 - 9, 14); sc.add(val);   // a box (valance) hides the top of the cloth and the rod's mount
  const trimV = new THREE.Mesh(new THREE.BoxGeometry(Wd * 1.04, 4, 11), gold); trimV.position.set(0, H / 2 - 26, 14); sc.add(trimV);
  const NR = 16, rings = []; for (const side of [-1, 1]) for (let i = 0; i < NR; i++) { const r2 = new THREE.Mesh(new THREE.TorusGeometry(9.5, 2.6, 8, 16).rotateY(Math.PI / 2), gold); r2.position.set(0, rodY, 18); sc.add(r2); rings.push({ m: r2, u: i / (NR - 1), side }); }   // rings: the cloth hangs from them and they slide along the rod with it
  const ringX = (u, p, side) => { const pu = Math.min(Math.max((p - (1 - u) * .4) / .6, 0), 1.08), e = pu < 1 ? pu * pu * (3 - 2 * pu) : 1 + (pu - 1) * 1.2, gW = Wd * .05, cW = Wd * .5 + 8, xl = (-gW + u * gW) * (1 - e) + (u * cW) * e; return side * (Wd * .5 - xl); };
  const S = { p: 0, v: 0, pl: 0, vl: 0, target: 0, dead: false, t0: performance.now(), last: performance.now() };
  const loop = now => {
    if (S.dead) return; const dt = Math.min(.033, (now - S.last) / 1000); S.last = now;
    S.v += ((S.target - S.p) * 120 - S.v * 13) * dt; S.p += S.v * dt; S.vl += ((S.target - S.pl) * 62 - S.vl * 8.5) * dt; S.pl += S.vl * dt;   // two springs: the top follows the hand, the bottom lags and swings
    for (const m of mats) { m.uniforms.uP.value = S.p; m.uniforms.uPl.value = S.pl; m.uniforms.uV.value = clamp(Math.abs(S.vl) / 3 + Math.abs(S.v - S.vl) / 4, 0, 1.4); m.uniforms.uT.value = (now - S.t0) / 1000; }
    for (const rg of rings) rg.m.position.x = ringX(rg.u, S.p, rg.side);
    r.render(sc, cm); if (S.target === 0 && S.p < .012 && Math.abs(S.v) < .08 && now - S.t0 > 400) { S.dead = true; cv.remove(); r.dispose(); geo.dispose(); mats.forEach(m => m.dispose()); return; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return { to(t) { S.target = t; }, p: () => S.p, v: () => S.v, dead: () => S.dead, kill() { S.dead = true; cv.remove(); r.dispose(); } };
}
function startRinse(end) {   // the curtains close
  const W = G.win; if (!W || W.rinse) return; W.cover = true; const cu = makeCurtain(themeIdx(G.level + 1, levelConfig(G.level + 1).theme)); cu.to(1);   /* the curtain already wears the colours of the next level's look */ Snd.play('curtainclose'); W.rinse = { t0: W.t, end, cu, closedAt: 0 };
}
function winOutUpdate() {   // after the swap the camera glides back from the rim to where the player had it, under the frost
  if (!winOut) return; const o = winOut, e = clamp((performance.now() - o.t0) / 1000, 0, 1), k = e * e * (3 - 2 * e);
  if (G && !G.win) { const az = lerp(o.end.az, o.c.az, k), el = lerp(o.end.el, o.c.el, k), dist = lerp(o.end.dist, o.c.dist, k), ty = lerp(o.end.ty, o.c.ty, k); camTween.on = false; placeCam(az, el, dist, ty); orbit.az = az; orbit.el = el; orbit.dist = dist; orbit.target.y = ty; }
  if (e >= 1) { winOut = null; orbit.az = o.c.az; orbit.el = o.c.el; orbit.dist = o.c.dist; orbit.target.y = o.c.ty; applyCam(); setTimeout(() => { window.__keepWater = false; if (glassWater.done()) glassWater.clear(); else setTimeout(() => { window.__keepWater = false; glassWater.clear(); }, 2500); }, 1500); }
}
function nextLevel(c) {   // under the water: the pop-up words go and the next level is built (the first one again after the last, or the same one in the editor's play test)
  const L = G.level; window.__winText = undefined;
  newLevel(PLAYTEST ? L : L + 1);
}
// a tap during the sequence skips straight to the water
document.addEventListener('pointerdown', () => { const W = G && G.win; if (W && W.gid === gid && !W.rinse && W.t > .4) { W.cover = true; startRinse({ az: orbit.az, el: orbit.el, dist: cam.position.distanceTo(orbit.target), ty: orbit.target.y }); } }, true);
function ovRemove(sp) { if (!sp) return; ov.scene.remove(sp.holder); ov.sprites.delete(sp); }
function ovClear() { for (const sp of ov.sprites) ov.scene.remove(sp.holder); ov.sprites.clear(); ov.flights.length = 0; ov.cel.length = 0; tankFx.reset(); paused = false; }
/* a fish (same 3D model as in the big tank) leaps along an arc to a DOM element */
function flySprite(sp, from, toEl, { delay = 0, dur = 700, size0 = 56, mode = 'target', lift, onland, proj = false, hop = 0, anticip = 0, xs = 0 } = {}) {   // proj: a projectile (squash in the slot, pop up, fall along a parabola with its nose following the path)
  if (!proj) spTop(sp, true); /* (a release starts INSIDE the Backup, behind its glass: it only comes in front once it has cleared the rim) */ ov.flights.push({ sp, x0: from.x, y0: from.y, toEl, delay, dur, size0, mode, liftPx: lift, t: 0, onland, last: 0, lx: 0, ly: 0, proj, hop, anticip, xs }); if (delay > 0) sp.holder.visible = false; else spPlace(sp, from.x, from.y, size0);
}
const plunge = a => a < 0 ? 0 : Math.sin(a * 7.2) * Math.exp(-a * 3.1);   /* a fish that has dived into water carries on down by its inertia, then the water pushes it back up and it settles: 0 at the surface, deepest after about 0.2 s, a small overshoot upwards, rest */
function slotSize(r, mode) { return mode === 'target' ? Math.min(r.width, r.height) * 1.0 : r.width * .9; }
const ease = u => .5 * (u * (2 - u)) + .5 * (u * u * (3 - 2 * u));
function ovUpdate(dt, time) {
  tankFx.update();
  if (COARSE && !ov.flights.length && !tankFx.busy()) { ov.acc = (ov.acc || 0) + dt; ov.skip = !ov.skip; if (ov.skip) return; dt = ov.acc; ov.acc = 0; }   // on phones the small fish in the target boards / backup tray are updated and drawn 30 times a second (60 while a fish is flying)
  else ov.acc = 0;
  for (let i = ov.flights.length - 1; i >= 0; i--) {
    const f = ov.flights[i], sp = f.sp; f.t += dt * 1000;
    const r = f.toEl.getBoundingClientRect(); if (r.width) { f.lx = r.left + r.width / 2; f.ly = r.top + r.height / 2; f.size1 = slotSize(r, f.mode); }
    const x1 = (f.lx || f.x0) + (!f.proj && r.width ? f.xs * r.width : 0),   /* (the half-cell shift is only for the flight INTO the Backup, where the octopus takes two cells: it also applied to the flight out of it and made the picture land 39 px beside where the 3D octopus appears) */ y1 = f.ly || f.y0, size1 = sp.built.oct && r.width ? Math.min(slotSize(r, 'backup') * .8, r.height * .9) * OCT_REL : (f.size1 || f.size0);
    if (f.t < f.delay) { sp.holder.visible = false; continue; }
    if (f.proj) {
      const tt = f.t - f.delay, ant = f.anticip, sxp = (x1 - f.x0) >= 0 ? 1 : -1, isO = sp.built.oct, yaw = isO ? 0 : sxp > 0 ? 0 : Math.PI;   /* the octopus leaves the Backup lying on its side, at the size it has there, and stands up and grows to its size in the tank on the way (one smooth change) */
      if (tt < ant) { const a = tt / ant; spPlace(sp, f.x0, f.y0 + 3 * a, f.size0, isO ? Math.PI / 2 : 0, yaw, 0); if (isO) sp.holder.scale.y *= OCT_LEN; sp.holder.scale.x *= 1 + .14 * a; sp.holder.scale.y *= 1 - .22 * a; spAnimate(sp, time, dt, 1.5); continue; }   // crouches in the slot before it jumps
      const u = Math.min(1, (tt - ant) / f.dur), Pj = uu => [f.x0 + (x1 - f.x0) * uu, f.y0 + (y1 - f.y0) * uu - f.hop * 4 * uu * (1 - uu)];   /* a real jump: it rises out of its cell, the top of the arc a third of the way along, and comes down along the same curve with its nose following the path */
      const [x, y] = Pj(u), [xn, yn] = Pj(Math.min(1, u + .04)); if (sp._ly !== undefined && dt > 0) sp.lastVy = sp.lastVy === undefined ? (y - sp._ly) / dt : sp.lastVy + ((y - sp._ly) / dt - sp.lastVy) * .6; sp.endVx = (x1 - f.x0) * 1000 / f.dur; sp.endVy = ((y1 - f.y0) + 4 * f.hop) * 1000 / f.dur;   /* the exact speed it will have at the end (px/s) */
      if (sp._lx !== undefined && dt > 0) sp.lastVx = sp.lastVx === undefined ? (x - sp._lx) / dt : sp.lastVx + ((x - sp._lx) / dt - sp.lastVx) * .6; sp._lx = x; sp._ly = y;
      const phi = clamp(Math.atan2(-(yn - y), Math.max(Math.abs(xn - x), 2)) * .62, -.8, .8), eo = 1 - (1 - u) * (1 - u);   /* the nose follows the path but only about 60% of the way: a fish in a leap leans, it does not stand on its head */
      const sz1 = isO && sp.octEnd ? sp.octEnd : size1, size = (f.size0 + (sz1 - f.size0) * eo) * (isO ? 1 : 1 + .1 * Math.sin(Math.PI * Math.min(1, u * 1.6)));
      spPlace(sp, x, y, size, isO ? Math.PI / 2 * (1 - eo) : sxp > 0 ? phi : -phi, yaw, 0); if (isO) sp.holder.scale.y *= 1 + (OCT_LEN - 1) * (1 - eo); const sv = Math.abs(Math.sin(Math.PI * u)); sp.holder.scale.x *= 1 + .12 * (1 - u) * (u < .3 ? 1 : .6); sp.holder.scale.y *= 1 - .06 * sv;   // stretches a little while it is going fast
      if (!sp.zTop && y + size * (isO ? .62 : .56) < $('backup').getBoundingClientRect().top + 2) spTop(sp, true);   /* it comes in front of the Backup's glass only when its whole body is above the rim, so nothing visibly switches layers */
      spAnimate(sp, time, dt, 3.6);
      if (time - f.last > .03) { f.last = time; ovFx.emit(x - Math.cos(phi) * sxp * size * .3, y + Math.sin(phi) * size * .3, 1, 40, 0xdff4ff, .7); }   // droplets fall off it, not bubbles: it is out of the water
      if (u >= 1) { ov.flights.splice(i, 1); spTop(sp, false); sp.age = 0; sp.yaw = yaw; f.onland && f.onland(sp); }
      continue;
    }
    const u = Math.min(1, (f.t - f.delay) / f.dur), e = ease(u), lift = f.liftPx !== undefined ? f.liftPx : -Math.min(190, Math.abs(y1 - f.y0) * .5 + 80);   // liftPx: small hop for fish leaving the Backup tray
    const P = (uu) => { const ee = ease(uu); return [f.x0 + (x1 - f.x0) * ee, f.y0 + (y1 - f.y0) * ee + lift * Math.sin(Math.PI * uu)]; };
    let [x, y] = P(u), [xn, yn] = P(Math.min(1, u + .03)); let vx = xn - x, vyUp = -(yn - y); const sx = (x1 - f.x0) >= 0 ? 1 : -1;
    let phi = Math.atan2(vyUp, Math.max(Math.abs(vx), 2)), size = (f.size0 + (size1 - f.size0) * e) * (sp.built.oct ? 1 : 1 + .4 * Math.sin(Math.PI * u));
    if (f.mode === 'backup' && r.width) {   /* INTO the Backup: one arc that goes up in front of the glass, over the rim, and comes down into its cell; the layer changes while it is still wholly above the rim (nothing can show it) and the fall carries it behind the glass */
      const rimY = $('backup').getBoundingClientRect().top, hb = size1 * (sp.built.oct ? .62 : .56) + 6, D = y1 - f.y0, hop = Math.max(40, (f.y0 + .8 * D + hb - rimY) / .64), pq = vv => [f.x0 + (x1 - f.x0) * vv, f.y0 + D * vv - hop * 4 * vv * (1 - vv)];
      [x, y] = pq(u); const [xa, ya] = pq(Math.min(1, u + .04)); vx = xa - x; vyUp = -(ya - y); phi = clamp(Math.atan2(vyUp, Math.max(Math.abs(vx), 2)) * .62, -.8, .8); size = (f.size0 + (size1 - f.size0) * u) * (sp.built.oct ? 1 : 1 + .25 * Math.sin(Math.PI * u));
      if (sp.zTop && u > .5 && y + size * (sp.built.oct ? .62 : .56) > rimY - 8) spTop(sp, false);
    }
    const jf = sp.built.kind === 'jelly';   /* a jellyfish flies upright, facing the player the whole way: no tilt, no turning round */
    spPlace(sp, x, y, size, jf ? 0 : (sx > 0 ? phi : -phi) + (sp.built.oct ? Math.PI / 2 : 0), jf ? 0 : sx > 0 ? 0 : Math.PI, jf ? 0 : Math.sin(u * 11) * .22); if (sp.built.oct) sp.holder.scale.y *= 1 + (OCT_LEN - 1) * e;   /* the octopus flies lying on its side from the start */
    spAnimate(sp, time, dt, 3.2);
    if (time - f.last > .034) { f.last = time; trailBubble(x, y); }
    if (u >= 1) { ov.flights.splice(i, 1); spTop(sp, false); sp.age = 0; sp.yaw = jf || sx > 0 ? 0 : Math.PI; if (f.mode === 'backup') ovFx.emit(x1, y1 - size1 * .3, 9, 70, 0xdff4ff, .8); f.onland && f.onland(sp); }
  }
  celUpdate(dt); winOutUpdate(); beadFx.update(dt);
  if (G) {
    G.targets.forEach((t, i) => {
      if (!t || !t.res) return; const b = boxEls[i], done = b.root.classList.contains('done'), op = b.root.classList.contains('empty') ? 0 : parseFloat(getComputedStyle(b.root).opacity);
      t.res.forEach((sp, k) => { if (!sp) return; const r = b.slotEls[k].getBoundingClientRect(); sp.age += dt; const kk = Math.min(1, sp.age / .5);
        const sw = Math.sin(time * .7 + sp.ph); let cx = r.left + r.width / 2 + sw * r.width * .12, cy = r.top + r.height / 2 + Math.sin(time * 1.4 + sp.ph) * 3 + plunge(sp.age) * r.height * .34;
        sp.yaw += ((Math.cos(time * .7 + sp.ph) >= 0 ? 0 : Math.PI) - sp.yaw) * Math.min(1, dt * 5);
        let rz = Math.sin(time * 1.4 + sp.ph) * .08; if (done) { cy -= Math.abs(Math.sin(time * 13 + k)) * 12; rz = Math.sin(time * 13 + k) * .4; }
        let sz = slotSize(r, 'target') * .95 * (1 + .25 * Math.sin(kk * Math.PI)) * op; const TK = tankFx.clearing(i);
        if (TK && TK.clear) {   // the finished tank drains: each fish crouches, then is drawn into the middle along a spiral that tightens, one after another, shrinking as it goes
          const el = performance.now() / 1000 - TK.clear.t0, p = clamp((el - .06 - k * .09) / .5, 0, 1), e = p * p * (3 - 2 * p), ox = cx - TK.cx, oy = cy - TK.cy, r0 = Math.hypot(ox, oy), a0 = Math.atan2(oy, ox), dir = k % 2 ? -1 : 1;
          const at = q => { const ee = q * q * (3 - 2 * q), rr = r0 * Math.pow(1 - ee, 1.1) * (1 + .05 * Math.sin(Math.min(1, q * 2.4) * Math.PI)), an = a0 + dir * ee * Math.PI * 1.6; return [TK.cx + Math.cos(an) * rr, TK.cy + Math.sin(an) * rr * .55]; };   // a tight spiral that never leaves the tank };
          const [fx, fy] = at(p), [gx, gy] = at(Math.min(1, p + .03)), vx = gx - fx, vy = gy - fy, yw = vx >= 0 ? 0 : Math.PI, ph = Math.atan2(-vy, Math.max(Math.abs(vx), 1.5));
          const sq = 1 - .95 * Math.pow(e, 1.4), crouch = p < .14 ? 1 + .14 * Math.sin(p / .14 * Math.PI) : 1;
          if (sq < .04) { sp.holder.visible = false; return; }
          spPlace(sp, fx, fy, sz * sq * crouch, yw === 0 ? ph : -ph, yw); spAnimate(sp, time, dt, 4.5);
          if (p > 0 && p < 1 && Math.random() < .5) ovFx.emit(fx, fy, 1, 25, 0xdff4ff, .7);
          return;
        }
        if (TK) { const ca = Math.cos(-TK.spin), sa = Math.sin(-TK.spin), ddx = cx - TK.cx, ddy = cy - TK.cy; cx = TK.cx + (ddx * ca - ddy * sa) * TK.sc; cy = TK.cy + (ddx * sa + ddy * ca) * TK.sc; sz *= TK.sc; rz -= TK.spin; }   // while the tank whirls away its fish whirl with it
        spPlace(sp, cx, cy, sz, rz, sp.yaw); spAnimate(sp, time, dt, TK ? 4 : done ? 2.5 : 1); });
    });
    const slots = $('backup').querySelectorAll('.slot');
    G.backup.forEach((it, idx) => { const sp = it.res; if (!sp || !slots[idx]) return; const r = slots[idx].getBoundingClientRect(); sp.age += dt; const kk = Math.min(1, sp.age / .5);
      let bx = r.left + r.width / 2, by = r.top + r.height / 2 + Math.sin(time * 1.6 + sp.ph) * 1.5 + plunge(sp.age) * r.height * .18, bs = Math.min(slotSize(r, 'backup') * .8, r.height * .9) * (1 + .12 * Math.sin(kk * Math.PI)), rz = 0, yw = Math.sin(time * .8 + sp.ph) * .5, sqStretch = 1, sqLong = 'y';
      spTop(sp, false);   /* the squid lies behind the bars, like every fish of the Backup */
      if (!sp._bkRO) { sp._bkRO = true; sp.holder.traverse(m => { if (m.isMesh || m.isSprite) { m.renderOrder = BK_RO; m._ro = BK_RO; } }); }   /* in the Backup every animal is drawn AFTER the water of the cell and BEFORE the bars: while the camera moves it turns transparent and is then drawn in the transparent pass, where the order is by renderOrder (the Backup's pieces are at -19 .. -16): at 0 it was drawn over the bars and the surface */
      if (it.id === 'squid' && !it.filler && it.landed) {   /* the squid is big: it lies on its side across the three cells it takes (the ink fills the outer two), shrunk to fit the height of the strip */
        const L0 = idx > 0 && G.backup[idx - 1].filler ? idx - 1 : idx, R0 = idx + 1 < G.backup.length && G.backup[idx + 1].filler ? idx + 1 : idx;
        if (L0 !== R0 || true) { const rl = slots[L0].getBoundingClientRect(), rR = slots[R0].getBoundingClientRect(), spanW = rR.right - rl.left, spanX = (rl.left + rR.right) / 2, e = Math.min(1, sp.age / .7), ee = e * e * (3 - 2 * e);
          sp.inBk = true; bx = spanX; bs = Math.min(slotSize(r, 'backup') * .8, r.height * .9) * OCT_REL; sqStretch = OCT_LEN; sqLong = 'y';   /* (no easing: it flew in at exactly this size and place, so it must not grow or slide after landing) */  rz = Math.PI / 2 + Math.sin(time * 1.1 + sp.ph) * .03; yw = Math.sin(time * .6 + sp.ph) * .15; by += Math.sin(time * 1.25 + sp.ph) * r.height * .07; if (!sp._ow || (sp.age < 8 && (sp._oc = (sp._oc || 0) + 1) % 20 === 0)) { const bb = new THREE.Box3().setFromObject(sp.holder); sp._ow = Math.max(sp._ow || 0, bb.max.x - bb.min.x); } bx += Math.sin(time * .85 + sp.ph * 1.7) * clamp((spanW - sp._ow) / 2 + 1, 2, 9); }   /* it sways left and right by exactly the room it has: its widest point (arms included) just reaches the glass of the two outer cells */   /* it drifts gently up and down inside the strip */   /* the octopus lies on its side (it flew in that way), its arms drawn together behind it, as long as the three cells it takes (the ink fills the outer two) */
      }
      const fp = tankFx.fishPos(idx, bx, by, bs);
      if (fp) { spPlace(sp, fp[0], fp[1], fp[2], fp[3] + (sp.built.oct ? Math.PI / 2 : 0), Math.sin(time * 3 + sp.ph) * .6); if (sp.built.oct) sp.holder.scale.y *= OCT_LEN; spAnimate(sp, time, dt, 3); }   /* (the lose animation: the octopus keeps its long, slim, lying shape) */ else { spPlace(sp, bx, by, bs, sp.built.kind === 'jelly' ? 0 : rz, sp.built.kind === 'jelly' ? 0 : yw); if (sqStretch > 1.001) sp.holder.scale[sqLong] *= sqStretch; spAnimate(sp, time, dt, .6); } spFade(sp, (window.__bkA ?? 1) ** 2.2);   /* the animals fade a little faster than the cage: while the camera moves they must not stay solid in front of bars that are already thin */ });
  }
  if (!PROF.off.ov) ov.renderer.render(ov.scene, ov.cam);
}

/* ============================== fly / fx ============================== */
function trailBubble(x, y) {
  const b = document.createElement('div'), sz = 4 + Math.random() * 6; b.className = 'trail'; b.style.cssText = `left:${x + (Math.random() - .5) * 10}px;top:${y + (Math.random() - .5) * 10}px;width:${sz}px;height:${sz}px`;
  document.body.appendChild(b); b.animate([{ transform: 'translateY(0) scale(1)', opacity: .95 }, { transform: `translateY(${-10 - Math.random() * 16}px) scale(.3)`, opacity: 0 }], { duration: 450 + Math.random() * 250, easing: 'ease-out' }).onfinish = () => b.remove();
}
function dropDom(x, y, vx, vy, big) {
  const d = document.createElement('div'); d.className = 'drop'; const sz = (big ? 4 : 2.6) + Math.random() * 2.4;   /* small drops, the colour of the tank water */ d.style.cssText = `left:${x}px;top:${y}px;width:${sz}px;height:${sz}px`; document.body.appendChild(d);
  const up = vy, fall = 40 + Math.random() * 40;
  d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1, easing: 'cubic-bezier(.2,.7,.4,1)' }, { transform: `translate(${vx * .55}px,${-up}px) scale(1.1)`, opacity: 1, offset: .45, easing: 'cubic-bezier(.5,0,.9,.6)' }, { transform: `translate(${vx}px,${fall}px) scale(.4)`, opacity: 0 }], { duration: 700 + Math.random() * 300 }).onfinish = () => d.remove();
}
/* water splash + ripples inside a small target tank when a fish dives in */
function miniSplash(box, slotEl) {
  const aq = box.aq.getBoundingClientRect(), sr = slotEl.getBoundingClientRect(), cx = sr.left + sr.width / 2, top = aq.top + 7;
  for (let k = 0; k < 7; k++) dropDom(cx + (Math.random() - .5) * 20, top, (Math.random() - .5) * 90, 22 + Math.random() * 38);
  for (let j = 0; j < 2; j++) { const r = document.createElement('div'); r.className = 'rg'; r.style.left = (cx - aq.left) + 'px'; r.style.animationDelay = j * .14 + 's'; box.aq.appendChild(r); setTimeout(() => r.remove(), 1000); }
  for (let k = 0; k < 7; k++) { const b = document.createElement('div'); b.className = 'bub2'; const sz = 3 + Math.random() * 5; b.style.cssText = `left:${cx - aq.left + (Math.random() - .5) * 26}px;top:${sr.top - aq.top + 20 + Math.random() * 14}px;width:${sz}px;height:${sz}px;animation-delay:${Math.random() * .25}s`; box.aq.appendChild(b); setTimeout(() => b.remove(), 1300); }
  box.aq.classList.remove('splash'); void box.aq.offsetWidth; box.aq.classList.add('splash'); setTimeout(() => box.aq.classList.remove('splash'), 800);
  box.root.classList.remove('hit'); void box.root.offsetWidth; box.root.classList.add('hit'); setTimeout(() => box.root.classList.remove('hit'), 500);
  
}
/* the finished target tank bursts into water, bubbles and shock rings */
function waterBurst(box) {
  const r = box.aq.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let k = 0; k < 30; k++) dropDom(r.left + r.width * (.08 + Math.random() * .84), r.top + 6, (Math.random() - .5) * 150, 60 + Math.random() * 110, true);
  for (let k = 0; k < 16; k++) setTimeout(() => trailBubble(r.left + r.width * Math.random(), r.top + r.height * (.3 + Math.random() * .6)), k * 22);
  for (let j = 0; j < 2; j++) { const ring = document.createElement('div'); ring.className = 'shr'; ring.style.cssText = `left:${cx - r.width * .4}px;top:${cy - r.width * .4}px;width:${r.width * .8}px;height:${r.width * .8}px;animation-delay:${j * .13}s`; document.body.appendChild(ring); setTimeout(() => ring.remove(), 900); }
}
function sparkAt(el, n, big) {
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < n; i++) { const s = document.createElement('div'); s.className = 'spark'; s.style.left = cx - 5 + 'px'; s.style.top = cy - 5 + 'px';
    if (big) s.style.background = s.style.boxShadow = '#' + pick(['ffe27a', '7dffc0', '7de3ff', 'ff9ad9']); document.body.appendChild(s);
    const a = rand(0, 6.28), d = rand(30, big ? 110 : 60);
    s.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(0)`, opacity: 0 }], { duration: rand(450, 800), easing: 'ease-out' }).onfinish = () => s.remove(); }
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); }

/* ============================== tapping ============================== */
function projectToClient(p) {
  const v = p.clone().project(cam), r = canvas.getBoundingClientRect(); return lensContentToClient(r.left + (v.x * .5 + .5) * r.width, r.top + (-v.y * .5 + .5) * r.height);
}
function onTap(cx, cy) {
  if (!G || G.status !== 'play' || paused) return;
  const o = pickAt(cx, cy, 400);
  if (o) { if (!o.tubeP) pickThing(o); return; }
  missTap(cx, cy);
}
const CENTER = new THREE.Vector3(0, 2.7, 0), away = new THREE.Vector3(), pTmp = new THREE.Vector3();
function missTap(cx, cy) {
  raycaster.ray.closestPointToPoint(CENTER, pTmp);
  if (PLAN ? Math.hypot(pTmp.x - CENTER.x, pTmp.z - CENTER.z) > wallR(Math.atan2(pTmp.z - CENTER.z, pTmp.x - CENTER.x)) + .4 : pTmp.distanceTo(CENTER) > R + .4) { Snd.play('miss'); return; }   // tapped outside the tank
  Snd.play('miss'); scatter(pTmp.clone(), 1);
}
/* the school darts away from point P */
function scatter(P, strength = 1, quiet = false) {
  for (const o of G.things) {
    if (!o.alive || o.kind !== 'fish' || o.big) continue;
    away.subVectors(o.pos, P); const d = away.length(); if (d > 4.6) continue;
    if (d < 1e-3) away.set(rand(-1, 1), rand(-.3, .3), rand(-1, 1)); away.normalize(); away.y *= .5; away.normalize();
    if (o.evOn) { o.evOn = false; o.evFleeT = 2; }   // a tap breaks a fish out of any event
    const k = Math.max(0, 1 - d / 4.6) * strength; o.boost = Math.max(o.boost, (1.5 + 1.2 * k + rand(0, .5)) * G.cfg.boostK * .7 * (o.fastB ? .5 : 1)); o.dir.lerp(away, .92).normalize();
    const tgt = o.pos.clone().addScaledVector(away, rand(3.4, 5.4)); clampXZ(tgt, RF);
    tgt.y = clamp(tgt.y, FLOOR_Y + .6, WATER_Y - .55); o.wp = tgt; o.wpT = rand(3.2, 5);
  }
  shock(P, strength); burstFx.emit(P, 0x9fe8ff, 22, 1.5); burstFx.emit(P, 0xffffff, 8, .8);
  addRipple(P.x, P.z, .08); kick(1.2); if (!quiet) Snd.play('scatter');
}
/* a tap sends a pressure wave through the water: a see-through shell that is bright only at its rim (so it reads as a sphere, not a sticker), plus two thin horizontal rings; fish in front hide it */
const bangs = [], bangGeo = new THREE.SphereGeometry(1, 28, 18), ringGeo = new THREE.TorusGeometry(1, .012, 6, 96);
const bangMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uK: { value: 0 } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); vP=position; gl_Position=projectionMatrix*mv; }',
  fragmentShader: 'uniform float uK; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.4); float band=.65+.35*sin(vP.y*7.-uK*10.)*sin(vP.x*6.+uK*7.); float a=f*band*pow(1.-uK,2.2)*.32; gl_FragColor=vec4(mix(vec3(.45,.85,1.),vec3(1.),f*f),a); }' });
function shock(P, s = 1) {
  const g = new THREE.Group(); g.position.copy(P); g.renderOrder = 12;
  const sh = new THREE.Mesh(bangGeo, bangMat()); sh.renderOrder = 12; g.add(sh);
  const rings = [0, 1].map(i => { const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xcdf4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false })); r.rotation.set(Math.PI / 2 + rand(-.25, .25), 0, rand(0, 6.28)); r.renderOrder = 12; g.add(r); return r; });
  scene.add(g); bangs.push({ g, sh, rings, t: 0, s });
}
const shocks = [];
function updateShocks(dt) {
  for (let i = bangs.length - 1; i >= 0; i--) { const b = bangs[i]; b.t += dt; const k = b.t / .55;
    if (k >= 1) { scene.remove(b.g); b.sh.material.dispose(); b.rings.forEach(r => r.material.dispose()); bangs.splice(i, 1); continue; }
    const e = 1 - Math.pow(1 - k, 3); b.sh.scale.setScalar((.2 + 1.35 * e) * b.s); b.sh.material.uniforms.uK.value = k;
    b.rings.forEach((r, j) => { const kk = clamp((b.t - j * .06) / .5, 0, 1), ee = 1 - Math.pow(1 - kk, 3); r.scale.setScalar((.25 + (j ? 1.3 : 1.9) * ee) * b.s); r.material.opacity = .45 * Math.pow(1 - kk, 2) * (kk > 0 ? 1 : 0); }); }
  for (let i = shocks.length - 1; i >= 0; i--) { const m = shocks[i], u = m.userData; u.t += dt; const k = u.t / .8; if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); shocks.splice(i, 1); continue; }
    m.scale.setScalar(Math.min(u.maxS ?? 99, 1 + 11 * (1 - Math.pow(1 - k, 3)) * u.s));   /* a ring never grows past the glass, whatever the shape of the tank */ m.material.opacity = .9 * Math.pow(1 - k, 1.5); }
}
function nudgeBig(o) {
  if (!o.alive || G.status !== 'play') return;
  o.wiggle = 1; o.boost = Math.max(o.boost, .9); const P = o.pos.clone(); burstFx.emit(P, 0x9fe8ff, 18, 1.4); burstFx.emit(P, 0xffffff, 8, .9);
  scatter(P, 1.35, true); Snd.play('ui'); kick(.8); vib(14);
}
function octBoxAt(M) {   /* the screen box of a new octopus at world point M: { top, bottom, size } */
  const g = buildSquid(); g.group.scale.setScalar(G.cfg.sizeK * OCT_TANK_K); g.group.position.copy(M); g.group.rotation.y = Math.atan2(cam.position.x - M.x, cam.position.z - M.z); g.group.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(g.root), pts = []; for (let i = 0; i < 8; i++) pts.push(projectToClient(new THREE.Vector3(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z)));
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y); return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, top: Math.min(...ys), bottom: Math.max(...ys), size: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) };
}
function octSizeAt(M) {   /* the screen size (longest side of the box, px) a new octopus has at world point M */
  const g = buildSquid(); g.group.scale.setScalar(G.cfg.sizeK * OCT_TANK_K); g.group.position.copy(M); g.group.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(g.root), pts = []; for (let i = 0; i < 8; i++) pts.push(projectToClient(new THREE.Vector3(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z)));
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y); return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}
function octScreenSize(o) {   /* how big the octopus really looks on screen right now (the longest side of its box, in px), so the flying picture starts at exactly that size */
  o.group.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(o.parts.root || o.group), c = [], pts = [];
  for (let i = 0; i < 8; i++) pts.push(projectToClient(new THREE.Vector3(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z)));
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y); void c; return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}
function pickThing(o, booster = false) {   // booster: the Clear Tank booster catches the fish for the player (no combo, no tap sound)
  if (guide.on && !booster && o.kind === 'fish' && --guide.left <= 0) { guide.on = false; save.g1 = 1; persist(); }   // the "Tap a fish" guide ends after the first two taps on a fish
  if (o.kind === 'clam') { tapClam(o); return; } if (o.locked) return;
  if (o.big) { nudgeBig(o); return; }
  if (!G.cfg.backup && !(o.kind === 'fish' && G.targets.some(t => t && t.type === o.type && t.count < perOf(t.type) && !t.done))) {   // level 1 has no Backup: a wrong tap only sends the fish darting off
    G.combo = 0; const P = o.pos.clone(); scatter(P, 1.1, false); o.boost = Math.max(o.boost, 2.2); o.wiggle = 1; return;
  }   // whale / shark are far too big to catch: a tap only makes them squirm and shoo the little fish away
  if (!o.alive || G.status !== 'play' || G.backup.length >= BACKUP_MAX) return; o.alive = false; o.scale = Math.min(o.scale, 1);
  const wp = new THREE.Vector3(); o.group.getWorldPosition(wp);
  // the fish really leaps out of the water inside the 3D tank (so the glass/rim occlude it correctly); the flat sprite takes over only once it is clear of the rim
  const exit = new THREE.Vector3(wp.x, TANK_H + .4, wp.z);
  o.launch = { t: 0, dur: LEAP, x: wp.x, z: wp.z, y0: wp.y, y1: exit.y, splashed: false, yaw: Math.atan2(-o.dir.z, o.dir.x) };
  const from = projectToClient(exit); const FD = LEAP * 1000;
  const wp2 = exit.clone().addScaledVector(camRight, .45), pp = projectToClient(wp2); const ppu = Math.hypot(pp.x - from.x, pp.y - from.y) / .45, fsz = o.id === 'squid' ? octScreenSize(o) : clamp(Math.hypot(pp.x - from.x, pp.y - from.y) * 1.12, 34, 90);   /* (the octopus is as big as it looks in the tank) */
  burstFx.emit(wp, o.kind === 'fish' ? 0x7de3ff : 0xff6ab0, 20, 1.6); burstFx.emit(wp, 0xffffff, 8, 1); kick(1);
  scatter(wp.clone(), o.kind === 'obstacle' ? 1.2 : .9, true);
  let ti = -1;
  if (o.kind === 'fish') ti = G.targets.findIndex(t => t && t.type === o.type && t.count < perOf(t.type) && !t.done);
  if (ti >= 0) { let cn = 0; if (!booster) { Snd.play('ftap'); G.lastTapP = wp.clone(); cn = comboHit(from); } giveToTarget(ti, from, FD, fsz, null, cn); return; }
  G.combo = 0; G.mistakes++;   /* the wrong-tap sound plays when the item lands in the Backup */
  
  // wrong -> backup
  const item = { id: o.id, type: o.type, junk: o.kind === 'obstacle', landed: false, res: null }; let slotIdx;
  if (o.id === 'squid') {   // the squid is big: it takes 3 backup slots (ink - squid - ink), fewer if the strip is nearly full
    const free = BACKUP_MAX - G.backup.length, seq = free >= 3 ? ['f', 's', 'f'] : free === 2 ? ['s', 'f'] : ['s'];
    for (const k of seq) { if (k === 'f') G.backup.push({ id: 'ink', junk: true, filler: true, landed: true, res: null }); else { G.backup.push(item); slotIdx = G.backup.length - 1; } }
  } else { G.backup.push(item); slotIdx = G.backup.length - 1; }
  renderBackup();
  const slotEl = $('backup').querySelectorAll('.slot')[slotIdx]; const gi = gid;
  vib(item.junk ? [40, 30, 40] : 25);
  const sp = makeSprite(o.kind === 'fish' ? 'fish' : 'obs', o.id, o.type, o.hue);
  flySprite(sp, from, slotEl, { xs: (G.backup[slotIdx + 1] && G.backup[slotIdx + 1].filler ? .5 : 0) - (G.backup[slotIdx - 1] && G.backup[slotIdx - 1].filler ? .5 : 0), size0: fsz, dur: 760, delay: FD, mode: 'backup', onland: () => {
    if (gi !== gid) return; Snd.play('tobackup'); item.res = sp; item.landed = true; renderBackup(); G.targets.forEach((t, ti) => { if (t) pullFromBackup(ti); });   // a target may already be waiting for this fish
    const b = $('backup'); b.classList.remove('danger'); void b.offsetWidth; b.classList.add('danger');
    if (G.backup.length >= BACKUP_MAX && G.status === 'play' && G.backup.every(it => it.landed)) {   // (when the last fish has landed: fast taps can fill the strip while earlier fish are still flying)
      if (!G.playOnUsed) { G.status = 'playon'; setTimeout(() => { if (gi === gid && G.status === 'playon') { paused = true; setPoFish(); showOnly('ovPlayOn'); } }, 500); }   // once per level: offer Play On before the tank breaks
      else loseNow();
    }
  } });
}

/* ============================== overlays ============================== */
const OVS = ['ovPause', 'ovWin', 'ovLose', 'ovLevels', 'ovIntro', 'ovPlayOn'];
function devWin() {   // developer tool (Settings): finish the level now
  if (!G || G.status !== 'play') return; closePause(); const i = G.targets.findIndex(t => t && !t.done); if (i < 0) return; G.completed = G.cfg.goal - 1; const t = G.targets[i]; t.count = t.shown = perOf(t.type); t.done = true; completeTarget(i);
}
function devLose() {   // developer tool (Settings): lose the level the way a full Backup does: the Play On offer first (once per level), then the lose screen
  if (!G || G.status !== 'play') return; closePause(); if (!G.playOnUsed) { G.status = 'playon'; const gi = gid; setTimeout(() => { if (gi === gid && G.status === 'playon') { paused = true; setPoFish(); showOnly('ovPlayOn'); } }, 300); } else loseNow();
}
function loseNow() { G.status = 'lost'; tankFx.breakBackup(); setTimeout(showLose, 3700); }
let popupOn = false;   // a pop-up is open: the music ducks, the open / close sounds play
function hideOverlays() { document.querySelectorAll('.spotlit').forEach(e => e.classList.remove('spotlit')); const was = OVS.some(id => $(id).classList.contains('show')) || $('spotOv').classList.contains('show'); for (const id of OVS) $(id).classList.remove('show'); $('spotOv').classList.remove('show'); if (was && popupOn) { popupOn = false; Snd.bgmDuckTo(1); if (!introOn || true) Snd.play('popclose'); } }
function showOnly(id) { hideOverlays(); $(id).classList.add('show'); if (id !== 'ovWin' && id !== 'ovLose') { popupOn = true; Snd.bgmDuckTo(.5); Snd.play(id === 'ovPlayOn' ? 'playon' : 'popopen'); } }
function saveWin() {   // stars and the next level are saved when the level is won (the win pop-up with the stars is gone: the win sequence flows straight into the next level)
  const m = G.mistakes, st = m <= 3 ? 3 : m <= 6 ? 2 : 1;
  save.stars[G.level] = Math.max(save.stars[G.level] || 0, st); save.unlocked = Math.max(save.unlocked, G.level + 1); persist();
}
function setPoFish() { const ids = SPECIES.map((s, i) => i).filter(i => THUMB[SPECIES[i].id] && SPECIES[i].model3d && !SPECIES[i].hue); const k = ids.length ? ids[(Math.random() * ids.length) | 0] : -1; for (const id of ['poFish', 'loFish']) { const im = $(id); if (im) im.src = k >= 0 ? THUMB[SPECIES[k].id] : ''; } }
function showLose() { setPoFish(); showOnly('ovLose'); Snd.bgmStop(); Snd.play('lose'); }
let paused = false;
let introOn = false;
function introIcon(kind) {   // small drawn icons (no emoji)
  const c = document.createElement('canvas'); c.width = 256; c.height = 200; const g = c.getContext('2d'); g.lineJoin = g.lineCap = 'round';
  if (kind === 'backup') {
    for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(30 + i * 32, 120, 13, 0, 6.283); g.fillStyle = i >= 4 ? '#ff5a5a' : 'rgba(255,255,255,.45)'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); }
    g.beginPath(); g.arc(128, 48, 30, 0, 6.283); g.fillStyle = '#ff5a5a'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke(); g.lineWidth = 7; g.beginPath(); g.moveTo(116, 36); g.lineTo(140, 60); g.moveTo(140, 36); g.lineTo(116, 60); g.stroke();
  } else if (kind === 'hint') {
    const gr = g.createRadialGradient(112, 70, 6, 128, 84, 54); gr.addColorStop(0, '#fff7c2'); gr.addColorStop(1, '#ffc531'); g.beginPath(); g.arc(128, 84, 50, 0, 6.283); g.fillStyle = gr; g.fill(); g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#d9e8f7'; g.fillRect(104, 138, 48, 14); g.fillRect(110, 156, 36, 12); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(104, 138, 48, 14); g.strokeRect(110, 156, 36, 12);
  } else {
    g.beginPath(); g.moveTo(128, 30); g.lineTo(186, 100); g.lineTo(150, 100); g.lineTo(150, 168); g.lineTo(106, 168); g.lineTo(106, 100); g.lineTo(70, 100); g.closePath(); g.fillStyle = '#5ec8ff'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
  }
  return c.toDataURL('image/png');
}
/* ---------- live pictures for the "New feature" pop-up: each obstacle moves the way it does in the game (the same builders and motion rules); src/ui/bf.ts draws FV.cv ---------- */
const FV = { r: null, cam: null, cv: null, g: null, kind: '', cur: '', t: 0, on: false, cache: {} };
function fvInit() {
  if (FV.r) return;
  FV.cv = document.createElement('canvas'); FV.cv.width = FV.cv.height = 640; FV.g = FV.cv.getContext('2d');
  FV.r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); FV.r.setPixelRatio(1); FV.r.setSize(640, 640, false); FV.r.setClearColor(0x000000, 0);
  FV.cam = new THREE.PerspectiveCamera(28, 1, .05, 60);
}
function fvScene() { const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xdff4ff, 0x335577, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(2, 3, 4); sc.add(dl); return sc; }
let _fvSoft = null; function fvSoft() { if (!_fvSoft) { const c = document.createElement('canvas'); c.width = c.height = 128; const q = c.getContext('2d'), gr = q.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.55, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = gr; q.fillRect(0, 0, 128, 128); _fvSoft = new THREE.CanvasTexture(c); _fvSoft.colorSpace = THREE.SRGBColorSpace; } return _fvSoft; }
function fvFish(i, dark) { const sp = SPECIES[i], b = buildFish(sp); if (dark) b.group.traverse(m => { if (m.isMesh && m.material && m.material.color) { m.material.color.setScalar(.3); if ('emissiveIntensity' in m.material) m.material.emissiveIntensity = .1; } }); return b; }
function fvModelFish(n) { const ids = SPECIES.map((s, i) => i).filter(i => SPECIES[i].model3d && !SPECIES[i].hue); const out = []; for (let k = 0; k < n; k++) out.push(ids[(k * 3 + 1) % ids.length]); return out; }
function fvSquid() {   // floats (the arms pull together on each push), then sprays an ink cloud: its arms fly open, the cloud grows out of it and thins away
  const sc = fvScene(), b = buildSquid(), grp = new THREE.Group(); b.group.scale.setScalar(1.5); grp.add(b.group); sc.add(grp);
  const ink = new THREE.Group(); sc.add(ink); const puffs = [];
  for (let i = 0; i < 18; i++) { const m = new THREE.SpriteMaterial({ map: fvSoft(), color: [0x2a1055, 0x1c0c40, 0x3a1a6a][i % 3], transparent: true, depthWrite: false, opacity: 0 }), sp = new THREE.Sprite(m); sp.userData = { to: new THREE.Vector3(rand(-1.2, 1.2), rand(-1, 1), rand(-1.3, -.3)), sc: rand(1.1, 1.7), d: rand(0, .25), ph: rand(0, 6.28) }; ink.add(sp); puffs.push(sp); }
  const CYC = 6;
  return { sc, cam: [0, .2, 6.4, 0, .1, 0], step(t, dt = .016) {
    const c = t % CYC, push = Math.pow(Math.max(0, Math.sin(t * 2.3)), 2), spr = c > 2.4 && c < 3.8 ? Math.sin((c - 2.4) / 1.4 * Math.PI) : 0, jet = c > 2.2 && c < 4.2 ? push * .3 : push;
    const cy = octoCycle((t / 1.5) % 1), wind = c > 2 && c < 2.4 ? smooth01((c - 2) / .4) : 0, ct = c > 2 && c < 3.9 ? Math.max(wind, 0) : cy.contract, th = c > 2 && c < 3.9 ? 0 : cy.thrust;
    octoAnim(b, dt, { wt: t * 2.2, contract: ct, thrust: th, glide: c > 2 && c < 3.9 ? 0 : cy.glide, ink: spr, wind, hp: -.3 * ct + .35 * th }); octoBlink(b, dt);
    b.inner.scale.set(1 - (th * .1 + ct * .04 + spr * .05) * .8, 1 + th * .14 + ct * .05 + spr * .07, 1 - (th * .1 + ct * .04 + spr * .05) * .8); b.inner.rotation.z = Math.sin(t * 1.1) * .06; b.inner.rotation.x = Math.sin(t * .8) * .05;
    grp.position.y = Math.sin(t * 1.3) * .1 + push * .12 + (c > 2.5 ? Math.sin(Math.min(1, (c - 2.5) / 1.4) * Math.PI) * .22 : 0); grp.rotation.y = .5 + Math.sin(t * .6) * .35;
    ink.position.copy(grp.position); ink.position.y -= .5; const k = c - 2.85;   /* the cloud starts under the octopus, where its arms begin */
    for (const p of puffs) { const u = clamp((k - p.userData.d) / .7, 0, 1), out = clamp((4.7 - c) / 1.5, 0, 1), e = 1 - Math.pow(1 - clamp(k / 1.5, 0, 1), 3);
      p.position.copy(p.userData.to).multiplyScalar(.15 + .85 * e); p.material.opacity = c > 2.85 && c < 4.7 ? .92 * Math.min(u, out) : 0; const sz = p.userData.sc * (.35 + .65 * (1 - Math.pow(1 - u, 3))) * (1 + .05 * Math.sin(t * 1.6 + p.userData.ph)); p.scale.set(sz, sz, 1); }
  } };
}
function fvClam() {   // opens, opens wide, snaps shut with a shake and hops, then opens again (the game's clam: open .5, alert .95, closed .02)
  const sc = fvScene(), b = buildClam(), grp = new THREE.Group(); b.group.scale.setScalar(1.5); grp.position.y = -.32; grp.add(b.group); sc.add(grp); b.lock.visible = false; b.held.visible = false; b.pips.visible = false;
  const CYC = 5.8; let open = .5;
  return { sc, cam: [0, 1.15, 4.9, 0, .3, 0], step(t, dt) {
    const c = t % CYC, closed = c >= 2.7 && c < 4.3, alert = c > 1.4 && c < 2.7, target = closed ? .02 : alert ? .95 : .5 + .05 * Math.sin(t * 3);
    open += (target - open) * (1 - Math.exp(-dt * (closed ? 26 : 9))); b.lid.rotation.x = -open;
    const shake = closed ? Math.max(.55, 1 - (c - 2.7) * 1.4) : 0; b.group.rotation.z = (Math.sin(t * 15) * .46 + Math.sin(t * 6.1) * .16) * shake; b.group.rotation.x = 0; b.group.position.x = Math.sin(t * 15 + 1.2) * .16 * shake;
    grp.position.y = -.32; b.group.scale.setScalar(1.5); b.pearl.visible = !closed;
    b.glow.material.opacity = closed ? .45 + .2 * Math.sin(t * 4) : alert ? .75 : .3 + .15 * Math.sin(t * 3); b.glow.scale.setScalar(alert ? 1.7 : 1.2);
  } };
}
function fvPipe() {   // the orange pipe of the game: the lid shuts and glows while fish wait, chatters, flips open, fish pop out one by one in arcs, the lid snaps shut with a bounce
  const sc = fvScene(), g = new THREE.Group(); sc.add(g);
  const M = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: 0xff7a3a, metalness: .2, roughness: .35, emissive: 0xc04a10, emissiveIntensity: .75 }), M2 = new THREE.MeshStandardMaterial({ color: 0xfff0a0, metalness: .5, roughness: .3, emissive: 0x6a4a00, emissiveIntensity: .6 }), LM = new THREE.MeshStandardMaterial({ color: 0xffb03a, metalness: .45, roughness: .3, emissive: 0x8a4a00, emissiveIntensity: .5 });
  const TXp = 4.6, ox = 3.7, oy = .8, V = (x, y) => new THREE.Vector3(x - ox, y - oy, 0);
  const pts = [[TXp, -.1], [TXp, 1.0], [TXp, 1.3], [TXp - .1, 1.68], [TXp - .35, 1.8], [3.2, 1.8], [3.12, 1.8], [2.95, 1.8]].map(([x, y]) => V(x, y));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 64, .26, 16), M));
  const tor = (r, tk, x, y, rx, ry) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, tk, 8, 24), M2); m.rotation.set(rx, ry, 0); m.position.copy(V(x, y)); g.add(m); };
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(.56, .62, .26, 36), new THREE.MeshPhongMaterial({ color: 0x4a86c4, shininess: 100, specular: 0x7fc4ff, emissive: 0x08182c })); pad.position.copy(V(TXp, -.17)); g.add(pad);
  tor(.3, .05, TXp, .5, Math.PI / 2, 0); tor(.3, .05, TXp, .95, Math.PI / 2, 0); tor(.34, .07, TXp, .1, Math.PI / 2, 0); tor(.33, .07, 2.97, 1.8, 0, Math.PI / 2);
  const hinge = new THREE.Group(); hinge.position.copy(V(2.92, 2.1)); const lid = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .07, 28), LM); lid.rotation.z = Math.PI / 2; lid.position.set(0, -.3, 0); hinge.add(lid);
  const lr = new THREE.Mesh(new THREE.TorusGeometry(.25, .04, 8, 24), M2); lr.rotation.y = Math.PI / 2; lr.position.set(-.05, -.3, 0); hinge.add(lr); const kn = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), M2); kn.position.set(-.09, -.3, 0); hinge.add(kn); g.add(hinge);
  const gl = new THREE.Mesh(new THREE.CircleGeometry(.26, 24), new THREE.MeshBasicMaterial({ color: 0x9aeaff, transparent: true, opacity: .45, depthWrite: false, ...ADD })); gl.rotation.y = Math.PI / 2; gl.position.copy(V(2.95, 1.8)); g.add(gl);
  const mouth = V(2.95, 1.8), ids = fvModelFish(4), fish = ids.map(i => { const b = fvFish(i, false); b.group.visible = false; sc.add(b.group); return b; });
  const CYC = 7.2, T0 = 2.0, GAP = .3; let lidA = 0, lidV = 0, sq = 0, sqv = 0, lastEmit = -1, ph = 0, wasEmit = false;
  return { sc, cam: [-.5, .6, 9.8, -.5, .55, 0], step(t, dt) {
    const c = t % CYC, rumble = c > 1.0 && c < 1.9, emit = c >= 1.9 && c < 4.9, tt = Math.max(0, c - 1.0), k9 = Math.min(1, tt / .9);   // the game's timing: rattles for .9 s, then the lid flips open
    const tgt = emit ? -1.9 : rumble ? -Math.abs(Math.sin(c * 38)) * .1 * Math.min(1, tt / .8) : 0;
    lidV += ((tgt - lidA) * 260 - lidV * 13) * dt; lidA += lidV * dt; if (lidA > 0) { lidA = 0; lidV *= -.35; } hinge.rotation.z = lidA; gl.visible = lidA < -.4;
    LM.emissiveIntensity = c < 1.1 ? .45 + .3 * Math.sin(t * 2.4) : .5;
    const em = Math.floor((c - T0) / GAP + 1e-6); if (c < T0 - .2) lastEmit = -1; if (c < 1) { ph = 0; wasEmit = false; } if (rumble && tt > .6 && !ph) { ph = 1; sqv -= 6; } if (emit && !wasEmit) { wasEmit = true; sqv += 5; } if (em !== lastEmit && c >= T0 && em >= 0 && em < fish.length) { sqv -= 3; lastEmit = em; }   // the same kicks as the game's pipe
    sqv += (-170 * sq - 9 * sqv) * dt; sq += sqv * dt; g.scale.set(1 + sq * .14, 1 - sq * .08, 1 + sq * .14); if (rumble) g.position.set(Math.sin(tt * 55) * .03 * k9, 0, Math.cos(tt * 49) * .03 * k9); else if (emit) g.position.set(Math.sin(c * 50) * .012, 0, Math.cos(c * 47) * .012); else g.position.set(0, 0, 0);   // the game's squash and shake: it rattles harder and harder, then keeps trembling while fish come out
    const q = new THREE.Quaternion(), d = new THREE.Vector3();
    fish.forEach((b, k) => {
      const ft = c - (T0 + k * GAP), vis = ft > 0 && ft < .95; b.group.visible = vis; if (!vis) return;
      const vx = -1.6, vy0 = 2.6, gr = 6, vy = vy0 - gr * ft; b.group.position.set(mouth.x + vx * ft - .1, mouth.y + vy0 * ft - .5 * gr * ft * ft, .15 + .35 * ft); d.set(vx, vy, .25).normalize(); q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d); b.group.quaternion.slerp(q, 1 - Math.exp(-dt * 14));
      const pop = Math.min(1, ft / .12), sz = (1 - Math.pow(1 - pop, 3) * 1) * clamp((.95 - ft) / .4, 0, 1) * 1.15; b.group.scale.setScalar(Math.max(.001, sz));
      if (b.update) b.update(dt * 1.4, { wph: t * 11 + k * 2, boost: 1.2 });
    });
  } };
}
function fvSwarm() {   // the game's own grey school (same model, same grey, same tail sway), circling in a ring that stays inside the picture
  const sc = fvScene(), N = 16, art = { hx: .4 }, mesh = new THREE.InstancedMesh(swarmGeo(art), swarmMat(art), N); mesh.frustumCulled = false; sc.add(mesh);
  const fish = []; for (let i = 0; i < N; i++) fish.push({ ph: i / N * 6.283, sp: .7 + (i % 4) * .06, y: Math.sin(i * 2.1) * .3, r: .85 + (i % 3) * .13, s: .9 + (i % 3) * .15 });
  const q = new THREE.Quaternion(), d = new THREE.Vector3(), p = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0), m = new THREE.Matrix4(), sv = new THREE.Vector3(), qs = fish.map(() => new THREE.Quaternion());
  return { sc, cam: [0, 1.2, 6.6, 0, 0, 0], step(t, dt) {
    fish.forEach((f, i) => { const a = t * f.sp + f.ph, A = 1.0 * f.r, B = .65 * f.r; p.set(Math.cos(a) * A, f.y + Math.sin(a * 2 + f.ph) * .1, Math.sin(a) * B);
      d.set(-Math.sin(a) * A, Math.cos(a * 2 + f.ph) * .2, Math.cos(a) * B).normalize(); q.setFromUnitVectors(X, d); qs[i].slerp(q, 1 - Math.exp(-dt * 12)); sv.setScalar(f.s); m.compose(p, qs[i], sv); mesh.setMatrixAt(i, m); });
    mesh.instanceMatrix.needsUpdate = true;
  } };
}
function fvTick(dt) {
  const ov = $('ovIntro'); if (!FV.kind || !ov || !ov.classList.contains('show')) { FV.on = false; return; }
  if ((FV.kind === 'swarm' && !SWARM.geo) || (FV.kind === 'squid' && !OCT.ready)) { FV.on = false; return; }
  fvInit(); let e = FV.cache[FV.kind]; if (!e) { const mk = { squid: fvSquid, clam: fvClam, pipe: fvPipe, swarm: fvSwarm }[FV.kind]; if (!mk) { FV.on = false; return; } e = FV.cache[FV.kind] = mk(); }
  if (FV.cur !== FV.kind) { FV.cur = FV.kind; FV.t = 0; }
  FV.t += dt; e.step(FV.t, dt); FV.cam.position.set(e.cam[0], e.cam[1], e.cam[2]); FV.cam.lookAt(e.cam[3], e.cam[4], e.cam[5]);
  FV.r.render(e.sc, FV.cam); FV.g.clearRect(0, 0, 640, 640); FV.g.drawImage(FV.r.domElement, 0, 0); FV.on = true; window.__fv = FV;
}
const INTRO = {
  backup: { spot: '#backup', title: 'Backup Slots', text: () => 'Wrong fish land here. When all 7 slots are full, you lose!' },
  goal: { spot: '#targets', title: '', text: () => 'Fill the tanks with the fish shown above' },
  hint: { spot: '#bHint', pic: 'ui/bf/ic_hint.png', booster: true, title: 'Hint', text: () => 'Show the fish you need' },
  tank: { spot: '#bTank', pic: 'ui/bf/ic_net.png', booster: true, title: 'Clear Tank', text: () => 'Fill the target tank' },
  clear: { spot: '#bClear', pic: 'ui/bf/ic_clear.png', booster: true, title: 'Clear Backup', text: () => 'Send Backup fish back' },
  feed: { rib: 'NEW EVENT', tag: 'EVENT', ev: true, img: 'hand', title: 'Feeding Time', text: () => 'Food drops in and the fish crowd the surface. Wait for them to spread out.' },
  swarm: { rib: 'NEW OBSTACLE', tag: 'OBSTACLE', school: true, fv: 'swarm', title: 'Fish Swarm', text: () => 'A huge school covers the fish.\nWait for it to pass!' },
  squid: { rib: 'NEW OBSTACLE', tag: 'OBSTACLE', img: 'squid', fv: 'squid', title: 'Octopus', text: () => 'It sprays ink over the fish.\nTapping it fills 3 Backup slots!' },
  pump: { rib: 'NEW MECHANIC', tag: 'PIPE', fv: 'pipe', icon: () => THUMB[SPECIES[0].id], title: 'Fish Pipe', text: () => 'More fish are pumped in through the pipe as you clear tanks.' },
  clam: { rib: 'NEW OBSTACLE', tag: 'OBSTACLE', img: 'clam', fv: 'clam', title: 'Hungry Clam', text: n => 'It grabs a fish you need. Tap it to free the fish.' } };
function showSpot(d) {   // no separate pop-up: dim the screen and light up the real UI element, with a short tip beside it
  document.querySelectorAll('.spotlit').forEach(e => e.classList.remove('spotlit')); document.querySelectorAll(d.spot).forEach(e => e.classList.add('spotlit'));   /* while the tip is up the booster shows at full strength, even when it is greyed out (Backup empty) */
  const rs = [...document.querySelectorAll(d.spot)].map(e => e.getBoundingClientRect()), r = { left: Math.min(...rs.map(q => q.left)), top: Math.min(...rs.map(q => q.top)), right: Math.max(...rs.map(q => q.right)), bottom: Math.max(...rs.map(q => q.bottom)) }; r.width = r.right - r.left; r.height = r.bottom - r.top; const pad = 6, box = $('spotBox'), tip = $('spotTip');
  box.style.left = (r.left - pad) + 'px'; box.style.top = (r.top - pad) + 'px'; box.style.width = (r.width + pad * 2) + 'px'; box.style.height = (r.height + pad * 2) + 'px';
  box.style.borderRadius = Math.min(26, r.height / 2 + pad) + 'px';
  $('spotT').textContent = d.title; $('spotP').textContent = d.text(); $('spotOv').dataset.kind = d.booster ? 'booster' : 'board'; $('spotOv').dataset.sel = d.spot; $('spotPic').src = d.pic ? new URL(d.pic, document.baseURI).href : ''; $('spotOv').classList.add('show');
  const A = $('app').getBoundingClientRect(), tw = Math.min(270, A.width - 20); tip.style.width = tw + 'px'; tip.style.left = Math.max(A.left + 10, Math.min(A.right - tw - 10, r.left + r.width / 2 - tw / 2)) + 'px';   // the tip stays inside the game column
  tip.style.top = (r.bottom + pad + 16) + 'px'; tip.classList.toggle('arrR', r.left + r.width / 2 > A.left + A.width * .8);
  const cx = r.left + r.width / 2 - parseFloat(tip.style.left); tip.style.setProperty('--ax', Math.max(18, Math.min(tw - 18, cx)) + 'px');
}
function makeSchool(done) {   // a school of fish all swimming the same way, drawn from the fish thumbnails
  const ids = SPECIES.map((s, i) => i).filter(i => THUMB[SPECIES[i].id] && SPECIES[i].model3d && !SPECIES[i].hue).slice(0, 3), srcs = ids.map(i => THUMB[SPECIES[i].id]), imgs = [], cv = document.createElement('canvas'); cv.width = 720; cv.height = 440;
  const spots = [[100, 30, 95, 0], [100, 330, 95, 1], [190, 110, 110, 2], [190, 240, 110, 0], [300, 20, 100, 1], [300, 180, 120, 2], [300, 340, 100, 0], [420, 100, 125, 1], [420, 250, 125, 2], [520, 175, 150, 0]];
  let n = 0; srcs.forEach((u, k) => { const im = new Image(); im.onload = () => { if (++n === srcs.length) { const g = cv.getContext('2d'); for (const [x, y, w, k2] of spots) { const f = imgs[k2 % imgs.length]; g.drawImage(f, x, y, w, w * f.height / f.width); } const px = g.getImageData(0, 0, cv.width, cv.height), d = px.data; for (let i = 0; i < d.length; i += 4) { const l = (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11) * .5 + 20; d[i] = l; d[i + 1] = l; d[i + 2] = l + 6; } g.putImageData(px, 0, 0); done(cv.toDataURL('image/png')); } }; im.src = u; imgs[k] = im; });
}
function showIntro(k) {
  const d = INTRO[k]; FV.kind = d.fv || ''; FV.cur = '';
  if (d.spot) { introOn = true; paused = true; hideOverlays(); showSpot(d); popupOn = true; Snd.bgmDuckTo(.5); Snd.play('popopen'); return; } $('introRib').textContent = d.rib; $('introTag').textContent = d.tag; $('introTag').classList.toggle('ev', !!d.ev); $('introTitle').textContent = d.title; $('introTxt').textContent = d.text(G.cfg.clamTaps); $('introImg').src = d.pic ? new URL(d.pic, document.baseURI).href : d.icon ? d.icon() : (THUMB[d.img + '_big'] || THUMB[d.img] || ''); if (d.school) { $('introImg').src = ''; makeSchool(u => { $('introImg').src = u; }); } $('ovIntro').dataset.kind = d.booster ? 'booster' : 'feature'; $('introLv').textContent = G ? 'Level ' + G.level : '';
  introOn = true; paused = true; showOnly('ovIntro');
}
$('bIntro').onclick = () => { introOn = false; paused = false; hideOverlays(); startLvIntro(); };
$('spotOv').onclick = () => { introOn = false; paused = false; hideOverlays(); startLvIntro(); };
function openPause() { if (!G || G.status !== 'play' || paused || introOn) return; paused = true; showOnly('ovPause'); }
function closePause() { paused = false; hideOverlays(); }
$('pauseBtn').onclick = openPause;
$('bResume').onclick = closePause; $('bXPause').onclick = closePause;
$('bSnd').onclick = () => { Snd.init(); Snd.setMuted(!save.muted); syncSound(); if (!save.muted) Snd.play('ui'); };
$('bMus').onclick = () => { Snd.init(); Snd.setMusic(!!save.noMusic); if (!save.noMusic) Snd.bgmStart(); };
$('bVib').onclick = () => { save.noVib = !save.noVib; persist(); if (!save.noVib) vib(30); };
$('bReset').onclick = () => { resetting = true; try { localStorage.removeItem(SAVE_KEY); } catch (e) { } location.reload(); };   // developer tool: one tap wipes the saved progress and the first-time pop-up flags
$('bRestart1').onclick = () => { if (G) newLevel(G.level); };   // one tap restarts (no "tap again" confirm)
$('bNext').onclick = () => newLevel(G.level + 1);
$('bReplay').onclick = () => newLevel(G.level);
$('bRetry').onclick = () => newLevel(G.level);
$('bPlayOn').onclick = () => { if (!G || G.status !== 'playon') return; G.playOnUsed = true; hideOverlays(); G.status = 'play'; paused = false; clearBackup(); };   // the Backup fish jump back into the tank and the game goes on
$('bNoPlayOn').onclick = () => { if (!G || G.status !== 'playon') return; hideOverlays(); paused = false; loseNow(); };
let lvReturn = 'ovPause';
function openLevels(from) {
  lvReturn = from; paused = true; const g = $('lvGrid'); g.innerHTML = '';
  for (let n = 1; n <= MAX_LV; n++) {
    const b = document.createElement('button'), locked = false, st = save.stars[n] || 0; b.className = 'lvb' + (locked ? ' lock' : '') + (G && n === G.level ? ' cur' : '');
    b.innerHTML = locked ? '' : `${n}<small>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</small>`; if (!locked) b.onclick = () => { Snd.play('ui'); newLevel(n); };
    g.appendChild(b);
  }
  showOnly('ovLevels'); const cur = g.querySelector('.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
}
$('bLevels1').onclick = () => openLevels('ovPause'); $('bLevels2').onclick = () => openLevels('ovWin'); $('bLevels3').onclick = () => openLevels('ovLose');
$('bLvBack').onclick = () => { showOnly(lvReturn); };

/* ---- tools: sound / camera / hint ---- */
const soundBtn = $('bSound'); const syncSound = () => { soundBtn.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 2px 0 #0a3a6a)"><path d="M4 9.5h4l5-4v13l-5-4H4z" fill="#fff"/>' + (save.muted ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12"/>') + '</svg>'; soundBtn.classList.toggle('off', save.muted); };
soundBtn.onclick = () => { Snd.init(); Snd.setMuted(!save.muted); syncSound(); if (!save.muted) Snd.play('ui'); }; syncSound();
const panBtns = $('pan'); let panHold = 0;
for (const [id, v] of [['bUp', -1], ['bDn', 1]]) { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); panHold = v; camTut.pressed = 1; camTween.on = false; }); for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { if (panHold === v) panHold = 0; }); }
window.__pan = v => { panHold = v; if (v) { camTut.pressed = 1; camTween.on = false; } };   // used by the Phaser UI for the camera arrow buttons
const camTween = { on: false, t: 0, az0: 0, azT: 0, el0: 0, d0: 0 };
function resetCam() { let a = orbit.az - .65; a = ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; Object.assign(camTween, { on: true, t: 0, az0: orbit.az, azT: orbit.az - a, el0: orbit.el, d0: orbit.dist }); orbit.azV = 0; }
$('bCam').onclick = resetCam;
const HINT_CD = 0, HINT_DUR = 3.6; let hintReady = 0; // time (U.uTime) when hint is ready again
function hint() {
  if (!G || G.status !== 'play' || paused || U.uTime.value < hintReady) return;
  const need = new Set(G.targets.filter(t => t && !t.done && t.count < perOf(t.type)).map(t => t.type));
  const cands = G.things.filter(o => o.alive && o.kind === 'fish' && !o.locked && need.has(o.type)).sort((a, b) => a.group.position.distanceTo(cam.position) - b.group.position.distanceTo(cam.position)).slice(0, 3);
  let clamHint = false; for (const c of G.things) if (c.kind === 'clam' && c.state === 'closed' && c.fish && need.has(c.fish.type)) { c.glowUntil = U.uTime.value + HINT_DUR; clamHint = true; }
  if (!cands.length && !clamHint) { hintReady = U.uTime.value + HINT_CD; Snd.play('hint'); return; }
  for (const o of cands) {
    if (!o.outline) { // crisp gold rim around the body + a bobbing arrow above the fish
      if (o.parts.setGlow) o.outline = { visible: false, scale: { setScalar() { } }, material: { color: { setRGB() { } } } };   // 3D models glow through setGlow instead
      else { const ol = new THREE.Mesh(o.parts.body.geometry, new THREE.MeshBasicMaterial({ alphaMap: FISHART[o.id].mask, alphaTest: .5, color: 0xffd23a, side: THREE.BackSide, fog: false })); ol.scale.setScalar(1.08); o.parts.body.add(ol); o.outline = ol; }
      const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: arrowTex(), transparent: true, depthTest: false, depthWrite: false, fog: false })); mk.renderOrder = 31; mk.scale.set(.5, .5, 1); fishRoot.add(mk); o.mark = mk; }
    o.hinted = true; o.boost = 0; o.wp = o.pos.clone(); o.wpT = 6; }
  // the rest of the school drifts away from the highlighted fish so they are easy to spot
  for (const q of G.things) {
    if (!q.alive || q.kind !== 'fish' || q.hinted) continue;
    for (const c of cands) { away.subVectors(q.pos, c.pos); const d = away.length(); if (d > 3.3) continue; if (d < 1e-3) away.set(rand(-1, 1), 0, rand(-1, 1)); away.normalize(); away.y *= .4; away.normalize();
      q.boost = Math.max(q.boost, .9 + (1 - d / 3.3)); q.dir.lerp(away, .9).normalize(); const tgt = q.pos.clone().addScaledVector(away, rand(2.6, 4)); clampXZ(tgt, RF); tgt.y = clamp(tgt.y, FLOOR_Y + .6, WATER_Y - .55); q.wp = tgt; q.wpT = rand(3, 5); break; }
  }
  hintReady = U.uTime.value + HINT_CD; Snd.play('hint');
}
const glowTex = dotTex(false);
let _arrow = null; function arrowTex() { if (!_arrow) { _arrow = new THREE.TextureLoader().load(new URL('ui/arrow.png', document.baseURI).href); _arrow.colorSpace = THREE.SRGBColorSpace; _arrow.anisotropy = 4; } return _arrow; }   // the yellow pointer from the art folder (pointing down)
function refreshClearBtn() { const b = $('bClear'); if (b) b.classList.toggle('off', !G || !G.backup.length); const t = $('bTank'); if (t) t.classList.toggle('off', !G || tankPick() < 0); }   // (tankPick gives a tank's position, 0 is a valid one: `!tankPick()` greyed the button whenever the first tank was the neediest)
const tankPick = () => { let best = -1, bn = 0; if (G) G.targets.forEach((t, i) => { if (!t || t.done) return; const n = perOf(t.type) - t.count; if (n > bn) { bn = n; best = i; } }); return best; };   // the tank that still needs the most fish (the one with the fewest fish when they tie on the need)
function clearBackup(win) {   // booster: everything sitting in the backup strip jumps back into the big tank (win = the last target is done: the same jump, so no fish is left stuck in the strip when the win sequence starts)
  if (!G || !G.backup.length) return; if (!win && (G.status !== 'play' || paused)) return;
  if (G.backup.some(it => !it.filler && !it.landed)) { if (win) { const g2 = gid; setTimeout(() => { if (g2 === gid) clearBackup(true); }, 200); return; } toast('Wait for the fish to land!'); return; }
  const items = G.backup.slice(), gi = gid; G.backup = []; renderBackup();
  const slots = [...$('backup').querySelectorAll('.slot')];
  items.forEach((it, k) => {
    const sp = it.res; if (!sp) return; const r = slots[k].getBoundingClientRect(), from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    // the fish enters through the open top, in the half of the opening nearest the camera, so it comes into view below the Backup tray and never crosses it
    const trayBottom = $('backup').getBoundingClientRect().bottom, dh = Math.max(1e-3, Math.hypot(cam.position.x, cam.position.z)), ux = cam.position.x / dh, uz = cam.position.z / dh;
    let P = null, M = null, c = null;
    const solids = themeBoxes(curTheme); let bestBad = 1e9;
    for (let tr = 0; tr < 40; tr++) {
      const big0 = !!sp.built.oct, f = (big0 ? rand(.02, .1) : rand(.15, .62)) * RF, l = (big0 ? rand(-.08, .08) : rand(-.55, .55)) * RF, px = ux * f - uz * l, pz = uz * f + ux * l, Pi = new THREE.Vector3(px, WATER_Y - (big0 ? 1.3 : .55), pz), Mi = new THREE.Vector3(px, TANK_H + (big0 ? 1.15 : .55) + (window.__dbgLift || 0), pz), ci = projectToClient(Mi);   /* the octopus is big: it comes in down the middle of the opening, from well above the rim, so its arms never touch the glass */
      /* the whole way down must be clear of decoration: a column of radius r (the octopus is wide), also where the sideways drift carries it, from the water to the lowest point it dives to */
      const rr = big0 ? 1.5 : .55, sxx = ci.x >= from.x ? 1 : -1, hx0 = camRight.x * sxx, hz0 = camRight.z * sxx, hh = Math.hypot(hx0, hz0) || 1; let bad = 0;
      for (const kk of [0, .7, 1.4]) { const qx = px + hx0 / hh * kk, qz = pz + hz0 / hh * kk; for (const b of solids) { if (b.min.y > WATER_Y || b.max.y < 1.4) continue; const dx = Math.max(b.min.x - qx, 0, qx - b.max.x), dz = Math.max(b.min.z - qz, 0, qz - b.max.z); if (Math.hypot(dx, dz) < rr) bad++; } if (Math.hypot(qx, qz) > RF - (big0 ? 1.1 : .3)) bad += 3; }
      if (bad < bestBad || (bad === bestBad && (!c || ci.y > c.y))) { bestBad = bad; P = Pi; M = Mi; c = ci; } if (bad === 0 && ci.y > trayBottom + 44) { P = Pi; M = Mi; c = ci; break; }
    }
    if (sp.built.oct) { while (M.y > WATER_Y + .25 && octBoxAt(M).top < trayBottom + 6) { M.y -= .12; } const bb0 = octBoxAt(M); c = { x: bb0.cx, y: bb0.cy }; }   /* the flying picture lands on the middle of the picture of the 3D octopus (not on its origin): no sideways jump at the hand-off */   /* it enters where the whole of it is in view, below the Backup tray (the tray is drawn over the 3D tank, so a high entry was half hidden) */
    const pp = projectToClient(M.clone().addScaledVector(camRight, .45)), fsz = clamp(Math.hypot(pp.x - c.x, pp.y - c.y) * 2.2, 34, 80);
    const anchor = document.createElement('div'); anchor.style.cssText = `position:fixed;left:${c.x - fsz / 2}px;top:${c.y - fsz / 2}px;width:${fsz}px;height:${fsz}px;pointer-events:none;opacity:0`; document.body.appendChild(anchor);
    setTimeout(() => {
      if (gi !== gid) { anchor.remove(); ovRemove(sp); return; }
      if (sp.built.oct) { sp.octEnd = octSizeAt(M);   /* the size it really has on screen where it will appear */ sp.holder.rotation.z = Math.PI / 2; }
      const hopV = (() => { const sz0 = sp.built.oct ? Math.min(slotSize(r, 'backup') * .8, r.height * .9) * OCT_REL : slotSize(r, 'backup'), need = from.y - $('backup').getBoundingClientRect().top + (sp.built.oct ? .62 : .56) * sz0 + 10, D = c.y - from.y; for (let h = 50; h < 230; h += 4) { let best = -1e9; for (let u = .02; u < .6; u += .02) best = Math.max(best, 4 * h * u * (1 - u) - D * u); if (best >= need) return h; } return 230; })();   /* how high the arc must go for the animal to be wholly above the rim of the Backup before it leans out: only then does it come in front of the glass */
      flySprite(sp, from, anchor, { size0: sp.built.oct ? Math.min(slotSize(r, 'backup') * .8, r.height * .9) * OCT_REL : slotSize(r, 'backup'), dur: 1050, delay: 0, mode: 'target', proj: true, hop: hopV, anticip: 120, onland: () => {
        const spPos = { x: sp.holder.position.x + ov.W / 2, y: ov.H / 2 - sp.holder.position.y, size: sp.holder.scale.x * sp.dim }, anR = anchor.getBoundingClientRect();
        anchor.remove(); ovRemove(sp); if (gi !== gid || !G || (G.status !== 'play' && !(win && G.status === 'won'))) return; Snd.play('totank');
        spawnThing(it.junk ? { kind: it.id } : { kind: 'fish', type: it.type }, M, G.things.length); const th = G.things[G.things.length - 1]; th.spawnAt = U.uTime.value - G.t0; th.scale = 1;
        const sx = c.x >= from.x ? 1 : -1, hx = camRight.x * sx, hz = camRight.z * sx, hl = Math.hypot(hx, hz) || 1;   // heading: along the screen, the way the fish was flying
        if (window.__dbg && sp.built.oct) { const bt = octBoxAt(M); window.__hand = { c: { x: Math.round(c.x), y: Math.round(c.y) }, anchorCenter: { x: Math.round(anR.left + anR.width / 2), y: Math.round(anR.top + anR.height / 2) }, sprite: { x: Math.round(spPos.x), y: Math.round(spPos.y), size: Math.round(spPos.size) }, M: M.toArray().map(v => +v.toFixed(2)), P: P.toArray().map(v => +v.toFixed(2)), tempBox: { cx: Math.round(bt.cx), cy: Math.round(bt.cy), top: Math.round(bt.top), bot: Math.round(bt.bottom) }, projM: (q => ({ x: Math.round(q.x), y: Math.round(q.y) }))(projectToClient(M)), th3: [], tray: Math.round($('backup').getBoundingClientRect().bottom) }; let nf = 0; const tick = () => { const o3 = G.things[G.things.length - 1]; if (o3 && o3.parts && o3.parts.root) { o3.group.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(o3.parts.root), pts = []; for (let i = 0; i < 8; i++) pts.push(projectToClient(new THREE.Vector3(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z))); const xs = pts.map(q => q.x), ys = pts.map(q => q.y), po = projectToClient(o3.pos); window.__hand.th3.push({ n: nf, scl: +o3.group.scale.x.toFixed(2), pos: o3.pos.toArray().map(v => +v.toFixed(2)), boxC: [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...ys) + Math.max(...ys)) / 2)], origin: [Math.round(po.x), Math.round(po.y)], yaw: +(2 * Math.atan2(o3.group.quaternion.y, o3.group.quaternion.w)).toFixed(2) }); } if (++nf < 6) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
        const ppuV = Math.max(20, Math.abs(projectToClient(M.clone().add(new THREE.Vector3(0, 1, 0))).y - c.y)), v0c = clamp((sp.endVy || 0) / ppuV, .6, 6);   /* the speed the flying picture really had when it landed (measured), in world units per second */
        const colTop = (() => { let top = 0; for (const b of solids) { if (b.min.y > WATER_Y) continue; const dx = Math.max(b.min.x - P.x, 0, P.x - b.max.x), dz = Math.max(b.min.z - P.z, 0, P.z - b.max.z); if (Math.hypot(dx, dz) < (sp.built.oct ? 1.5 : .55)) top = Math.max(top, b.max.y); } return top; })();
        th.dive = { t: 0, yMin: Math.max(FLOOR_Y + 1.2, colTop + (sp.built.oct ? 1.05 : .45)), v0: v0c, vh0: clamp(Math.abs(sp.endVx || 0) / Math.max(20, Math.hypot(pp.x - c.x, pp.y - c.y) / .45), 0, 7), x: P.x, z: P.z, y0: M.y, y1: P.y, hx: hx / hl, hz: hz / hl, yaw: Math.atan2(-hz / hl, hx / hl), first: true }; kick(.6);
      } });
    }, k * 110);
  });
}
$('bClear').onclick = () => { if ($('bClear').dataset.locked === '1' || $('bClear').dataset.lockLv) return; clearBackup(); };
function clearTank() {   // booster: one target tank is filled at once: the fish it still needs fly in from the booster button
  if (!G || G.status !== 'play' || paused) return; const i = tankPick(); if (i < 0) return;
  const t = G.targets[i]; pullFromBackup(i);   // fish of that kind waiting in the Backup go first
  const n = perOf(t.type) - t.count, gi = gid;
  const live = G.things.filter(o => o.alive && o.kind === 'fish' && o.type === t.type && !o.locked && !o.big && !o.tubeP && !o.launch && !o.dive).sort((p, q) => p.pos.distanceTo(cam.position) - q.pos.distanceTo(cam.position)).slice(0, n);   // the fish are the real ones in the water, nearest first: they leap out one after another
  live.forEach((o, k) => setTimeout(() => { if (gi === gid && G.status === 'play' && o.alive) pickThing(o, true); }, k * 230));
  const rest = n - live.length; if (rest > 0) { let need = rest; for (const w of G.waves) { w.specs = w.specs.filter(sp => { if (need > 0 && sp.kind === 'fish' && sp.type === t.type) { need--; return false; } return true; }); }   // the fish that were still hidden in the pipe are the ones that come out of the middle, so no extra copies follow later
    const c = projectToClient(CENTER); for (let k = 0; k < rest; k++) giveToTarget(i, { x: c.x + rand(-40, 40), y: c.y + 40 }, (live.length + k) * 230, 54); }   // fewer in the water than needed (some wait in the tube or a clam): the rest rise out of the middle of the tank
  refreshClearBtn();
}
$('bTank').onclick = () => { if ($('bTank').dataset.locked === '1' || $('bTank').dataset.lockLv) return; clearTank(); };
function refreshHintBtn() { hintReady = 0; $('bHint').style.setProperty('--p', '0%'); refreshClearBtn(); }
$('bHint').onclick = () => { if ($('bHint').dataset.locked === '1' || $('bHint').dataset.lockLv) return; hint(); };
function updateHint() {
  const rem = Math.max(0, hintReady - U.uTime.value); $('bHint').style.setProperty('--p', HINT_CD ? (rem / HINT_CD * 100).toFixed(1) + '%' : '0%');
  if (!G) return; const need = new Set(G.targets.filter(t => t && !t.done && t.count < perOf(t.type)).map(t => t.type));
  for (const o of G.things) if (o.outline) { const on = o.alive && o.hinted && need.has(o.type); o.outline.visible = on; o.mark.visible = on; if (o.parts.setGlow) o.parts.setGlow(Math.max(on ? .65 + .35 * (.5 + .5 * Math.sin(U.uTime.value * 5 + o.phase)) : 0, o.hv > .03 ? Math.min(1, o.hv * 1.7) : 0));
    if (on) { const k = .5 + .5 * Math.sin(U.uTime.value * 5 + o.phase); o.outline.scale.setScalar(1.07 + .03 * k); o.outline.material.color.setRGB(1, .74 + .12 * k, .12 + .1 * k); const tt = U.uTime.value; if (!o.markOn) { o.markOn = true; o.markT0 = tt; } const u = clamp((tt - o.markT0) / .4, 0, 1), pop = u >= 1 ? 1 : 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2), bob = Math.sin(tt * 6 + o.phase), sq = 1 + .1 * Math.sin(tt * 12 + o.phase + 1.2);   // pops in with an overshoot, then bobs, squashes and sways
      o.mark.position.set(o.pos.x, o.pos.y + .42 + .08 * bob + (1 - pop) * .4, o.pos.z); o.mark.scale.set(.34 * pop / sq, .228 * pop * sq, 1); o.mark.material.rotation = Math.sin(tt * 3 + o.phase) * .12;
      if (tt > (o.markSp || 0)) { o.markSp = tt + .38; burstFx.emit(o.mark.position, 0xffd23a, 2, .5); } }
    else { o.markOn = false; if (o.hinted && !need.has(o.type)) o.hinted = false; } }
}

/* ---- tutorial ---- */
const thumbImg = k => { const id = SPECIES[Math.min(k, SPECIES.length - 1)].id; return THUMB[id] ? `<img src="${THUMB[id]}" style="height:54px;display:block">` : ''; };
const TUT = [   // pictures first, three words at most
  { sel: '#targets', title: 'Find these fish', pic: () => `<span class="tp-fish">${thumbImg(0)}<b>×1</b></span><span class="tp-fish">${thumbImg(1)}<b>×1</b></span>` },
  { sel: '#tankwrap', place: 'in', title: 'Tap to catch', pic: () => `<span class="tp-tap"><span class="tp-fish">${thumbImg(0)}</span><span class="tp-ring"></span></span>` },
  { sel: '#backup', title: "Don't fill Backup", pic: () => `<span class="tp-bk"><i></i><i></i><i></i><i></i><i class="x"></i><i class="x"></i><i class="x"></i></span>` },
  { sel: '#bHint,#bClear', title: 'Boosters', pic: () => `<span class="tp-btn"><img src="${introIcon('hint')}" style="width:40px"><small>Find</small></span><span class="tp-btn"><img src="${introIcon('clear')}" style="width:40px"><small>Clear</small></span>` },
];
const guide = { on: false, tgt: null, left: 2 };
const camTut = { step: null, acc: 0, d0: 0 };   // camera tutorial: drag to rotate -> pinch / scroll to zoom (level 1-2, once)
function camTutUpdate() {
  const box = $('camTut'); if (!box) return;
  const ok = !!G && G.status === 'play' && !paused && !introOn && tutI < 0 && G.level <= 2 && !guide.on && uiReady();
  if (!ok) { box.classList.remove('show'); $('pan').classList.remove('glow'); return; }
  if (camTut.step === null) { if (!save.gRot && G.level === 1) { camTut.step = 'rot'; camTut.acc = 0; } else if (save.gRot && !save.gZoom) { camTut.step = 'zoom'; camTut.d0 = orbit.dist; } else if (save.gRot && save.gZoom && !save.gTilt) camTut.step = 'tilt'; else camTut.step = 'done'; }
  if (camTut.step === 'rot' && camTut.acc > 1.1) { save.gRot = 1; persist(); Snd.play('good'); camTut.step = 'zoom'; camTut.d0 = orbit.dist; }
  if (camTut.step === 'zoom' && Math.abs(orbit.dist - camTut.d0) > orbit.fit * .07) { save.gZoom = 1; persist(); Snd.play('good'); camTut.step = 'tilt'; camTut.pressed = 0; camTut.panAcc = 0; }
  if (camTut.step === 'tilt' && camTut.pressed) { save.gTilt = 1; persist(); Snd.play('good'); camTut.step = 'done'; }
  $('pan').classList.toggle('glow', camTut.step === 'tilt' && ok);
  if (camTut.step === 'done') { box.classList.remove('show'); return; }
  box.className = 'show ' + camTut.step; const coarse = matchMedia('(pointer:coarse)').matches;
  $('camMsg').textContent = camTut.step === 'rot' ? 'Drag to look around' : camTut.step === 'tilt' ? 'Drag with two fingers to move the view up / down' : 'Pinch to zoom in / out';
}
let uiRdyFor = -1;
const uiReady = () => {   /* the first-time boards ("Tap a fish", the camera steps) and the hand wait until the UI has slid in completely (about 1.5 s after it starts) and the opening camera shot is over. It is asked ONCE per level: the lids of the target tanks swing shut and open again every time a tank is finished, and that was taking the guide and the hand off the screen in the middle of the level */
  if (!G) return false; if (uiRdyFor === G.id) return true;
  const ok = performance.now() > (window.__hudInT0 || 0) + 1600 && !camIntro && window.__lvShown !== false && (G.targets || []).every((t, i) => !t || (window.__lid && window.__lid[i] >= .98));
  if (ok) uiRdyFor = G.id; return ok;
};
function guideUpdate() {
  camTutUpdate();
  const bar = $('goalMsg'); if (bar) { const on = !!G && G.level === 1 && G.status === 'play' && !paused && !introOn && guide.on && uiReady(); bar.classList.toggle('show', on); if (on) { const r = $('backup').getBoundingClientRect(); bar.style.top = (r.top + r.height / 2 - 22) + 'px'; } }
  const h = $('guideHand'); if (!h) return;
  if (!guide.on || !G || G.status !== 'play' || paused || tutI >= 0 || introOn || !uiReady()) { h.classList.remove('show'); return; }
  if (!guide.tgt || !guide.tgt.alive || guide.tgt.locked || !G.need.has(guide.tgt.type)) {
    let best = null, bd = 1e9; for (const pass of [0, 1]) { for (const o of G.things) { if (o.kind !== 'fish' || !o.alive || o.locked || !G.need.has(o.type)) continue; if (pass === 0 && projectToClient(o.group.getWorldPosition(_gp)).y > innerHeight * .62) continue; const d = o.pos.distanceTo(cam.position); if (d < bd) { bd = d; best = o; } } if (best) break; } guide.tgt = best;
  }
  const o = guide.tgt; if (!o) { h.classList.remove('show'); return; }
  const p = projectToClient(o.group.getWorldPosition(_gp)); h.style.left = (p.x - 18) + 'px'; h.style.top = (p.y + 8) + 'px'; h.classList.add('show'); o.hvT = 1;
}
const _gp = new THREE.Vector3();
let tutI = -1;
function showTut(i) {
  tutI = i; paused = true; const app = $('app').getBoundingClientRect(), tut = $('tut'); tut.classList.add('show');
  const st = TUT[i], el = (() => { const rs = [...document.querySelectorAll(st.sel)].map(e => e.getBoundingClientRect()), L = Math.min(...rs.map(r => r.left)), T = Math.min(...rs.map(r => r.top)), Rr = Math.max(...rs.map(r => r.right)), B = Math.max(...rs.map(r => r.bottom)); return { left: L, top: T, right: Rr, bottom: B, width: Rr - L, height: B - T }; })(), pad = 6, sp = $('tutSpot'), tip = $('tutTip');
  Object.assign(sp.style, { left: el.left - app.left - pad + 'px', top: el.top - app.top - pad + 'px', width: el.width + pad * 2 + 'px', height: el.height + pad * 2 + 'px' });
  $('tutH').textContent = st.title; $('tutP').textContent = st.text || ''; $('tutP').style.display = st.text ? '' : 'none'; $('tutPic').innerHTML = (typeof st.pic === 'function' ? st.pic() : st.pic) || ''; $('tutNext').textContent = i === TUT.length - 1 ? "Let's go!" : 'Next';
  $('tutDots').innerHTML = TUT.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  tip.style.animation = 'none'; void tip.offsetWidth; tip.style.animation = '';
  const th = tip.offsetHeight; let top;
  if (st.place === 'in') top = el.top - app.top + el.height * .18; else if (el.top - app.top + el.height / 2 < app.height * .5) top = el.bottom - app.top + 18; else top = el.top - app.top - th - 18;
  tip.style.top = clamp(top, 8, app.height - th - 8) + 'px';
}
function endTut() { $('tut').classList.remove('show'); tutI = -1; paused = false; save.tut = true; persist(); }
$('tutNext').onclick = () => { Snd.play('ui'); if (tutI >= TUT.length - 1) endTut(); else showTut(tutI + 1); };
$('tutSkip').onclick = () => { Snd.play('ui'); endTut(); };
if ($('bHow')) $('bHow').onclick = () => { hideOverlays(); showTut(0); };
window.addEventListener('resize', () => { if (tutI >= 0) showTut(tutI); });

/* ---- keyboard + focus ---- */
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'p') { if (tutI >= 0 || introOn) return; if ($('ovPause').classList.contains('show')) closePause(); else openPause(); }
  else if (k === 'r') resetCam(); else if (k === 'h') hint(); else if (k === 'm') soundBtn.click();
  else if (k === 'arrowleft') { orbit.azV = 2.2; } else if (k === 'arrowright') { orbit.azV = -2.2; } else if (k === 'arrowup') { orbit.elV = -1.2; } else if (k === 'arrowdown') { orbit.elV = 1.2; } else if (k === 'w') { orbit.target.y += .25; } else if (k === 's') { orbit.target.y -= .25; }
  
});
document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.status === 'play' && tutI < 0 && !introOn) openPause(); });
document.addEventListener('pointerdown', e => { if (popupOn || introOn) return; for (const id of ['bHint', 'bTank', 'bClear']) { const el = $(id); if (!el || !el.dataset.lockLv) continue; const r = el.getBoundingClientRect(); if (r.width > 10 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { Snd.play('ui'); return; } } }, { passive: true });   /* a grey locked booster slot: the button click */
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.btn,.tool,.lvb')) Snd.play('ui'); }, true);


/* ============================== glass + water lens ==============================
   The tank is a water-filled glass cylinder, so it acts like a lens: from the side the fish look wider (magnified horizontally, strongest in the middle)
   and get squeezed + colour-fringed near the glass edges; from above, the surface ripples wobble the view. This is done as a screen-space pass on the
   finished frame. The same mapping is used backwards for taps and forwards for flights, so what you tap is always what you see. */
const LENS = { k: 0, K: .42, KV: .26, on: QP('lens') ? QP('lens') === '1' : !COARSE, edge: new THREE.Vector4(), y0: 0, y1: 1, surf: new THREE.Vector4(), rim: new THREE.Vector4(), wob: 0, ca: .012, sw: 0 };
const _lp = new THREE.Vector3();
function lensUpdate() { lensUpdate0(); PW.uEdge.value.copy(LENS.edge); PW.uYr.value.set(LENS.y0, LENS.y1); PW.uK.value = LENS.k; PW.uKV.value = LENS.k * LENS.KV / LENS.K; }
function lensUpdate0() {
  const cx = cam.position.x, cz = cam.position.z, dh = Math.hypot(cx, cz);
  if (!LENS.on || dh < R * 1.12) { LENS.k = 0; return; }
  const ux = cx / dh, uz = cz / dh, vx = -uz, vz = ux, phi = Math.acos(R / dh), cp = Math.cos(phi) * R, sp = Math.sin(phi) * R;
  const proj = (x, y, z) => { _lp.set(x, y, z).project(cam); return [_lp.x * .5 + .5, _lp.y * .5 + .5]; };
  const edgeAt = y => { const a = proj(cp * ux + sp * vx, y, cp * uz + sp * vz), b = proj(cp * ux - sp * vx, y, cp * uz - sp * vz); return a[0] < b[0] ? [a, b] : [b, a]; };
  const lo = edgeAt(FLOOR_Y), hi = edgeAt(TANK_H), dv = [hi[0][1] - lo[0][1], hi[1][1] - lo[1][1]];
  if (Math.abs(dv[0]) < 1e-4 || Math.abs(dv[1]) < 1e-4) { LENS.k = 0; return; }
  const bL = (hi[0][0] - lo[0][0]) / dv[0], bR = (hi[1][0] - lo[1][0]) / dv[1];
  LENS.edge.set(lo[0][0] - bL * lo[0][1], bL, lo[1][0] - bR * lo[1][1], bR);   // x_left(v) = a + b*v, x_right(v) = a + b*v
  LENS.y0 = proj(R * ux, FLOOR_Y, R * uz)[1]; LENS.y1 = proj(-R * ux, TANK_H, -R * uz)[1];   // front edge of the floor .. back edge of the rim
  const sf = proj(R * ux, WATER_Y, R * uz), sb = proj(-R * ux, WATER_Y, -R * uz), sc = proj(0, WATER_Y, 0), sw = edgeAt(WATER_Y);
  LENS.surf.set(sc[0], (sf[1] + sb[1]) / 2, Math.max(1e-3, (sw[1][0] - sw[0][0]) / 2), Math.max(1e-3, (sb[1] - sf[1]) / 2));
  // the glass rim sits above the water: its screen ellipse is kept free of the surface ripple (see uRim in lensMat)
  const rf = proj(R * ux, TANK_H, R * uz), rb = proj(-R * ux, TANK_H, -R * uz), rw = edgeAt(TANK_H);
  LENS.rim.set((rw[0][0] + rw[1][0]) / 2, (rf[1] + rb[1]) / 2, Math.max(1e-3, (rw[1][0] - rw[0][0]) / 2), Math.max(1e-3, Math.abs(rb[1] - rf[1]) / 2));
  LENS.wob = clamp((orbit.el - .08) / .6, 0, 1);
  LENS.k = LENS.K;
}
function lensK(v) { const b = (LENS.y1 - LENS.y0) * .08 + 1e-6; return LENS.k * clamp((v - LENS.y0) / b, 0, 1) * clamp((LENS.y1 - v) / b, 0, 1); }
function lensKV(v) { const b = (LENS.y1 - LENS.y0) * .2 + 1e-6; return LENS.k * (LENS.KV / LENS.K) * clamp((v - LENS.y0) / b, 0, 1) * clamp((LENS.y1 - v) / b, 0, 1); }   // vertical bow: strongest at the sides, fades out toward the rim and floor
function lensRow(v) { const e = LENS.edge, xl = e.x + e.y * v, xr = e.z + e.w * v; return { c: (xl + xr) / 2, hw: (xr - xl) / 2 }; }
// screen position (uv, v up) the finger touches -> where that spot really is in the undistorted picture
function lensToContent(u, v) { if (!LENS.k) return [u, v]; const { c, hw } = lensRow(v), s = (u - c) / hw; if (Math.abs(s) >= 1) return [u, v]; const k = lensK(v), vc = (LENS.y0 + LENS.y1) / 2; return [c + s / (1 + k * (1 - s * s)) * hw, v + (v - vc) * lensKV(v) * s * s * (1 - smooth01((Math.abs(s) - .78) / .22))]; }
function smooth01(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }
// position in the undistorted picture -> where it is drawn on screen (solved by a few fixed-point steps)
function lensToScreen(u, v) {
  if (!LENS.k) return [u, v]; let du = u, dv = v;
  for (let i = 0; i < 6; i++) { const [cu, cv] = lensToContent(du, dv); du += (u - cu) * .9; dv += (v - cv) * .9; }
  return [du, dv];
}
function lensClientToContent(cx, cy) { const r = canvas.getBoundingClientRect(); if (!r.width || !LENS.k) return { x: cx, y: cy }; const [u, v] = lensToContent((cx - r.left) / r.width, 1 - (cy - r.top) / r.height); return { x: r.left + u * r.width, y: r.top + (1 - v) * r.height }; }
function lensContentToClient(cx, cy) { const r = canvas.getBoundingClientRect(); if (!r.width || !LENS.k) return { x: cx, y: cy }; const [u, v] = lensToScreen((cx - r.left) / r.width, 1 - (cy - r.top) / r.height); return { x: r.left + u * r.width, y: r.top + (1 - v) * r.height }; }
const lensMat = new THREE.ShaderMaterial({
  uniforms: { tMap: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uEdge: { value: LENS.edge }, uY: { value: new THREE.Vector2() }, uSurf: { value: LENS.surf }, uRim: { value: LENS.rim }, uK: { value: 0 }, uKV: { value: 0 }, uWob: { value: 0 }, uSw: { value: 0 }, uCA: { value: .012 }, uTime: U.uTime, uPush: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) }, uPushD: { value: Array.from({ length: 6 }, () => new THREE.Vector2(0, 0)) } },
  depthTest: false, depthWrite: false, transparent: false, blending: THREE.NoBlending,
  vertexShader: 'void main(){ gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader: `uniform sampler2D tMap; uniform vec2 uRes; uniform vec4 uEdge; uniform vec2 uY; uniform vec4 uSurf; uniform vec4 uRim; uniform float uK,uKV,uWob,uSw,uCA,uTime; uniform vec4 uPush[6]; uniform vec2 uPushD[6];
    void main(){
      vec2 uv=gl_FragCoord.xy/uRes;
      float xl=uEdge.x+uEdge.y*uv.y, xr=uEdge.z+uEdge.w*uv.y, c=.5*(xl+xr), hw=.5*(xr-xl);
      float s=(uv.x-c)/hw, as=abs(s), band=(uY.y-uY.x)*.08+1e-6;
      float wy=clamp((uv.y-uY.x)/band,0.,1.)*clamp((uY.y-uv.y)/band,0.,1.);
      float inside=step(as,1.)*wy, k=uK*inside;
      float sp=s/(1.+k*(1.-s*s));
      float b2=(uY.y-uY.x)*.2+1e-6, wv=clamp((uv.y-uY.x)/b2,0.,1.)*clamp((uY.y-uv.y)/b2,0.,1.)*(1.-smoothstep(.78,1.,as))*step(as,1.);
      float vy=uv.y+(uv.y-.5*(uY.x+uY.y))*uKV*wv*s*s;
      vec2 e=(uv-uSurf.xy)/uSurf.zw; float er=dot(e,e);
      vec2 re=(uv-uRim.xy)/uRim.zw; float rl=length(re), rr=length(vec2(re.x*uRim.z,re.y*uRim.w))/max(rl,1e-4);   // distance to the glass rim (an ellipse on screen)
      float noRim=smoothstep(.012,.04,abs(rl-1.)*rr);   // no ripple on the rim itself: it is solid glass above the water
      vec2 wob=(1.-smoothstep(.5,1.,er))*noRim*uWob*inside*vec2(sin(uv.y*95.+uTime*1.8+uv.x*40.)+.6*sin(uv.y*53.-uTime*1.1),cos(uv.x*85.-uTime*1.5+uv.y*33.)+.6*cos(uv.x*47.+uTime*.9))*.0013;
      float asp=uRes.x/uRes.y; vec2 pw=vec2(0.);   // water pushed aside: an expanding swell that bends the view (xy centre, z radius, w strength)
      for(int i=0;i<6;i++){ vec4 P=uPush[i]; if(P.w>0.){ vec2 d=uv-P.xy; d.x*=asp; float r=length(d)+1e-5, wd=.01+.14*P.z, x=(r-P.z)/wd, x2=(r-.6*P.z)/(wd*1.3); float wv=-1.4*x*exp(-x*x)-.6*x2*exp(-x2*x2); vec2 n=d/r, B=uPushD[i]; float hasB=step(.01,dot(B,B)), ang=smoothstep(.05,.8,dot(n,B)), cw=mix(1.,.1+.9*ang,hasB); vec2 sw=vec2(-n.y,n.x)*(dot(vec2(-n.y,n.x),B)>0.?1.:-1.)*hasB; vec2 off=(n+.6*sw)*wv*P.w*cw; off.x/=asp; pw+=off; } }
      if(uSw>.001){ float h=(uv.y-uY.x)/(uY.y-uY.x), below=1.-smoothstep(.84,.9,h), core=1.-as*.55; wob.x+=uSw*inside*below*core*(.02*sin(h*7.+uTime*2.6)+.009*sin(h*19.-uTime*8.)); wob.y+=uSw*inside*below*core*.006*cos(h*15.-uTime*7.+s*3.); }   // the water column twists: it bends sideways higher up and ripples in a spiral, as if a whirl were turning inside
      wob+=pw*inside;
      float ca=uCA*as*as*inside;
      float rx=c+sp*(1.+ca)*hw, gx=c+sp*hw, bx=c+sp*(1.-ca)*hw;
      vec4 tg=texture2D(tMap,vec2(gx,vy)+wob);
      float r=texture2D(tMap,vec2(rx,vy)+wob).r, b=texture2D(tMap,vec2(bx,vy)+wob).b;
      gl_FragColor=vec4(r,tg.g,b,tg.a);
    }`
});
const lensScene = new THREE.Scene(), lensCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), lensQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lensMat);
lensQuad.frustumCulled = false; lensScene.add(lensQuad);
let lensTex = null; const lensSz = new THREE.Vector2(), lensO = new THREE.Vector2(0, 0);
const PBL = { A: null, B: null, w: 0, h: 0, cc: new THREE.Color(), lights: false, sz: new THREE.Vector2() };
const PBM = (frag, u) => new THREE.ShaderMaterial({ uniforms: u, depthTest: false, depthWrite: false, vertexShader: 'void main(){ gl_Position=vec4(position.xy,0.,1.); }', fragmentShader: frag });
PBL.blur = PBM(`uniform sampler2D tSrc; uniform vec2 uStep; uniform vec2 uRes; void main(){ vec2 uv=gl_FragCoord.xy/uRes; vec4 s=texture2D(tSrc,uv)*.2270270; for(int i=1;i<=4;i++){ float o=float(i); float w=i==1?.1945946:i==2?.1216216:i==3?.0540541:.0162162; s+=(texture2D(tSrc,uv+uStep*o*1.0)+texture2D(tSrc,uv-uStep*o*1.0))*w; } gl_FragColor=s; }`, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(1, 1) } });
PBL.blur.blending = THREE.NoBlending;
PBL.comp = PBM(`uniform sampler2D tSrc; uniform vec2 uRes; uniform float uA; void main(){ vec4 t=texture2D(tSrc,gl_FragCoord.xy/uRes); vec3 c=t.rgb/max(t.a,1e-4); c=mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(.0031308,c)); gl_FragColor=vec4(c*t.a*uA,t.a*uA); }`, { tSrc: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uA: { value: 1 } });
PBL.comp.transparent = true; PBL.comp.blending = THREE.CustomBlending; PBL.comp.blendEquation = THREE.AddEquation; PBL.comp.blendSrc = THREE.OneFactor; PBL.comp.blendDst = THREE.OneMinusSrcAlphaFactor; PBL.comp.blendSrcAlpha = THREE.OneFactor; PBL.comp.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
PBL.scene = new THREE.Scene(); PBL.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); PBL.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), PBL.blur); PBL.quad.frustumCulled = false; PBL.scene.add(PBL.quad);
function pipeCompOn() { return !!(tube.g && tube.g.visible && tube.fadeA != null && tube.fadeA < .985 && tube.fadeA > .02); }
function pipeComposite() {   /* the see-through pipe: its own picture (opaque, so it is one block), blurred, then laid over the finished frame with the fade as its opacity */
  renderer.getDrawingBufferSize(PBL.sz); const w = Math.max(16, PBL.sz.x >> 1), h = Math.max(16, PBL.sz.y >> 1);
  if (!PBL.A || PBL.w !== w || PBL.h !== h) { for (const k of ['A', 'B']) { if (PBL[k]) PBL[k].dispose(); PBL[k] = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: k === 'A' }); } PBL.w = w; PBL.h = h; }
  if (!PBL.lights) { PBL.lights = true; scene.traverse(o => { if (o.isLight) o.layers.enable(PIPE_L); }); tube.g.traverse(o => o.layers.enable(PIPE_L)); }
  const oa = renderer.getClearAlpha(), uk = PW.uK.value, ukv = PW.uKV.value; renderer.getClearColor(PBL.cc);
  PW.uK.value = 0; PW.uKV.value = 0; renderer.setRenderTarget(PBL.A); renderer.setClearColor(0x000000, 0); renderer.clear(); cam.layers.set(PIPE_L); renderer.render(scene, cam); cam.layers.set(0); PW.uK.value = uk; PW.uKV.value = ukv;
  const bs = .6 + 3.4 * tube.blurA, bl = PBL.blur.uniforms; bl.uRes.value.set(w, h); PBL.quad.material = PBL.blur;
  bl.tSrc.value = PBL.A.texture; bl.uStep.value.set(bs / w, 0); renderer.setRenderTarget(PBL.B); renderer.render(PBL.scene, PBL.cam);
  bl.tSrc.value = PBL.B.texture; bl.uStep.value.set(0, bs / h); renderer.setRenderTarget(PBL.A); renderer.render(PBL.scene, PBL.cam);
  renderer.setRenderTarget(null); renderer.setClearColor(PBL.cc, oa);
  const cu = PBL.comp.uniforms; cu.tSrc.value = PBL.A.texture; cu.uRes.value.copy(PBL.sz); cu.uA.value = tube.fadeA; PBL.quad.material = PBL.comp;
  const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(PBL.scene, PBL.cam); renderer.autoClear = ac;
}
function lensPost() {
  if (!LENS.k) return;
  renderer.getDrawingBufferSize(lensSz);
  if (!lensTex || lensTex.image.width !== lensSz.x || lensTex.image.height !== lensSz.y) { if (lensTex) lensTex.dispose(); lensTex = new THREE.FramebufferTexture(lensSz.x, lensSz.y); lensTex.minFilter = lensTex.magFilter = THREE.LinearFilter; lensMat.uniforms.tMap.value = lensTex; lensMat.uniforms.uRes.value.copy(lensSz); }
  const u = lensMat.uniforms; u.uK.value = LENS.k; u.uKV.value = LENS.k * LENS.KV / LENS.K; u.uWob.value = LENS.wob; u.uSw.value = LENS.sw; u.uCA.value = LENS.ca; u.uY.value.set(LENS.y0, LENS.y1);
  renderer.copyFramebufferToTexture(lensTex, lensO);
  const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(lensScene, lensCam); renderer.autoClear = ac;
}

/* ============================== main loop ============================== */
let last = performance.now(), time = 0;
const camRight = new THREE.Vector3();
// frame-rate meter: add ?fps=1 to the address to show it (average over ~0.5 s, plus the slowest frame in that time); window.__fps always holds the latest numbers
for (const f of ['arrow']) { const im = new Image(); im.src = new URL('ui/' + f + '.png', document.baseURI).href; im.decode && im.decode().catch(() => { }); }   // decode the cheer / pointer pictures now, so the first combo does not stall a frame
const FPS = { spike: null, js: 0, fps: 0, worst: 0, el: null, n: 0, t: 0, w: 0, low: 0, qT: 0, up: 0, failed: 99, u: 0, r: 0, calls: 0, tris: 0 };
renderer.info.autoReset = false;
// ?fps=1&prof=1 adds tap buttons that switch parts of the picture off, to see what each one costs (watch the fps number change)
const PROF = { off: {}, built: false, groups: {
  fish: n => n.isSkinnedMesh, water: n => n.isMesh && n.geometry.parameters && n.geometry.parameters.widthSegments === 60 && n.material.isShaderMaterial,
  rays: n => n.isMesh && n.material.isShaderMaterial && n.geometry.parameters && n.geometry.parameters.openEnded && n.geometry.parameters.radialSegments === 20,
  glass: n => n.isMesh && n.material.isShaderMaterial && n.geometry.parameters && n.geometry.parameters.openEnded && n.geometry.parameters.radialSegments === 72,
  decor: n => n.isMesh && !n.isSkinnedMesh && n.material.isMeshPhongMaterial, fx: n => n.isPoints || n.isSprite } };
function profApply() { for (const k in PROF.off) if (PROF.off[k]) scene.traverse(n => { if (PROF.groups[k](n)) n.visible = false; }); }
function profBuild() {
  PROF.built = true; const bar = document.createElement('div'); bar.style.cssText = 'position:fixed;left:6px;bottom:78px;z-index:99;display:flex;flex-wrap:wrap;gap:4px;max-width:92vw'; document.body.appendChild(bar);
  const canv = { ui: () => document.getElementById('phaser-hud'), ov: () => ov.canvas, bg: () => bgCanvas };
  for (const k of [...Object.keys(PROF.groups), ...Object.keys(canv)]) {
    const b = document.createElement('button'); b.style.cssText = 'font:700 12px ui-monospace,monospace;padding:5px 9px;border-radius:7px;border:1px solid #fff8;color:#fff;background:rgba(0,90,40,.8)'; b.textContent = k + ' on';
    b.addEventListener('pointerdown', e => e.stopPropagation()); b.addEventListener('click', e => { e.stopPropagation(); const off = !PROF.off[k]; PROF.off[k] = off; b.textContent = k + (off ? ' OFF' : ' on'); b.style.background = off ? 'rgba(150,20,20,.85)' : 'rgba(0,90,40,.8)';
      if (canv[k]) { const el = canv[k](); if (el) el.style.visibility = off ? 'hidden' : ''; if (k === 'ui' && window.__phaser) { if (off) window.__phaser.loop.sleep(); else window.__phaser.loop.wake(); } } else if (!off) scene.traverse(n => { if (PROF.groups[k](n)) n.visible = true; }); else profApply(); });
    bar.appendChild(b);
  }
}
function setQuality(l) { qLevel = l; renderer.setPixelRatio(prFor()); ov.renderer.setPixelRatio(prFor()); resize(); ovResize(); }
window.__fps = FPS;
// GPU time of the main 3D canvas (when the phone's browser allows timer queries): shown as "gpu" in the ?fps=1 meter
const GT = { ext: null, gl: null, q: null, pend: [], ms: -1 };
try { GT.gl = renderer.getContext(); GT.ext = GT.gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch (e) { }
function gpuBegin() { if (!GT.ext || GT.q) return; try { GT.q = GT.gl.createQuery(); GT.gl.beginQuery(GT.ext.TIME_ELAPSED_EXT, GT.q); } catch (e) { GT.ext = null; } }
function gpuEnd() {
  if (!GT.ext) return;
  if (GT.q) { try { GT.gl.endQuery(GT.ext.TIME_ELAPSED_EXT); GT.pend.push(GT.q); } catch (e) { GT.ext = null; } GT.q = null; }
  while (GT.pend.length) { const q = GT.pend[0], ok = GT.gl.getQueryParameter(q, GT.gl.QUERY_RESULT_AVAILABLE), bad = GT.gl.getParameter(GT.ext.GPU_DISJOINT_EXT); if (!ok && !bad) break; GT.pend.shift(); if (ok && !bad) { const ms = GT.gl.getQueryParameter(q, GT.gl.QUERY_RESULT) / 1e6; GT.ms = GT.ms < 0 ? ms : GT.ms + (ms - GT.ms) * .1; } GT.gl.deleteQuery(q); }
}
function fpsTick(raw) {
  if (raw > .045 && raw < 3) FPS.spike = { ms: raw * 1000, js: FPS.js, at: performance.now() };   // a frame that took over 45 ms: and how much of it was our JavaScript (the rest is the browser / GPU)
  if (!(raw > 0) || raw > 1) return; FPS.n++; FPS.t += raw; FPS.w = Math.max(FPS.w, raw);
  if (FPS.t >= .5) { FPS.fps = FPS.n / FPS.t; FPS.worst = FPS.w * 1000; FPS.n = 0; FPS.t = 0; FPS.w = 0;
    if (/[?&]prof=1/.test(location.search)) { if (!PROF.built) profBuild(); profApply(); }
    const nowT = performance.now(), hq = RES_OVR > 0 || /[?&]hq=1/.test(location.search); FPS.low = FPS.fps < 36 && !paused && nowT > 7000 ? FPS.low + 1 : 0; FPS.up = FPS.fps > 56 && !paused ? FPS.up + 1 : 0;
    if (!hq && FPS.low >= 5 && qLevel < QCAP.length - 1 && nowT - FPS.qT > 4000) { FPS.failed = Math.min(FPS.failed, qLevel); setQuality(qLevel + 1); FPS.low = 0; FPS.qT = nowT; }   // sustained low: step the resolution down (never below 1.5)
    else if (!hq && FPS.up >= 24 && qLevel > 0 && qLevel - 1 < FPS.failed && nowT - FPS.qT > 12000) { setQuality(qLevel - 1); FPS.up = 0; FPS.qT = nowT; }   // 12 s of a solid 60: try a sharper step again, but never one that already failed
    if (/[?&]fps=1/.test(location.search)) { if (!FPS.el) { FPS.el = document.createElement('div'); FPS.el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99;font:700 12px/1.3 ui-monospace,monospace;color:#fff;background:rgba(0,20,50,.65);padding:3px 7px;border-radius:6px;pointer-events:none'; document.body.appendChild(FPS.el); }
      FPS.el.innerHTML = FPS.fps.toFixed(0) + ' fps · worst ' + FPS.worst.toFixed(0) + ' ms · res ' + prFor().toFixed(2) + '<br>cpu: update ' + FPS.u.toFixed(1) + ' draw ' + FPS.r.toFixed(1) + ' ui ' + ((window.__hudMs || 0)).toFixed(1) + ' ms<br>calls ' + FPS.calls + ' · tris ' + (FPS.tris / 1000).toFixed(0) + 'k · gpu ' + (GT.ms >= 0 ? GT.ms.toFixed(1) + ' ms' : 'n/a') + (FPS.spike && performance.now() - FPS.spike.at < 6000 ? '<br>spike ' + FPS.spike.ms.toFixed(0) + ' ms (our js ' + FPS.spike.js.toFixed(1) + ')' : ''); FPS.el.style.color = FPS.fps >= 50 ? '#9dffb0' : FPS.fps >= 30 ? '#ffe27a' : '#ff8a80'; } }
}
let stillN = 0, lastCamKey = '';
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(.05, raw); last = now; fpsTick(raw); const tf0 = performance.now(); renderer.info.reset();
  if (!paused) { time += dt; U.uTime.value = time; }
  const dtp = paused ? 0 : dt; frameN++; fvTick(dt); if (frameN % 6 === 0) refreshClearBtn();   // the grey state of Clear Tank / Clear Backup follows the game all the time (it was only updated at a few moments, so it could stay grey while a tank needed fish)
  // inertia
  if (!ptrs.size) { orbit.az += orbit.azV * dtp; orbit.azV *= Math.exp(-dtp * 2.6); if (Math.abs(orbit.azV) < .01) orbit.azV = 0; orbit.el = clamp(orbit.el + orbit.elV * dtp, EL_MIN, EL_MAX); orbit.elV *= Math.exp(-dtp * 3.2); if (Math.abs(orbit.elV) < .01) orbit.elV = 0; }
  else if (performance.now() - lastMove > 90) { orbit.azV *= .8; orbit.elV *= .8; }
  if (camTween.on) { if (ptrs.size) camTween.on = false; else { camTween.t += dtp / .7; const k = Math.min(1, camTween.t), e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); orbit.az = camTween.az0 + (camTween.azT - camTween.az0) * e; orbit.el = camTween.el0 + (.3 - camTween.el0) * e; orbit.target.y += (PAN_Y0 - orbit.target.y) * Math.min(1, e); orbit.dist = camTween.d0 + (orbit.fit - camTween.d0) * e; if (k >= 1) camTween.on = false; } }
  if (camIntro || (G && G.win)) {   // opening shot and win: nothing of the hall may stand between the camera and the tank (a pillar or a wall piece next to the lens shows as a big white lump)
    const dc = cam.position.length();
    if (HBO.pillars) for (const p of HBO.pillars) p.visible = p.position.distanceTo(cam.position) > dc + .5;
    for (const m of hallProps) m.visible = m.position.distanceTo(cam.position) > dc + .5;
    if (HBO.shafts) for (const m of HBO.shafts) m.visible = false;
    const outside = dc > HALL_R - 1.5; if (HBO.frames) HBO.frames.forEach(m => { m.visible = !outside && m.visible; }); if (HBO.strips) HBO.strips.forEach(m => { m.visible = !outside && m.visible; });
  }
  { const far = orbit.dist > orbit.fit * 1.12; for (const m of (HBO.cones || [])) { if (m._v0 === undefined) m._v0 = m.visible; m.visible = far ? false : m._v0; } if (glowRing2) glowRing2.visible = !far; }   /* zoomed out beyond what the player can do, the spotlight cones and the floor ring of the hall flare up white: they are left out then */
  if (camIntro) {   // the opening shot: a fast turn round the tank, from far and a little above to the normal framing, easing out so it settles softly
    const u = Math.min(1, (performance.now() - camIntro.t0) / camIntro.dur), e = 1 - Math.pow(1 - u, 3); camTween.on = false; orbit.azV = 0; orbit.elV = 0;
    orbit.az = camIntro.az1 + (1 - e) * camIntro.turns * Math.PI * 2; orbit.dist = orbit.fit * (1 + (camIntro.far - 1) * (1 - e)); orbit.el = clamp(camIntro.el0 + (.3 - camIntro.el0) * e, EL_MIN, EL_MAX); orbit.target.y += (PAN_Y0 - orbit.target.y) * Math.min(1, dtp * 6);
    if (u >= 1) { camIntro = null; orbit.az = .65; orbit.dist = orbit.fit; orbit.el = .3; }
  }
  { const mv = camDrag || performance.now() - camAct < 110 || !!panHold; window.__toolA = window.__toolA ?? 1; window.__toolA += ((mv ? 0 : 1) - window.__toolA) * (1 - Math.exp(-dtp * (mv ? 14 : 16))); const bkBusy = ov.flights.some(f => f.mode === 'backup'); window.__bkA = window.__bkA ?? 1; window.__bkA += ((bkBusy ? 1 : window.__toolA) - window.__bkA) * (1 - Math.exp(-dtp * 14)); }   // the Backup tank fades with the boosters, but stays while a fish is still flying into it   // fade out quickly while the camera moves, and straight back when the finger lifts
  if (panHold) orbit.target.y -= panHold * 1.7 * dtp; panBtns.classList.toggle('show', orbit.dist < orbit.fit * .96);
  applyCam();
  // slosh spring driven by rotation
  camRight.setFromMatrixColumn(cam.matrixWorld, 0);
  const k = 38, c = 3.2; sloshV.x += (-orbit.azV * camRight.x * .05 - k * sloshS.x - c * sloshV.x) * dtp; sloshV.y += (-orbit.azV * camRight.z * .05 - k * sloshS.y - c * sloshV.y) * dtp;
  sloshS.x += sloshV.x * dtp; sloshS.y += sloshV.y * dtp; sloshS.x = clamp(sloshS.x, -.22, .22); sloshS.y = clamp(sloshS.y, -.22, .22);
  // tank squash spring
  squash.v += (-60 * squash.s - 7 * squash.v) * dtp; squash.s += squash.v * dtp * .02 * 8;
  const s = clamp(squash.s, -.08, .08); tank.scale.set(1 - s * .6, 1 + s, 1 - s * .6);
  if (glowRing) glowRing.material.opacity = .55 + .35 * Math.sin(time * 2);
  sun.intensity = 2.1 + Math.sin(time * 1.3) * .25;
  if (G) { G.need = needSet(); for (const o of G.things) updateThing(o, dtp, time); G.things = G.things.filter(o => !o.gone); }
  updateShocks(dtp); inkUpdate(dtp); feedUpdate(dtp); if (G && G.status === 'play' && !paused && (G.pullT = (G.pullT || 0) + dtp) > .6) { G.pullT = 0; G.targets.forEach((t, ti) => { if (t && !t.done && G.backup.some(it => !it.junk && it.landed && it.res && it.type === t.type)) pullFromBackup(ti); }); }   // safety net: a needed fish never stays stuck in Backup
  startleUpdate(dtp); evUpdate(dtp); swarmUpdate(dtp); tubeUpdate(dtp); guideUpdate(); themeUpdate(dtp, time); dropFx.update(dtp); hallUpdate(dtp, time); ovUpdate(paused ? 0 : Math.min(.12, raw), time); updateHint(); bubbles.update(dtp, time); glitter.update(dtp, time); burstFx.update(dtp); wakeFx.update(dtp); ringFx.update(dtp);
  const tf1 = performance.now(); const camKey = cam.position.x.toFixed(3) + cam.position.y.toFixed(3) + cam.position.z.toFixed(3) + orbit.target.y.toFixed(3); stillN = paused && camKey === lastCamKey ? stillN + 1 : 0; lastCamKey = camKey;
  if (stillN > 3 && !PROF.built) { FPS.js = performance.now() - tf0; return; }   // a menu or popup is open and the world is frozen: keep showing the last picture instead of drawing the same 3D again
  const pc = pipeCompOn(); if (pc) tube.g.visible = false;
  lensUpdate(); cam.layers.set(1); if (!PROF.off.bg) bgR.render(scene, cam); cam.layers.set(0); gpuBegin(); renderer.render(scene, cam); lensPost();
  // glass, rims, stand and plinth are not under water: drawn on top of the refracted picture, depth-tested against what is inside
  cam.layers.set(SHELL_LAYER); { const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(scene, cam); renderer.autoClear = ac; } cam.layers.set(0); if (pc) { tube.g.visible = true; pipeComposite(); } gpuEnd();
  const tf2 = performance.now(); FPS.u += (tf1 - tf0 - FPS.u) * .1; FPS.r += (tf2 - tf1 - FPS.r) * .1; FPS.js = tf2 - tf0 + (window.__hudLast || 0); FPS.calls = renderer.info.render.calls; FPS.tris = renderer.info.render.triangles;   // CPU time spent updating / submitting the 3D draw (the GPU's own time is not visible here)
}

/* ============================== boot ============================== */
const LOADER = (() => {   // the loading screen: the bar follows the real loading steps (smoothly), a real 3D fish of the game swims along its head, and the game starts only when the bar is full
  const el = document.getElementById('load'), need = el && ['.fl', '.bar', 'canvas.lg', '#lgsrc'].every(q => el.querySelector(q)); if (!need) { if (el) el.remove(); return { step() {}, fish() {}, done: () => Promise.resolve() }; }   // a page whose markup is older than this script (the dev server reloads between an edit and the rebuild of index.html) simply has no loading screen
  let bf = el.querySelector('.bfish'); const fl = el.querySelector('.fl'), bar = el.querySelector('.bar'); let tgt = 0, v = 0, t0 = performance.now(), fin = null, fr = null, tl = performance.now();
  const lg = el.querySelector('canvas.lg'), lgc = lg.getContext('2d'), lsrc = document.getElementById('lgsrc');
  const tx = el.querySelector('.tx'); let tcv = null, tcx = null, bcv = null, bcx = null, bDots = -1, bW = 0, bH = 0;
  const paintBase = (dots, W, H, dpr) => {   /* the words are drawn to a canvas (so the lens can bend the pixels); the dots count up as before */
    if (!tx) return false; const cs = getComputedStyle(tx);
    if (!tcv) { tx.textContent = ''; tcv = document.createElement('canvas'); tcv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; tx.appendChild(tcv); tcx = tcv.getContext('2d', { willReadFrequently: true }); bcv = document.createElement('canvas'); bcx = bcv.getContext('2d'); }
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (bW !== pw || bH !== ph) { bW = pw; bH = ph; tcv.width = bcv.width = pw; tcv.height = bcv.height = ph; bDots = -1; }
    if (bDots !== dots) { bDots = dots; const fs = parseFloat(cs.fontSize) * dpr; bcx.clearRect(0, 0, pw, ph); bcx.font = (cs.fontWeight || '400') + ' ' + fs + 'px ' + cs.fontFamily; bcx.textBaseline = 'middle'; bcx.textAlign = 'left'; bcx.lineJoin = 'round'; if ('letterSpacing' in bcx) bcx.letterSpacing = dpr + 'px';
      const full = bcx.measureText('Finding fish...').width, x0 = (pw - full) / 2, y0 = ph / 2 + fs * .04, str = 'Finding fish' + '.'.repeat(dots);
      bcx.strokeStyle = '#0b2f6a'; bcx.lineWidth = Math.max(2.6, fs / dpr * .15) * dpr; bcx.strokeText(str, x0, y0 + 1.5 * dpr); bcx.fillStyle = '#0b2f6a'; bcx.fillText(str, x0, y0 + 1.5 * dpr); bcx.strokeText(str, x0, y0); bcx.fillStyle = '#fff'; bcx.fillText(str, x0, y0); }
    return true;
  };
  const magnify = (headX, size, W, H, t) => {   /* the glass of the icon is a convex lens: inside it the words swell towards the middle and bend at its edge, and they grow and shrink smoothly as the lens slides over them */
    const dpr = Math.min(3, window.devicePixelRatio || 1); if (!paintBase(Math.floor(t * 3) % 4, W, H, dpr) || !size) return;
    tcx.clearRect(0, 0, bW, bH); tcx.drawImage(bcv, 0, 0);
    const cx = headX * dpr, cy = H / 2 * dpr, R = .225 * size * dpr, M = 2.7, x1 = Math.max(0, Math.floor(cx - R)), x2 = Math.min(bW, Math.ceil(cx + R)), y1 = Math.max(0, Math.floor(cy - R)), y2 = Math.min(bH, Math.ceil(cy + R));
    const rw = x2 - x1, rh = y2 - y1; if (rw < 2 || rh < 2) return;
    const src = tcx.getImageData(x1, y1, rw, rh), sd = src.data, out = tcx.createImageData(rw, rh), od = out.data;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const dx = x1 + x - cx, dy = y1 + y - cy, r2 = (dx * dx + dy * dy) / (R * R), f = r2 >= 1 ? 1 : 1 / M + (1 - 1 / M) * r2 * r2, sx = cx + dx * f - x1, sy = cy + dy * f - y1, fx = Math.floor(sx), fy = Math.floor(sy), ax = sx - fx, ay = sy - fy; let ra = 0, ga = 0, ba = 0, aa = 0;
      for (let q = 0; q < 4; q++) { const px = fx + (q & 1), py = fy + (q >> 1); if (px < 0 || py < 0 || px >= rw || py >= rh) continue; const wgt = ((q & 1) ? ax : 1 - ax) * ((q >> 1) ? ay : 1 - ay), k = (py * rw + px) * 4, a = sd[k + 3] * wgt; ra += sd[k] * a; ga += sd[k + 1] * a; ba += sd[k + 2] * a; aa += a; }
      const o = (y * rw + x) * 4; if (aa > 0) { od[o] = ra / aa; od[o + 1] = ga / aa; od[o + 2] = ba / aa; od[o + 3] = aa; }
    }
    tcx.putImageData(out, x1, y1);
  };
  const waveLogo = t => {   // the logo is drawn in thin vertical slices, each lifted by a travelling wave, so the whole word ripples like water (the same wave as the cheer words)
    if (!lsrc.complete || !lsrc.naturalWidth) return; const W = lg.width, H = lg.height, sc = Math.min(W / lsrc.naturalWidth, (H - 70) / lsrc.naturalHeight), iw = lsrc.naturalWidth * sc, ih = lsrc.naturalHeight * sc, x0 = (W - iw) / 2, y0 = (H - ih) / 2, SL = 6;
    lgc.clearRect(0, 0, W, H); for (let x = 0; x < iw; x += SL) { const u = x / iw, dy = Math.sin(u * 6 - t * 3) * 4.5 * (.6 + .4 * Math.sin(u * 3)), tilt = (u - .5) * -4; lgc.drawImage(lsrc, x / sc, 0, SL / sc + .5, lsrc.naturalHeight, x0 + x, y0 + dy + tilt, SL + .6, ih); }

    { const cyc = (t % 3.8) / 3.8, bx = x0 + (cyc * 1.5 - .25) * iw, bw = iw * .13;   // a soft band of light sweeps across the letters now and then (only where the logo is: source-atop)
      lgc.save(); lgc.globalCompositeOperation = 'source-atop'; const gr = lgc.createLinearGradient(bx - bw, y0, bx + bw, y0 + ih * .35); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,' + (.42 * Math.sin(Math.min(1, cyc * 1.25) * Math.PI)).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); lgc.fillStyle = gr; lgc.fillRect(0, 0, W, H); lgc.restore(); }

  };
  const BUB = Array.from({ length: 6 }, () => { const d = document.createElement('div'); d.className = 'bb'; el.insertBefore(d, lg); const life = 6 + Math.random() * 8; return { d, t: Math.random() * life * .9, life, x: 6 + Math.random() * 88, y0: 8 + Math.random() * 26, rise: 240 + Math.random() * 520, sz: 22 + Math.random() * 40, ph: Math.random() * 6.28 }; });
  const stepBub = dt => {   // soap bubbles that wobble like jelly while they climb (the same squash and stretch as the level bubble), then pop
    const H = el.clientHeight, Wd = el.clientWidth;
    for (const b of BUB) { b.t += dt; if (b.t < 0) { b.d.style.opacity = 0; continue; } if (b.t > b.life) { b.t = 0; b.life = 6 + Math.random() * 8; b.x = 6 + Math.random() * 88; b.rise = 240 + Math.random() * 520; b.sz = 22 + Math.random() * 40; b.y0 = 8 + Math.random() * 26; }
      const u = b.t / b.life, rise = u * b.rise, popT = clamp((u - .9) / .1, 0, 1), jx = Math.sin(b.t * 4.2 + b.ph), jy = Math.sin(b.t * 4.2 + b.ph + 1.6), sx = 1 + .16 * jx + .5 * popT * popT, sy = 1 - .16 * jx + .12 * jy + .5 * popT * popT, rot = Math.sin(b.t * 1.7 + b.ph) * 14;
      b.d.style.width = b.d.style.height = b.sz + 'px'; b.d.style.left = (b.x / 100 * Wd + Math.sin(b.t * 1.3 + b.ph) * 18) + 'px'; b.d.style.top = (H - H * b.y0 / 100 - rise) + 'px';
      b.d.style.transform = `translate(-50%,-50%) rotate(${rot}deg) scale(${sx},${sy})`; b.d.style.opacity = (Math.min(1, u * 8) * (1 - popT) * .5).toFixed(3); }
  };
  const tick0 = now => {
    stepBub(Math.min(.05, (now - tl) / 1000)); waveLogo((now - t0) / 1000);
    const dt = Math.min(.05, (now - tl) / 1000); tl = now; v += (tgt - v) * .07; if (tgt >= 1 && v > .995) v = 1; const w = bar.clientWidth * .94 * v; fl.style.width = w + 'px'; if (bf) { if (fr) { bf.remove(); bf = null; } else bf.style.left = (bar.clientWidth * .03 + w) + 'px'; }   // until the 3D fish is ready a picture of the same fish already sits at the head of the bar
    if (bf) magnify(bar.clientWidth * .03 + w, bf.offsetHeight, bar.clientWidth, bar.clientHeight, now / 1000); else if (tcv && !bf) magnify(-9999, 1, bar.clientWidth, bar.clientHeight, now / 1000);
    if (fr) { const t = (now - t0) / 1000, br = bar.getBoundingClientRect(), er = el.getBoundingClientRect(), hx = br.left - er.left + bar.clientWidth * .03 + w, hy = br.top - er.top + br.height / 2, sw = (f, x, y, dir, ph, sp) => { f.hold.position.set(x, fr.H - y, 0); f.hold.rotation.y = dir > 0 ? 0 : Math.PI; f.b.group.position.y = f.y0 + Math.sin(t * 1.8 + ph) * 1.5 / f.k; f.b.tail.rotation.y = Math.sin(t * 7 * sp + ph) * .55; f.b.body.rotation.y = Math.sin(t * 7 * sp + ph + 1.2) * .08; if (f.b.update) f.b.update(dt * (.55 + sp * .5)); };
      { const wv = t * 4.2, amp = Math.max(2, bar.clientHeight * .09); sw(fr.main, hx, hy - Math.sin(wv) * amp, 1, 0, 1.4); fr.main.hold.rotation.z = Math.cos(wv) * .16; } for (const f of fr.swim) { f.x += f.dir * f.sp * dt; if (f.x > fr.W + 80) f.dir = -1; if (f.x < -80) f.dir = 1; sw(f, f.x, fr.H * f.yf + Math.sin(t * .6 + f.ph) * 10, f.dir, f.ph, 1.0); } fr.r.render(fr.sc, fr.cam); }
    if (v >= 1 && fin) { clearInterval(iv); fin(); }
  };
  const tick = now => { const _a = performance.now(); try { tick0(now); } catch (e) { if (!tick.warned) { tick.warned = true; console.warn('loading screen', e); } if (tgt >= 1 && fin) { clearInterval(iv); fin(); } } const _d = performance.now() - _a; window.__tk = window.__tk || { n: 0, sum: 0, max: 0 }; window.__tk.n++; window.__tk.sum += _d; window.__tk.max = Math.max(window.__tk.max, _d); };   // one broken piece of decoration must never keep the screen up: the bar and the exit still run
  const iv = setInterval(() => tick(performance.now()), 33);   // a timer, not requestAnimationFrame: the screen must finish even if the page is in the background or frames are throttled
  return {
    step(x) { tgt = Math.max(tgt, x); },
    fish() { },   /* no fish on the loading bar any more: the head of the bar is an icon */
    done() { tgt = 1; setTimeout(() => { if (fin) { v = 1; clearInterval(iv); fin(); } }, 9000); return new Promise(res => { let once = false; fin = () => { if (once) return; once = true; const wait = Math.max(0, 1500 - (performance.now() - t0)); setTimeout(() => { el.classList.add('pop'); setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); }, 600); res(); }, 380); }, wait); }; }); }
  };
})();
const LS = x => v => { (window.__steps = window.__steps || []).push([x, Math.round(performance.now())]); LOADER.step(x); return v; };
(function prefetchAll() {   // files are asked for in the order the loaders need them, only a few at a time, so the first ones finish first (asking for everything at once shares the bandwidth and makes all of them finish last)
  const base = document.baseURI, q = [];
  let active = 0;
  const pump = () => { while (active < 6 && q.length) { const u = q.shift(); active++; fetch(new URL(u, base)).then(r => r.arrayBuffer()).catch(() => { }).then(() => { active--; pump(); }); } };
  const get = u => { q.push(u); pump(); };
  ['target_back', 'target_front', 'backup_back', 'backup_front', 'bubble_orb', 'bubble'].forEach(n => get('ui/tanks/' + n + '.png'));
})();
const SAFE = f => v => Promise.resolve().then(() => f(v)).catch(e => { console.warn('loading step failed', e); });   // a step that fails or hangs must not freeze the loading screen
const CAP = (f, ms) => v => Promise.race([SAFE(f)(v), new Promise(r => setTimeout(r, ms))]);
CAP(() => loadFish((levelConfig(Math.min(save.last || 1, save.unlocked)).fishKeys || []).map(kk => kk.replace(/^fish_/, ''))), 25000)().then(LS(.2)).then(v => { LOADER.fish(); return v; }).then(LS(.5)).then(v => new Promise(r => setTimeout(() => r(v), 30))).then(CAP(prepModelArt, 15000)).then(LS(.65)).then(v => new Promise(r => setTimeout(() => r(v), 30))).then(LS(.85)).then(CAP(loadTankArt, 15000)).then(LS(.9)).then(() => new Promise(r => setTimeout(r, 30))).then(() => { fitDecor(); LOADER.step(.95); }).then(() => new Promise(r => setTimeout(r, 30))).then(() => { makeThumbs(); LOADER.step(.99); }).then(() => LOADER.done()).then(() => { document.querySelectorAll('.fishy[data-ic=fish]').forEach(e => { e.innerHTML = `<img src="${THUMB[SPECIES[0].id]}" style="height:54px">`; }); resize(); newLevel(Math.min(save.last || 1, save.unlocked)); requestAnimationFrame(frame);  if (PLAYTEST) parent.postMessage({ type: 'ff-ready' }, '*'); });

// level editor Play button: the editor posts { type: 'ff-play', level, seed }
function hashSeed(v) { let h = 2166136261; for (const ch of String(v)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
if (PLAYTEST) addEventListener('message', e => {
  const d = e.data; if (!d || d.type !== 'ff-play' || !d.level) return;
  PLAY_OVERRIDE = d.level; const useSeed = d.seed != null && String(d.seed).trim() !== '', lv = clamp(Math.round(d.level.refLevel) || 8, 1, MAX_LV);
  // warm-up run: colour-variant caches are filled on first use and would change how many random numbers the first run consumes
  if (useSeed) { Math.random = seeded(hashSeed(d.seed)); newLevel(lv); }
  Math.random = useSeed ? seeded(hashSeed(d.seed)) : ORIG_RANDOM; newLevel(lv);
});
window.__qa = {   /* automatic checks (see docs/qa.md): each returns a report with pass/fail numbers, so nobody has to look for these defects by eye */
  async octRelease() {   /* the octopus tapped into the Backup and released back into the tank: size must change smoothly and one way, no jump in angle, nothing outside the glass */
    const wait = ms => new Promise(r => setTimeout(r, ms)), rep = { name: 'octRelease', frames: 0, fails: [] };
    const o0 = G.things.find(x => x.id === 'squid' && x.alive); if (!o0) { rep.fails.push('no octopus in this level'); return rep; }
    pickThing(o0); await wait(4200); if (G.backup.some(it => !it.filler && !it.landed)) await wait(2000); $('bClear').click(); rep.backupBefore = G.backup.length;
    const S = [], t0 = performance.now(); let last = 0;
    while (performance.now() - t0 < 4500) { await new Promise(r => requestAnimationFrame(r)); const fl = ov.flights.find(f => f.sp.built.oct), th = G.things.find(x => x.id === 'squid' && x.alive), row = { t: performance.now() - t0 };
      if (fl) { rep.lastSp = fl.sp; row.sz = fl.sp.holder.scale.x * fl.sp.dim; row.rz = fl.sp.holder.rotation.z; row.y = fl.sp.holder.position.y; row.cx = fl.sp.holder.position.x + ov.W / 2; row.cy = ov.H / 2 - fl.sp.holder.position.y; }
      if (th && !fl) { th.group.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(th.parts.root); let out = -9; for (let i = 0; i < 8; i++) { const x = i & 1 ? bx.max.x : bx.min.x, y = i & 2 ? bx.max.y : bx.min.y, z = i & 4 ? bx.max.z : bx.min.z; if (y < TANK_H) out = Math.max(out, Math.hypot(x, z) - wallAt(x, z, y)); } row.out = th.dive ? out : -9;   /* (only while it falls in: the box of a swimming octopus is bigger than the octopus) */ { const pts = []; for (let i = 0; i < 8; i++) pts.push(projectToClient(new THREE.Vector3(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z))); const xs = pts.map(q => q.x), ys = pts.map(q => q.y); row.cx = (Math.min(...xs) + Math.max(...xs)) / 2; row.cy = (Math.min(...ys) + Math.max(...ys)) / 2; row.top = Math.min(...ys); row.bot = Math.max(...ys); row.h = row.bot - row.top; const tr = $('backup').getBoundingClientRect(); row.hid = Math.max(0, Math.min(row.bot, tr.bottom) - Math.max(row.top, tr.top)) / Math.max(1, row.h); } row.py = th.pos.y; row.px = th.pos.x; row.pz = th.pos.z; row.t2 = performance.now(); row.dive = !!th.dive; row.scl = th.group.scale.x; }
      S.push(row); rep.frames++; }
    const fs = S.filter(r => r.sz !== undefined).slice(8);   /* (the first 8 frames are the crouch: a squash, not a size change) */ let maxJ = 0, maxR = 0, grew = 0, shrank = 0; for (let i = 1; i < fs.length; i++) { const j = Math.abs(fs[i].sz / fs[i - 1].sz - 1); if (j > maxJ) maxJ = j; const d = Math.abs(fs[i].rz - fs[i - 1].rz); if (d > maxR) maxR = d; if (fs[i].sz > fs[i - 1].sz * 1.002) grew++; if (fs[i].sz < fs[i - 1].sz * .998) shrank++; }
    const th3 = S.filter(r => r.out !== undefined && r.scl > .5), maxOut = th3.length ? Math.max(...th3.map(r => r.out)) : null, sc3 = th3.map(r => r.scl); let sJump = 0; for (let i = 1; i < sc3.length; i++) sJump = Math.max(sJump, Math.abs(sc3[i] / sc3[i - 1] - 1));
    let pause = 0; for (let i = 1; i < th3.length; i++) { const a0 = th3[i - 1], b0 = th3[i]; if (b0.dive && b0.py > WATER_Y && a0.dive) { const v = (a0.py - b0.py) / Math.max(1e-3, (b0.t2 - a0.t2) / 1000); if (v < .4) pause++; } }
    const spLast = rep.lastSp ? Math.hypot(rep.lastSp.lastVx || 0, rep.lastSp.lastVy || 0) : null; delete rep.lastSp; const spd = (rs, k0, k1) => { const a0 = rs[k0], b0 = rs[k1]; return a0 && b0 && b0.t !== a0.t ? Math.hypot(b0.cx - a0.cx, b0.cy - a0.cy) / ((b0.t - a0.t) / 1000) : null; }; const sBefore = spLast, t3 = th3.filter(r => r.cx !== undefined && r.scl > .9), sAfter = spd(t3.map(r => ({ ...r, t: r.t2 })), 1, Math.min(5, t3.length - 1));
    let maxAcc = 0, vPrev = null; for (let i = 3; i < th3.length; i++) { const a0 = th3[i - 3], b0 = th3[i], dtm = Math.max(1e-3, (b0.t2 - a0.t2) / 1000);   /* (speed over 3 frames: one late frame of the browser must not look like a jerk) */ if (a0.px === undefined || b0.px === undefined) continue; const v = Math.hypot(b0.px - a0.px, b0.py - a0.py, b0.pz - a0.pz) / dtm; if (vPrev !== null && b0.scl > .9 && a0.scl > .9 && i > 5) maxAcc = Math.max(maxAcc, Math.abs(v - vPrev)); vPrev = v; }
    const lastF = fs[fs.length - 1], first3 = th3.find(r => r.scl > .9) || th3[0], hidMax = th3.length ? Math.max(...th3.map(r => r.hid || 0)) : 0, gap = lastF && first3 ? Math.hypot(lastF.cx - first3.cx, lastF.cy - first3.cy) : null, up = th3.length ? Math.max(0, ...th3.map((r, i) => i && th3[i - 1].cy !== undefined ? th3[i - 1].cy - r.cy : 0)) : 0;
    { const li = S.reduce((q, r, i) => r.sz !== undefined ? i : q, -1); rep.handoffRows = S.slice(Math.max(0, li - 2), li + 9).map(r => r.sz !== undefined ? 'S t=' + Math.round(r.t) + ' c=(' + Math.round(r.cx) + ',' + Math.round(r.cy) + ') size=' + Math.round(r.sz) : '3D t=' + Math.round(r.t) + (r.cx !== undefined ? ' c=(' + Math.round(r.cx) + ',' + Math.round(r.cy) + ') h=' + Math.round(r.h) : '') + ' scl=' + (r.scl || 0).toFixed(2)); }
    Object.assign(rep, { maxSpeedStepWorld: +maxAcc.toFixed(2), speedBeforePx: sBefore && Math.round(sBefore), speedAfterPx: sAfter && Math.round(sAfter), airPauseFrames: pause, handoffGapPx: gap === null ? null : Math.round(gap), hiddenByTray: +hidMax.toFixed(2), maxUpStepPx: Math.round(up), flightFrames: fs.length, sizeFrom: fs[0] && Math.round(fs[0].sz), sizeTo: fs.length && Math.round(fs[fs.length - 1].sz), maxSizeStep: +maxJ.toFixed(3), maxAngleStep: +maxR.toFixed(3), grewFrames: grew, shrankFrames: shrank, maxOutsideGlass: maxOut === null ? null : +maxOut.toFixed(3), tankScaleStep: +sJump.toFixed(3) });
    if (!th3.length) rep.fails.push('the 3D octopus was never seen after the release: the run is not valid (the Backup did not release it)'); if (!fs.length) rep.fails.push('no flight seen'); else if (fs[0].sz < 20 || Math.max(...fs.map(r => r.sz)) < 40) rep.fails.push('flight not real (size ' + Math.round(fs[0].sz) + ' px): a popup or a pause is probably in the way'); if (paused || introOn) rep.fails.push('game paused / intro open: the run is not valid'); if (maxJ > .12) rep.fails.push('size jumps by ' + (maxJ * 100).toFixed(0) + '% in one frame'); if (maxR > .35) rep.fails.push('angle jumps ' + maxR.toFixed(2) + ' rad in one frame'); if (grew > 2 && shrank > 2) rep.fails.push('size goes both up and down (shrinks ' + shrank + ' frames)'); if (maxOut !== null && maxOut > .02) rep.fails.push('octopus pokes ' + maxOut.toFixed(2) + ' outside the glass'); if (gap !== null && gap > 6 + 1.6 * (fs.length > 1 && fs[fs.length - 1].cx !== undefined ? Math.hypot(fs[fs.length - 1].cx - fs[fs.length - 2].cx, fs[fs.length - 1].cy - fs[fs.length - 2].cy) : 8)) rep.fails.push('hand-off: the flying picture ends ' + Math.round(gap) + ' px from where the 3D octopus appears (it vanishes and re-appears elsewhere)'); if (sBefore && sAfter && (sAfter < sBefore * .65 || sAfter > sBefore * 1.5)) rep.fails.push('speed is not continuous at the hand-off: ' + Math.round(sBefore) + ' px/s before, ' + Math.round(sAfter) + ' px/s after'); if (maxAcc > 3.5) rep.fails.push('the 3D speed changes by ' + maxAcc.toFixed(1) + ' units/s between two frames (a jerk: a stop or a jump)'); if (pause > 4) rep.fails.push('the octopus hangs in the air for ' + pause + ' frames before going down'); if (hidMax > .1) rep.fails.push(Math.round(hidMax * 100) + '% of the octopus is hidden behind the Backup tray'); if (up > 25) rep.fails.push('the 3D octopus jumps UP ' + Math.round(up) + ' px in one frame'); if (sJump > .12) rep.fails.push('3D scale jumps ' + (sJump * 100).toFixed(0) + '%');
    rep.pass = !rep.fails.length; return rep;
  },
  async fishRelease() {   /* a fish tapped into the Backup and released: smooth fall, braking at the water without a stop, no jump in speed */
    const wait = ms => new Promise(r => setTimeout(r, ms)), rep = { name: 'fishRelease', fails: [] }, ids = new Set(G.things.filter(x => x.kind === 'fish').map(x => x.group));
    let n = 0; for (const o of G.things.slice()) { if (n >= 2) break; if (o.kind === 'fish' && o.alive && !o.big && !(G.need && G.need.has(o.type))) { pickThing(o); n++; } } await wait(4500); $('bClear').click();
    const t0 = performance.now(), tr = new Map(); while (performance.now() - t0 < 3500) { await new Promise(r => requestAnimationFrame(r)); const t = performance.now(); for (const o of G.things) if (o.kind === 'fish' && o.alive && !ids.has(o.group)) { const a = tr.get(o) || []; a.push({ t, x: o.pos.x, y: o.pos.y, z: o.pos.z, dive: !!o.dive }); tr.set(o, a); } }
    let worst = 0, stopFrames = 0, n3 = 0; for (const [, a] of tr) { n3++; let prev = null, seenFast = false; for (let i = 3; i < a.length; i++) { const dt = (a[i].t - a[i - 3].t) / 1000; if (dt < .03) continue; const v = Math.hypot(a[i].x - a[i - 3].x, a[i].y - a[i - 3].y, a[i].z - a[i - 3].z) / dt;   /* over 3 frames: a single late frame of the browser is not a jerk */ if (v > 2.5) seenFast = true; if (prev !== null && i > 6 && Math.abs(v - prev) > worst) { worst = Math.abs(v - prev); rep.at = { i, of: a.length, v: +v.toFixed(2), prev: +prev.toFixed(2), y: +a[i].y.toFixed(2), dive: a[i].dive, around: a.slice(Math.max(1, i - 4), i + 3).map((q, k, arr) => k ? +(Math.hypot(q.x - arr[k - 1].x, q.y - arr[k - 1].y, q.z - arr[k - 1].z) / ((q.t - arr[k - 1].t) / 1000)).toFixed(1) : 0) }; } if (seenFast && v < .25 && a[i].dive) stopFrames++; prev = v; } }
    Object.assign(rep, { fishSeen: n3, maxSpeedStep: +worst.toFixed(2), stopFramesDuringDive: stopFrames }); if (!n3) rep.fails.push('no fish released: the run is not valid'); if (worst > 3.5) rep.fails.push('speed jumps by ' + worst.toFixed(1) + ' units/s between two frames'); if (stopFrames > 3) rep.fails.push('stops for ' + stopFrames + ' frames while still diving'); rep.pass = !rep.fails.length; return rep;
  },
  async fishClip(sec = 20) {   /* fish bodies (middle, nose, tail) must never be inside a solid decoration */
    const wait = ms => new Promise(r => setTimeout(r, ms)), rep = { name: 'fishClip', samples: 0, inSolid: 0, fails: [] }, t0 = performance.now(); while (performance.now() - t0 < sec * 1000) { await wait(250); const r = window.__ff.clipTest(); rep.samples += r.n; rep.inSolid += r.solid; } if (rep.inSolid) rep.fails.push(rep.inSolid + ' fish samples inside solid decor'); rep.pass = !rep.fails.length; return rep;
  }
};
window.__ff = { G, newLevel, orbit, uiReady, guide, lvTitle: () => CHEER.lv && { gy: +CHEER.lv.g.position.y.toFixed(1), meshY: +CHEER.lv.mesh.position.y.toFixed(1), h: +CHEER.lv.mesh.geometry.parameters.height.toFixed(1), tier: window.__lvTier | 0, screenY: +(ov.H / 2 - CHEER.lv.g.position.y).toFixed(1) }, why: () => ({ paused, introOn, tutI, camIntro: !!camIntro, lvShown: window.__lvShown, lid: (window.__lid || []).map(v => +v.toFixed(2)), hud: performance.now() - (window.__hudInT0 || 0), status: G.status, tgtAlive: !!(guide.tgt && guide.tgt.alive), locked: !!(guide.tgt && guide.tgt.locked) }), clam: { loadClam, buildClam, CLAM }, ovScene: () => { const out = []; ov.scene.traverse(m => { if (m.isMesh && m.visible) { let go = 0, q = m.parent; const chain = []; while (q && q !== ov.scene) { chain.push(q.renderOrder); q = q.parent; } out.push((m.isSkinnedMesh ? 'S' : 'm') + ' ro=' + m.renderOrder + ' chain=[' + chain.join(',') + '] tr=' + (m.material && m.material.transparent) + ' dw=' + (m.material && m.material.depthWrite) + ' dt=' + (m.material && m.material.depthTest) + ' z=' + +m.getWorldPosition(new THREE.Vector3()).z.toFixed(0) + ' ' + (m.material && m.material.type)); } }); return out; }, ovInfo: () => [...ov.sprites].map(sp => { const r = []; sp.holder.traverse(m => { if (m.isMesh) r.push((m.isSkinnedMesh ? 'S' : 'm') + ' ro=' + m.renderOrder + ' tr=' + (m.material && m.material.transparent) + ' dw=' + (m.material && m.material.depthWrite) + ' dt=' + (m.material && m.material.depthTest) + ' op=' + (m.material && +m.material.opacity.toFixed(2))); }); return { id: sp.id, zTop: sp.zTop, z: sp.holder.position.z, px: Math.round(sp.holder.position.x + ov.W / 2), py: Math.round(ov.H / 2 - sp.holder.position.y), meshes: r }; }), U, buildJelly, loadJelly, tapThing: id => { const o = G.things.find(x => x.id === id && x.alive); if (o) pickThing(o); return !!o; }, evInfo: () => { const e = EVT.cur; if (!e) return null; return { kind: e.kind, t: +e.t.toFixed(1), d: +e.d.toFixed(1), n: e.m.length, pinned: e.m.filter(o => o.evPin).length, fish: G.things.filter(o => o.kind === 'fish' && o.alive && !o.big).length, p: e.m.slice(0, 4).map(o => [+o.pos.x.toFixed(1), +o.pos.y.toFixed(1), +o.pos.z.toFixed(1), !!o.evPin]) }; }, devEvents: ['conga', 'waltz', 'swirl', 'squabble', 'drop', 'feed', 'startle', 'swarm', 'octo ink', 'octo floor', 'octo swim', 'pump'], devEvent: (n) => {   /* developer tool (Settings): start one event now, to test it */
  if (!G || G.status !== 'play') return; hideOverlays(); paused = false;
  if (EVT.cur) { for (const o of EVT.cur.m) { o.evOn = false; o.evTight = false; o.evPin = null; } EVT.cur = null; }
  if (n === 'conga' || n === 'waltz' || n === 'swirl' || n === 'squabble' || n === 'drop') evStart(n);
  else if (n === 'feed') { if (!feed.on) feedStart(); } else if (n === 'startle') { if (!G.cfg.startle) G.cfg.startle = true; G.devRock = true; }
  else if (n === 'swarm') { if (!G.cfg.swarm) G.cfg.swarm = true; swarmHouseSetup(); swarm.on = false; swarmStart(); }
  else if (n === 'pump') { if (G.waves && G.waves.length) tubeStart(); }
  else if (n.startsWith('octo')) { const o = G.things.find(x => x.id === 'squid' && x.alive); if (!o || !o.oc) return; const S = o.oc, m = n.split(' ')[1]; if (m === 'ink') { o.inkT = 0; return; } S.t = 0; S.cool = 1e9; S.mode = m === 'swim' ? 'swim' : m; S.next = 25; if (m === 'floor') { S.fwp.copy(randomPoint(o)); S.fwp.y = FLOOR_Y + (OCT_FLY + .3) * o.sz; } if (m === 'wall') { S.a = Math.atan2(o.pos.z, o.pos.x); S.wy = clamp(o.pos.y, FLOOR_Y + 1, WATER_Y - 1.3); S.wa = S.a; S.wyT = S.wy; } }
}, nose: () => G.things.filter(o => o.kind === 'fish' && o.alive && !o.big && o.dir.y < -.55).map(o => ({ y: +o.pos.y.toFixed(2), dy: +o.dir.y.toFixed(2), pin: !!o.evPin, ev: !!o.evOn, dsp: !!o.dsp, mood: o.mood, spin: !!o.spinT, stk: +(o.stkT || 0).toFixed(1), ev2: EVT.cur ? EVT.cur.kind : '', id: SPECIES[o.type] && SPECIES[o.type].id })), ev: k => { if (EVT.cur) { for (const o of EVT.cur.m) { o.evOn = false; o.evTight = false; o.evPin = null; } EVT.cur = null; } evStart(k); return EVT.cur ? EVT.cur.m.length : 0; }, conga: () => { evStart('conga'); const e = EVT.cur; return e ? e.m.length : 0; }, congaStat: () => { const e = EVT.cur; if (!e || e.kind !== 'conga') return null; const m = e.m, out = []; for (let i = 1; i < m.length; i++) { const f = m[i - 1], o = m[i]; _ov.subVectors(f.pos, o.pos); const d = _ov.length(); _ov.normalize(); out.push([+o.dir.dot(_ov).toFixed(2), +d.toFixed(2)]); } const lead = m[0]; return { t: +e.t.toFixed(1), out, leadSpeedDir: [+lead.dir.x.toFixed(2), +lead.dir.z.toFixed(2)] }; }, flightProbe: () => ov.flights.map(f => ({ s0: Math.round(f.size0), s1: Math.round(f.size1 || 0), t: Math.round(f.t), cur: Math.round(f.sp.holder.scale.x * f.sp.dim), dim: +f.sp.dim.toFixed(2), oct: !!f.sp.built.oct })), octInk: () => { const o = G.things.find(x => x.id === 'squid'); if (o) o.inkT = 0; return !!o; }, tapOcto: () => { const o = G.things.find(x => x.id === 'squid' && x.alive); if (o) pickThing(o); return !!o; }, tapWrong: n => { let c = 0; for (const o of G.things.slice()) { if (c >= n) break; if (o.kind === 'fish' && o.alive && !o.big && !(G.need && G.need.has(o.type))) { pickThing(o); c++; } } return c; }, bk: () => G.backup.map(i => i.id + (i.filler ? '*' : '') + (i.landed ? '' : '?')), camAng: () => Math.atan2(cam.position.z, cam.position.x), octSet: (m, ang) => { const o = G.things.find(x => x.id === 'squid'); if (!o || !o.oc) return null; const S = o.oc; S.t = 0; S.next = 999; S.mode = m; if (m === 'floor') { S.fwp.copy(randomPoint(o)); S.fwp.y = FLOOR_Y + OCT_FLY + .3; } if (m === 'wall') { S.a = Math.atan2(o.pos.z, o.pos.z === 0 && o.pos.x === 0 ? 1 : o.pos.x); S.wy = clamp(o.pos.y, FLOOR_Y + 1, WATER_Y - 1.3); if (ang !== undefined) S.a = ang; S.wa = S.a; S.wyT = S.wy; } return o.pos.toArray(); }, octInfo: () => { const o = G.things.find(x => x.id === 'squid'); if (!o) return null; const S = o.oc || {}; return { pos: o.pos.toArray().map(v => +v.toFixed(2)), mode: S.mode, fk: +(S.fk || 0).toFixed(2), wk: +(S.wk || 0).toFixed(2), walk: +(S.walk || 0).toFixed(2) }; }, oct: { loadOctopus, buildSquid, octoAnim, octoCycle, octoBlink, OCT }, clipTest: () => { const sol = themeBoxes(curTheme), all = decorBoxes(curTheme), r = { n: 0, solid: 0, soft: 0, ex: [] }; for (const o of G.things) { if (o.kind !== 'fish' || !o.alive || o.big) continue; r.n++; const P0 = o.pos, br = bodyR(o) * .9, pts = [P0, P0.clone().addScaledVector(o.dir, br), P0.clone().addScaledVector(o.dir, -br)]; let hs = false; for (const P of pts) { for (const b of sol) if (b.min.y < 1.7 && P.x > b.min.x + .12 && P.x < b.max.x - .12 && P.y > b.min.y + .1 && P.y < b.max.y - .1 && P.z > b.min.z + .12 && P.z < b.max.z - .12) { hs = true; if (r.ex.length < 3) r.ex.push([+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2), b.min.toArray().map(v => +v.toFixed(2)), b.max.toArray().map(v => +v.toFixed(2))]); } } if (hs) r.solid++; else { const P = P0; for (const b of all) if (!sol.includes(b) && P.x > b.min.x + .05 && P.x < b.max.x - .05 && P.y > b.min.y && P.y < b.max.y && P.z > b.min.z + .05 && P.z < b.max.z - .05) { r.soft++; break; } } } return r; }, decorInfo: () => { const out = []; const def = THREE.Material.prototype.onBeforeCompile, bx = new THREE.Box3(), sz = new THREE.Vector3(); themeG.forEach((g, i) => { const solids = new Set(themeBoxes(i)); g.children.forEach(c => { let sol = false, types = new Set(); c.traverse(m => { if (!m.isMesh) return; types.add(m.geometry.type.replace('Geometry', '')); if (m.material && m.material.onBeforeCompile === def && m.geometry.type !== 'PlaneGeometry' && m.geometry.type !== 'CircleGeometry') sol = true; }); bx.setFromObject(c); bx.getSize(sz); out.push([i, c.userData.pl || '-', c.visible ? 1 : 0, sol ? 'S' : 'soft', +sz.x.toFixed(2), +sz.y.toFixed(2), +sz.z.toFixed(2), [...types].slice(0, 3).join('+')].join(' ')); }); }); return out; }, fishPos: () => G.things.filter(o => o.kind === 'fish' && o.alive && !o.big).map(o => [o.pos.x, o.pos.y, o.pos.z, o.rf, o.boost, o.mood || 0, o.evOn ? 1 : 0]), RF_: () => RF, swarmStart: () => { swarm.on = false; swarmStart(); }, loadFish, cageCanvas: (w, h, l) => tankFx.cageCanvas(w, h, l), devWin, devLose, showIntro, THREE, FBXLoader, modelVariant, makeModelThumb, buildModelFish, THUMB, SPECIES, newLevel, feed, feedStart, themeG, tankG: tank, MODEL3D, celebrate, flySprite, makeSprite, completeTarget, giveToTarget, ov, tankFx, ovFx, onTap, renderer, scene, ringFx, sprayInk, themeBoxes, colPush, tube, tubeStart, applyCam, projectToClient, pullFromBackup, swarm, swarmStart, swarmUpdate, assignTarget, get item() { return evItem; }, nowT: () => U.uTime.value - G.t0, EVT, evStart, evEnd, comboHit, guide, startleUpdate, spawnThing, LENS, lensToContent, lensToScreen, lensClientToContent, lensContentToClient, pickAtDbg: (x, y) => pickAt(x, y, 1e9), pickAtRay: (x, y) => { const r = canvas.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), cam); return pickAtRay(); },
  pickStats: () => { pickRender(); const r = canvas.getBoundingClientRect(), out = {}; for (let y = 0; y < PICK.h; y++) for (let x = 0; x < PICK.w; x++) { const i = (y * PICK.w + x) * 4, id = PICK.buf[i] + PICK.buf[i + 1] * 256; if (!id) continue; const o = out[id] || (out[id] = { n: 0, x: 0, y: 0 }); o.n++; o.x += x; o.y += y; }
    return Object.entries(out).map(([id, o]) => ({ kind: PICK.map.get(+id)?.kind, id: +id, n: o.n, cx: r.left + o.x / o.n / PICK.w * r.width, cy: r.top + (PICK.h - 1 - o.y / o.n) / PICK.h * r.height })); }, PICKMAP: PICK.map, glassWater, showLose, tapClam, feed, inks, FISHART, cam, renderer, ov, surfaceSplash, waterBurst, miniSplash, boxEls: () => boxEls, get G() { return G; }, pickThing, orbit, newLevel, SPECIES, THUMB, scatter, onTap, missTap, hint, save, openLevels, showTut };

SHELL.done = true; replaceDecor();
