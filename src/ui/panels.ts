import * as Phaser from 'phaser';
import { paintBFAnim, paintGuideBF, paintSpotBF, paintToastBF } from './bf';
import { BR, FONT, T, Layer, R, Zones, brass, fontPx, glass, hex, hexCss, inRect, opacityOf, pearl, plate, porthole, recess, rectOf, rivet, shown, starfish } from './kit';

// Painters: each one mirrors a group of hidden HTML elements (see src/ui/kit.ts) into Phaser drawings and touch zones.

export interface GameState { level: number; completed: number; goalShown?: number; status?: string; cfg: { goal: number; backup: boolean }; backup: { junk?: boolean; filler?: boolean }[] }
export interface Ctx { scene: Phaser.Scene; o: DOMRect; w: number; h: number; G?: GameState; zones: Zones; ovZones: Zones; spotZones: Zones; hits: R[]; modal: boolean }

const click = (el: Element) => () => (el as HTMLElement).click();
const lerpTxt = (el: Element) => (el.textContent ?? '').trim();

// text with <br> as line breaks (innerText would skip the hidden model elements)
const multiline = (el: Element) => Array.from(el.childNodes).map((n) => (n.nodeName === 'BR' ? '\n' : (n.textContent ?? ''))).join('').trim();
const A = 0xffffff;


/* ---------- a target tank is a small copy of the big aquarium: flowing water, light shafts, waves, caustics, plants, motes, bubbles, a gliding glint ---------- */
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function waterAt(v: number): [number, number] {   // the CSS gradient: rgba(170,245,255,.7) -> rgba(60,190,240,.72) at 50% -> rgba(20,130,205,.9)
    const A0 = [170, 245, 255, 0.7], A1 = [60, 190, 240, 0.72], A2 = [20, 130, 205, 0.9], k = Math.min(1, Math.max(0, v));
    const [p, q, m] = k < 0.5 ? [A0, A1, k / 0.5] : [A1, A2, (k - 0.5) / 0.5];
    // blend onto the blue backdrop behind the tanks, so the bands are opaque (overlapping bands would show seams)
    const al = lerp(p[3], q[3], m), BG = [70, 170, 228], ch = (i: number) => Math.round(lerp(p[i], q[i], m) * al + BG[i] * (1 - al));
    return [(ch(0) << 16) | (ch(1) << 8) | ch(2), 1];
}
function aquarium(g: Phaser.GameObjects.Graphics, r: R, a: number, t: number, seed: number) {
    const top = { tl: 13, tr: 13, bl: 0, br: 0 }, bot = { tl: 0, tr: 0, bl: 17, br: 17 }, all = { tl: 13, tr: 13, bl: 17, br: 17 };
    const tick = (period: number, delay = 0) => (((t + delay + seed * 0.7) / period) % 1 + 1) % 1;
    // frame: dark ring and base shadow first
    for (let i = 3; i >= 1; i--) g.fillStyle(0x021428, 0.07 * a).fillRoundedRect(r.x - i, r.y + 2 + i * 1.5, r.w + i * 2, r.h + i, { tl: 13 + i, tr: 13 + i, bl: 17 + i, br: 17 + i });
    // water: gradient that drifts up and down (background-size 170%, 7s alternate)
    const drift = 0.5 - 0.5 * Math.cos(((t + seed) / 7) * Math.PI), N = 14;
    for (let k = 0; k < N; k++) {
        const y0 = r.y + (r.h * k) / N, h = r.h / N + 0.6, [col, al] = waterAt((k / (N - 1) + drift * 0.7) / 1.7);
        g.fillStyle(col, al * a).fillRoundedRect(r.x, y0, r.w, h, k === 0 ? top : k === N - 1 ? bot : 0);
    }
    // light shafts sweeping sideways, fading downwards
    const off = tick(8) * 76;
    for (let x = r.x - 76 + off; x < r.x + r.w; x += 76) {
        const x0 = Math.max(r.x, Math.min(r.x + r.w, x + 12)), x1 = Math.max(r.x, Math.min(r.x + r.w, x + 22)), sh = r.h * 0.8 * 0.27;
        for (let seg = 0; seg < 4; seg++) {
            const ya = r.y + (r.h * 0.8 * seg) / 4, yb = r.y + (r.h * 0.8 * (seg + 1)) / 4, sa = seg * (sh / 4), sb = (seg + 1) * (sh / 4);
            const cl = (v: number) => Math.max(r.x, Math.min(r.x + r.w, v));
            g.fillStyle(0xffffff, 0.085 * (1 - seg / 4) * a).fillPoints([new Phaser.Math.Vector2(cl(x0 - sa), ya), new Phaser.Math.Vector2(cl(x1 - sa), ya), new Phaser.Math.Vector2(cl(x1 - sb), yb), new Phaser.Math.Vector2(cl(x0 - sb), yb)], true);
        }
    }
    // soft highlight band at the surface and the glass strip on the left
    g.fillStyle(0xffffff, (0.35 + 0.35 * Math.cos(tick(2.4) * Math.PI * 2) * 0.5 + 0.1) * a).fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, 5, 3);
    for (let k = 0; k < 5; k++) g.fillStyle(0xffffff, 0.09 * (5 - k) * a).fillRoundedRect(r.x + r.w * 0.07 + k * 0.4, r.y + r.h * 0.12 + k * ((r.h * 0.64) / 5), r.w * 0.11, (r.h * 0.64) / 5 + 1, k === 0 ? 8 : 0);
    // waves drifting along the top edge (two layers of arcs)
    const arcs = (step: number, speed: number, alpha: number, w: number, dir: number) => {
        const sh = tick(speed) * step * dir;
        g.lineStyle(w, 0xffffff, alpha * a);
        for (let x = r.x - step + sh; x < r.x + r.w; x += step) {
            const cx = x + step / 2;
            if (cx - 8 < r.x + 3 || cx + 8 > r.x + r.w - 3) continue;
            g.beginPath(); g.arc(cx, r.y + 15, 7.5, Math.PI * 1.05, Math.PI * 1.95); g.strokePath();
        }
    };
    arcs(20, 1.7, 0.8, 2, -1); arcs(28, 2.6, 0.42, 1.6, 1);
    // sand, caustic light on it, swaying plants
    const sandY = r.y + r.h - 14;
    g.fillStyle(0xbda35e, a).fillRoundedRect(r.x + 1, sandY, r.w - 2, 13, { tl: 0, tr: 0, bl: 14, br: 14 });
    g.fillStyle(0xf2e2a6, a).fillRect(r.x + 1, sandY, r.w - 2, 6);
    g.fillStyle(0xffffff, 0.4 * a).fillRect(r.x + 1, sandY, r.w - 2, 2);
    const cy0 = r.y + r.h - 30, cp = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(tick(6.8) * Math.PI * 2)), cs = (tick(6.8) * 23) % 46;
    for (let x = r.x - 46 + cs; x < r.x + r.w; x += 46) {
        const el = (ex: number, ey: number, rx: number, ry: number, al: number) => { const px = x + ex; if (px - rx > r.x + 3 && px + rx < r.x + r.w - 3) g.fillStyle(0xffffff, al * cp * a).fillEllipse(px, cy0 + ey, rx * 2, ry * 2); };
        el(9, 7, 9, 4, 0.5); el(28, 15, 7, 3, 0.42); el(40, 5, 6, 3, 0.36);
    }
    const plant = (fx: number, h: number, delay: number) => {
        const ang = Math.sin(((t + delay + seed) / 2.6) * Math.PI * 2) * 0.157, bx = fx, by = sandY + 9;
        g.lineStyle(4, 0x2fcf7a, a); g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.sin(ang) * h, by - Math.cos(ang) * h); g.strokePath();
    };
    plant(r.x + r.w * 0.07 + 2, 17, 0); plant(r.x + r.w * 0.11 + 2, 11, -0.8); plant(r.x + r.w * 0.92 - 2, 14, -1.4);
    // floating motes
    [[0.12, 0.6, 9, 0], [0.44, 0.7, 11, 3], [0.72, 0.55, 8, 6], [0.9, 0.75, 12, 1.5]].forEach(([lx, ty, per, dl]) => {
        const p = tick(per, dl), op = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1, dx = p < 0.5 ? lerp(0, -14, p / 0.5) : lerp(-14, 8, (p - 0.5) / 0.5), dy = lerp(0, -32, p);
        g.fillStyle(0xffffff, 0.75 * op * a).fillCircle(r.x + r.w * lx + dx, r.y + r.h * ty + dy, 1.6);
    });
    // bubbles rising from the sand
    [[0.48, 5, 3.4, 0], [0.8, 5, 3.4, 1.7], [0.26, 4, 4, 0.9], [0.62, 3, 3, 2.4], [0.92, 6, 4.6, 0.4]].forEach(([lx, sz, per, dl]) => {
        const p = tick(per, dl), op = p < 0.15 ? p / 0.15 : (1 - p) / 0.85;
        g.lineStyle(1.2, 0xffffff, 0.9 * op * a).strokeCircle(r.x + r.w * lx, r.y + r.h - 14 - p * 54, sz / 2);
    });
    // a glint gliding across the glass now and then
    const gp = tick(5.5);
    if (gp > 0.55) {
        const k = (gp - 0.55) / 0.45, gx = r.x + r.w * lerp(-0.3, 1.3, k), gw = r.w * 0.14, op = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.15) / 0.85);
        const y0 = r.y + r.h * 0.1, y1 = r.y + r.h * 0.8, sk = (y1 - y0) * 0.25, cl = (v: number) => Math.max(r.x + 3, Math.min(r.x + r.w - 3, v));
        g.fillStyle(0xffffff, 0.3 * op * a).fillPoints([new Phaser.Math.Vector2(cl(gx), y0), new Phaser.Math.Vector2(cl(gx + gw), y0), new Phaser.Math.Vector2(cl(gx + gw - sk), y1), new Phaser.Math.Vector2(cl(gx - sk), y1)], true);
    }
    // glass edge
    g.lineStyle(3, 0xe4f6ff, a).strokeRoundedRect(r.x, r.y, r.w, r.h, all);
    g.lineStyle(2, 0xaaf0ff, 0.45 * a).strokeRoundedRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 12);
}

/* ---------- target tanks ---------- */
export function paintTargets(L: Layer, c: Ctx) {
    const g = L.g, t = c.scene.time.now / 1000, wp = (window as unknown as { __whirl?: Record<number, unknown> }).__whirl ?? {};
    document.querySelectorAll('#targets .target').forEach((el, i) => {
        const root = rectOf(el, c.o); if (!root) return;
        const a = opacityOf(el);
        const bR = rectOf(el.querySelector('.board'), c.o), aR = rectOf(el.querySelector('.aq'), c.o), baseR = rectOf(el.querySelector('.base'), c.o);
        if (a < 0.02) return;
        c.hits.push(root);
        void baseR;   // no brass base under the tank any more
        const whirl = !!wp[i];   // a tank being cleared: its tank AND its plate are one twisted mesh drawn in the 3D overlay (tankFx in game/src/main.js), so nothing is drawn here
        if (whirl) return;
        if (aR) {
            if (!(window as unknown as { __tank3d?: boolean }).__tank3d) aquarium(g, aR, a, t, i);   // the 3D tank in the overlay replaces this flat drawing
            // collected fish (thumbnails sit in the slots)
            el.querySelectorAll('.slots img').forEach((im, k) => {
                const src = (im as HTMLImageElement).getAttribute('src'), cls = (im as HTMLElement).className;
                if (!src || cls.includes('gone') === false && cls.includes('in') === false) return;
                const r = rectOf(im, c.o); if (!r) return;
                L.image(`tg${i}s${k}`, src, r, { alpha: a * opacityOf(im) });
            });
        }
        if (bR) {
            // the painted label plate hangs on the tank's top rim (a plain brass plate is the fallback while the picture loads)
            if (!L.pic(`tg${i}plate`, 'ui_plate', bR, { alpha: a })) { brass(g, bR, 9, { alpha: a }); recess(g, { x: bR.x + 3.5, y: bR.y + 3.5, w: bR.w - 7, h: bR.h - 7 }, 6, 0x1a70b8, a); }
            // the fish icon and the count form one group, centred in the plate's body (the two brackets at the bottom are not part of the body)
            const sig = el.querySelector('.sig') as HTMLImageElement | null, bEl = el.querySelector('.board b'), bodyH = bR.h * 0.8, cy = bR.y + bodyH * 0.5 + 1;
            if (bEl) {
                const tx = L.text(`tg${i}n`, 0, cy + 1, lerpTxt(bEl), { size: 23, color: '#ffffff', stroke: '#0c5b8e', sw: 4, alpha: a });
                const im = sig && sig.getAttribute('src') ? L.image(`tg${i}sig`, sig.getAttribute('src')!, { x: 0, y: 0, w: 400, h: bodyH * 1.06 }, { alpha: a }) : false;
                const iw = im ? im.displayWidth : 0, gap = im ? 6 : 0, x0 = bR.x + (bR.w - (iw + gap + tx.width) ) / 2;
                if (im) im.setPosition(x0 + iw / 2, cy);
                tx.setPosition(x0 + iw + gap + tx.width / 2, cy + 1);
            }
        }
    });
}

/* ---------- tool buttons: hint, clear backup, camera arrows ---------- */
type Icon = (g: Phaser.GameObjects.Graphics, x: number, y: number) => void;
const line = (g: Phaser.GameObjects.Graphics, w: number, col: number, pts: [number, number][]) => { g.lineStyle(w, col, 1); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((p) => g.lineTo(p[0], p[1])); g.strokePath(); };
const ICONS: Record<string, Icon> = {
    bHint: (g, x, y) => { g.lineStyle(2.4, A, 1).strokeCircle(x, y - 3, 6.5); line(g, 2.4, A, [[x - 3.5, y + 7], [x + 3.5, y + 7]]); line(g, 2.4, A, [[x - 2, y + 10.5], [x + 2, y + 10.5]]); line(g, 2.4, A, [[x - 2.5, y + 3], [x - 2.5, y - 1], [x + 2.5, y - 1], [x + 2.5, y + 3]]); },
    bTank: (g, x, y) => { g.lineStyle(2.4, A, 1).strokeRoundedRect(x - 8.5, y - 6, 17, 12, 3.5); line(g, 2.6, 0x7dffa8, [[x - 4, y + 0.5], [x - 1, y + 3.5], [x + 4.5, y - 3]]); },
    bClear: (g, x, y) => { line(g, 2.6, A, [[x, y + 4], [x, y - 7]]); line(g, 2.6, A, [[x - 5, y - 2], [x, y - 7], [x + 5, y - 2]]); line(g, 2.6, 0xffe27a, [[x - 8, y + 8], [x + 8, y + 8]]); }
};
export function paintTools(L: Layer, c: Ctx) {
    const g = L.gt, t = c.scene.time.now / 1000, fade = (window as unknown as { __toolA?: number }).__toolA ?? 1;   // the boosters fade away while the camera is being moved and come back when it stops
    g.setAlpha(fade); L.gu.setAlpha(fade);
    if (fade < 0.02) return;
    for (const id of ['bHint', 'bTank', 'bClear']) {   // (the camera up / down buttons are gone: two-finger drag moves the view)
        const el = document.getElementById(id); if (!el) continue;
        const lockLv = (el as HTMLElement).dataset.lockLv;
        if (lockLv && getComputedStyle(el).display !== 'none') {   // not unlocked yet: a grey button with a padlock and the level that opens it, nothing to tap
            const rl = rectOf(el, c.o); if (!rl || rl.w < 4) continue; const lx = rl.x + rl.w / 2, ly = rl.y + rl.h / 2, lr = rl.w / 2;
            if (L.pic('bt' + id, 'nw_btn_round_grey', { x: lx - lr, y: ly - lr, w: lr * 2, h: lr * 2 }, { alpha: fade })) {
                const lz = lr * 0.9; L.pic('bi' + id, 'nw_lock', { x: lx - lz * 0.4, y: ly - lz * 0.5, w: lz * 0.8, h: lz }, { alpha: fade });
            }
            L.text('lk' + id, lx, ly + lr + 13, `Level ${lockLv}`, { size: 14, color: '#ffffff', stroke: '#0c3a6e', sw: 4, alpha: fade });
            c.hits.push(rl); continue;
        }
        const r = rectOf(el, c.o); if (!r || r.w < 4 || !shown(el)) continue;
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = r.w / 2, press = c.zones.pressed === id, dy = press ? 3 : 0, off = el.classList.contains('off');
        const IC: Record<string, string> = { bHint: 'nw_ic_hint', bTank: 'nw_ic_net', bClear: 'nw_ic_back' }, shade = off ? 0.55 : 1;
        if (L.pic('bt' + id, 'nw_btn_round', { x: cx - rad, y: cy + dy - rad, w: rad * 2, h: rad * 2 }, { alpha: fade * shade })) {   // the painted round button and its icon (public/ui/new); drawn as before when the pictures are missing
            const isz = rad * 2 * 0.62; L.pic('bi' + id, IC[id], { x: cx - isz / 2, y: cy + dy - isz / 2 - rad * 0.04, w: isz, h: isz }, { alpha: fade * shade });
            const p = parseFloat(el.style.getPropertyValue('--p')) || 0;
            if (p > 0.5) { L.gu.fillStyle(0x000a1e, 0.6).slice(cx, cy + dy, rad - 3, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p) / 100, false).fillPath(); }
        } else {
            porthole(g, cx, cy + dy, rad, { thick: 4.5, glass: off ? 0x5a7c99 : 0x1f7cc8 });
            const p = parseFloat(el.style.getPropertyValue('--p')) || 0;
            if (p > 0.5) { g.fillStyle(0x000a1e, 0.6).slice(cx, cy + dy, rad - 5.5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p) / 100, false).fillPath(); }
            { const ks = r.w / 44; g.save(); g.translateCanvas(cx, cy + dy); g.scaleCanvas(ks, ks); ICONS[id](g, 0, 0); g.restore(); }   // the icons are drawn for a 44 px button and grow with it
        }
        const glow = el.classList.contains('glow');
        if (glow) { const k = 0.5 + 0.5 * Math.sin(t * 6); L.gu.lineStyle(4, T.amber, 0.6 + 0.4 * k).strokeCircle(cx, cy + dy, rad + 3 + 3 * k); }
        const cnt = el.querySelector('.cnt'), cr = rectOf(cnt, c.o);
        if (cnt && cr && id === 'bClear') {
            plate(g, cr, 9, T.coral, { border: T.foam, bw: 2, gloss: T.coralL });
            L.text('cnt' + id, cr.x + cr.w / 2, cr.y + cr.h / 2 + 0.5, lerpTxt(cnt), { size: 12, color: '#ffffff', stroke: hexCss(T.coralD), sw: 2, alpha: fade });
        }
        if (fade < 0.5) continue;   // hidden: not tappable either
        c.hits.push(r);
        c.zones.add(id, r, { click: click(el) });
    }
}

/* ---------- modal overlays: pause, level complete, backup full, intro, level list ---------- */
const BTN = {
    main: { fill: 0xe6f3fb, gloss: 0xffffff, border: BR.lo, pearl: true, glass: false },
    alt: { fill: T.coral, gloss: T.coralL, border: T.coralD, pearl: false, glass: false },
    ghost: { fill: T.mid, gloss: 0xffffff, border: BR.hi, pearl: false, glass: true },
    danger: { fill: T.coralD, gloss: T.coralL, border: 0x6e1c12, pearl: false, glass: false }
};
function button(L: Layer, c: Ctx, z: Zones, key: string, el: HTMLElement) {
    const r = rectOf(el, c.o); if (!r) return;
    const cls = el.classList, st = cls.contains('ghost') ? (el.id === 'bReset' ? BTN.danger : BTN.ghost) : cls.contains('alt') ? BTN.alt : BTN.main;
    const pressed = z.pressed === key, dy = pressed ? 3 : 0, rr = { ...r, y: r.y + dy };
    if (st.glass) { glass(L.g, rr, 18, { tint: T.mid, alpha: 0.42, rim: BR.hi, rimA: 0.9, hi: 0.2, shadow: !pressed }); }
    else plate(L.g, rr, 18, st.fill, { border: st.pearl ? BR.mid : BR.hi, bw: 2, edge: st.border, edgeH: pressed ? 1 : 5, gloss: st.gloss });
    L.text(key + 't', r.x + r.w / 2, r.y + r.h / 2 + dy - 1, lerpTxt(el), st.pearl ? { size: fontPx(el, 20), color: hexCss(T.deep) } : { size: fontPx(el, 20), color: '#ffffff', stroke: hexCss(st.glass ? T.deeper : st.border), sw: 4 });
    z.add(key, r, { click: click(el) });
}
export function paintOverlay(L: Layer, c: Ctx) {
    const ov = document.querySelector('.overlay.show') as HTMLElement | null;
    if (paintBFAnim(L, c, ov)) return;   // the pop-ups drawn from the painted pieces (src/ui/bf.ts), with their pop in / out
    if (!ov) return;
    c.modal = true;
    const z = c.ovZones, g = L.g;
    g.fillStyle(T.deeper, 0.6).fillRect(0, 0, c.w, c.h);
    z.add('ovBlock', { x: 0, y: 0, w: c.w, h: c.h }, {});   // swallows taps behind the overlay
    const card = ov.querySelector('.card'), cr = rectOf(card, c.o); if (!cr) return;
    brass(g, cr, 30);
    const win: R = { x: cr.x + 7, y: cr.y + 7, w: cr.w - 14, h: cr.h - 14 };
    glass(g, win, 24, { tint: T.deep, alpha: 0.96, rim: BR.dk, rimA: 0.7, hi: 0.1, shadow: false });
    for (const [rx, ry] of [[10, 10], [cr.w - 10, 10], [10, cr.h - 10], [cr.w - 10, cr.h - 10], [cr.w / 2, 5], [cr.w / 2, cr.h - 5]]) rivet(g, cr.x + rx, cr.y + ry, 2.2);
    for (let k = 0; k < 4; k++) g.lineStyle(1.5, 0xffffff, 0.2).strokeCircle(cr.x + cr.w * (0.16 + 0.22 * k), cr.y + cr.h - 18 - (k % 2) * 12, 3 + (k % 3) * 1.5);   // a few bubbles
    const id = ov.id;
    let n = 0;
    const walk = (parent: Element) => parent.querySelectorAll(':scope > *').forEach((el) => {
        const e = el as HTMLElement, key = `${id}:${n++}`, r = rectOf(e, c.o); if (!r) return;
        if (e.classList.contains('ribbon')) {
            const red = e.getAttribute('style')?.includes('ff8095'), st = red ? { f: 0xe0384c, g: 0xff8a96, b: 0x7a1424 } : { f: T.coral, g: T.coralL, b: T.coralD };
            plate(g, r, 14, st.f, { border: BR.hi, bw: 2, edge: BR.lo, edgeH: 4, gloss: st.g });
            L.text(key, r.x + r.w / 2, r.y + r.h / 2, lerpTxt(e), { size: fontPx(e, 20), stroke: hexCss(st.b), sw: 4 });
        } else if (e.classList.contains('fishy')) {
            const im = e.querySelector('img') as HTMLImageElement | null, cx0 = r.x + r.w / 2, cy0 = r.y + r.h / 2;
            if (e.dataset.ic === 'bubbles') { for (const [dx, dy, rr] of [[-18, 8, 9], [8, -6, 14], [24, 14, 7]]) { g.fillStyle(0xffffff, 0.22).fillCircle(cx0 + dx, cy0 + dy, rr); g.lineStyle(2.5, 0xffffff, 0.95).strokeCircle(cx0 + dx, cy0 + dy, rr); g.fillStyle(0xffffff, 0.8).fillCircle(cx0 + dx - rr * 0.3, cy0 + dy - rr * 0.3, rr * 0.22); } }
            else if (im && im.getAttribute('src')) { const ih = Math.min(r.h, 54); const ii = L.image(key + 'f', im.getAttribute('src')!, { x: cx0 - 200, y: cy0 - ih / 2, w: 400, h: ih }); if (ii) ii.setPosition(cx0, cy0); }
        }
        else if (e.classList.contains('stars')) e.querySelectorAll('span').forEach((s, k) => { const sr = rectOf(s, c.o); if (sr) starfish(g, sr.x + sr.w / 2, sr.y + sr.h / 2, Math.min(sr.w, sr.h) * 0.56, { hollow: s.classList.contains('off'), rot: (k - 1) * 0.28, alpha: opacityOf(s) }); });
        else if (e.tagName === 'P') L.text(key, r.x + r.w / 2, r.y + r.h / 2, multiline(e), { size: fontPx(e, 16), color: '#dff4ff', stroke: hexCss(T.deeper), sw: 2, wrap: r.w + 4 });
        else if (e.classList.contains('btn')) button(L, c, z, key, e);
        else if (e.classList.contains('intro-pic')) {
            porthole(g, r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) / 2 + 3, { glass: 0x1a6aa8 });
            const im = e.querySelector('img') as HTMLImageElement | null, ir = rectOf(im, c.o);
            if (im && ir && im.getAttribute('src')) L.image(key + 'i', im.getAttribute('src')!, ir);
        } else if (e.classList.contains('intro-tag')) {
            const ev = e.classList.contains('ev'), st = ev ? { f: T.sea, g: T.seaL, b: T.seaD } : { f: T.coral, g: T.coralL, b: T.coralD };
            plate(g, r, 10, st.f, { border: T.foam, bw: 2, gloss: st.g });
            L.text(key, r.x + r.w / 2, r.y + r.h / 2, lerpTxt(e), { size: fontPx(e, 14), stroke: hexCss(st.b), sw: 3 });
        } else if (e.tagName === 'H2') L.text(key, r.x + r.w / 2, r.y + r.h / 2, lerpTxt(e), { size: fontPx(e, 30), stroke: hexCss(T.deeper), sw: 6 });
        else if (e.classList.contains('lvgrid')) {
            const cells = [...e.querySelectorAll('button')].map((b, k) => ({ b, k, br: rectOf(b, c.o) })).filter((q): q is { b: HTMLButtonElement; k: number; br: R } => !!q.br && !(q.br.y < r.y - 2 || q.br.y + q.br.h > r.y + r.h + 2));   // the list cannot scroll in this version
            // stepping stones of sand lead from pearl to pearl, in level order
            for (let q = 1; q < cells.length; q++) {
                const a = cells[q - 1].br, b2 = cells[q].br; if (Math.abs(a.y - b2.y) > a.h * 0.5) continue;   // only inside a row: stones across rows floated between the pearls
                const ax = a.x + a.w / 2, ay = a.y + a.h * 0.44, bx = b2.x + b2.w / 2, by = b2.y + b2.h * 0.44, rr = Math.min(a.w, a.h) * 0.36;
                for (const t of [0.34, 0.5, 0.66]) { const px = ax + (bx - ax) * t, py = ay + (by - ay) * t + Math.sin(t * Math.PI) * 3; g.fillStyle(0x6b5226, 0.45).fillEllipse(px + 0.5, py + 2, rr * 0.7, rr * 0.38); g.fillStyle(0xe9d49a, 1).fillEllipse(px, py, rr * 0.66, rr * 0.34); g.fillStyle(0xfff5cf, 0.8).fillEllipse(px - 1, py - 1, rr * 0.34, rr * 0.14); }
            }
            for (const { b, k, br } of cells) {
                const lock = b.classList.contains('lock'), cur = b.classList.contains('cur'), kk = `${key}b${k}`, pr = z.pressed === kk, cx = br.x + br.w / 2, cy = br.y + br.h * 0.44 + (pr ? 2 : 0), rad = Math.min(br.w, br.h) * 0.36;
                const small = b.querySelector('small'), num = (b.firstChild?.textContent ?? '').trim(), earned = ((small?.textContent ?? '').match(/★/g) || []).length;
                if (lock) { g.fillStyle(0x8a9bb0, 1).fillRoundedRect(cx - rad, cy - rad * 0.6, rad * 2, rad * 1.5, 6); g.lineStyle(1.5, 0x5d7088, 1).strokeRoundedRect(cx - rad, cy - rad * 0.6, rad * 2, rad * 1.5, 6); g.lineStyle(3, 0x4a5d75, 1); g.beginPath(); g.arc(cx, cy - rad * 0.02, rad * 0.3, Math.PI, 0, false); g.strokePath(); g.fillStyle(0x4a5d75, 1).fillRoundedRect(cx - rad * 0.38, cy - rad * 0.02, rad * 0.76, rad * 0.62, 4); g.fillStyle(0xdbe6f2, 1).fillCircle(cx, cy + rad * 0.26, rad * 0.1); }   // a drawn padlock
                else { pearl(g, cx, cy, rad, { glow: cur ? T.amber : undefined }); L.text(kk + 'n', cx, cy + 1, num, { size: fontPx(b, 23) * 0.9, color: hexCss(T.deep) }); }
                if (!lock) for (let st2 = 0; st2 < 3; st2++) starfish(g, cx + (st2 - 1) * rad * 0.78, br.y + br.h - rad * 0.28, rad * 0.3, { hollow: st2 >= earned, rot: (st2 - 1) * 0.3 });
                z.add(kk, br, { click: () => { if ((window as unknown as { __lvDrag?: boolean }).__lvDrag) return; click(b)(); } });   // a drag that scrolled the list is not a tap on a level
            }
        } else walk(e);
    });
    if (card) walk(card);
    L.text('ver', cr.x + cr.w / 2, cr.y + cr.h + 14, `Spot A Fish ${__APP_VERSION__}`, { size: 11, color: '#bfe6ff', stroke: hexCss(T.deeper), sw: 2 });   // build label, so a screenshot shows which version it is
}

/* ---------- spotlight tutorial: dim the screen, light the real control, short tip ---------- */
export function paintSpot(L: Layer, c: Ctx) { paintSpotBF(L, c); }   // the highlight guides are drawn from the painted pieces (src/ui/bf.ts)


/* ---------- level start: "LEVEL N" floats on the water, swirls and squeezes into a water bubble (the 3D orb, drawn in game/src/main.js), which flies into the level badge; the number then appears in the badge with a glint of ripples and bubbles ---------- */
export const LV_T = { float: 1.5, squeeze: 2.15, arrive: 2.65 };   // seconds: the words float / swirl into the bubble / the bubble arrives (main.js uses the same times)
/** Hard / Super Hard levels (window.__lvTier 1 / 2): the level words, the bubble and the badge number take the tier's colour, and fish bones sit on the words */
export const TIER = [null, { fill: '#b98aff', stroke: '#3b1a78', fx: 0xd8c0ff, bone: 'nw_lv_bone1', bw: 118 }, { fill: '#ff7a94', stroke: '#6e0f2a', fx: 0xffc0cc, bone: 'nw_lv_bone2', bw: 210 }] as const;
export const tierOf = () => TIER[((window as unknown as { __lvTier?: number }).__lvTier ?? 0) as 0 | 1 | 2];
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
export function levelPop(): number { const t = (window as unknown as { __lvPop?: number }).__lvPop; return t ? clamp01((performance.now() - t) / 760) : 1; }   // 0..1 since the bubble arrived (1 = settled)
export function paintLevelIntro(L: Layer, c: Ctx) {
    const w = window as unknown as { __lvIntro?: { t0: number; n: number }; __lvPop?: number; __lvShown?: boolean }, now = performance.now(), g = L.g;
    const lvl = rectOf(document.querySelector('.topbar .lvl'), c.o);
    const I = w.__lvIntro;
    if (I) {
        const open = document.querySelector('.overlay.show, #spotOv.show');
        const dtw = Math.min(250, now - ((I as { last?: number }).last ?? now)); (I as { last?: number }).last = now;
        if (open) { I.t0 += dtw; }   // a pop-up (a new feature, the settings) is open: the animation stands still until it closes
        else {
            const t = (now - I.t0) / 1000;
            if (t > LV_T.arrive + 1.4) { w.__lvIntro = undefined; w.__lvShown = true; }
            else if (t < LV_T.squeeze) {
                // the words (and the fish bones) are a flexible sheet drawn in the overlay 3D scene: see lvTitleUpdate in game/src/main.js
            }
        }
    }
    const pk = w.__lvPop ? (now - w.__lvPop) / 1000 : 9;
    if (lvl && pk < 1.2) {   // the number settles into the badge: a soft glow, two ripples spreading and a few bubbles floating up
        const bx = lvl.x + lvl.w / 2, by = lvl.y + lvl.h / 2, br = Math.min(lvl.h / 2 + 3, 26), a = 1 - pk / 1.2, e = 1 - Math.pow(1 - clamp01(pk / 1.2), 2.2);
        const tf = tierOf(), c1 = tf ? tf.fx : 0xbff4ff, c2 = tf ? tf.fx : 0xe6fbff; g.fillStyle(c1, 0.3 * a * a).fillCircle(bx, by, br * (1.05 + 0.5 * e)); g.fillStyle(0xffffff, 0.3 * a * a * a).fillCircle(bx, by, br * 0.95);
        for (let k = 0; k < 2; k++) { const q = clamp01((pk - k * 0.16) / 0.9); if (q > 0 && q < 1) g.lineStyle(2.4 - k * 0.8, c2, 0.85 * (1 - q)).strokeCircle(bx, by, br * (1 + 1.5 * (1 - Math.pow(1 - q, 2.2)))); }
        for (let k = 0; k < 7; k++) { const q = clamp01((pk - 0.04 * k) / 0.95); if (q <= 0 || q >= 1) continue; const ang = k * 0.9 + 0.5, d = br * (0.7 + 1.2 * q), r = (2 + (k % 3)) * (1 - 0.3 * q), px = bx + Math.cos(ang) * d, py = by + Math.sin(ang) * d - q * 14, al = (1 - q) * 0.95; g.fillStyle(c1, 0.22 * al).fillCircle(px, py, r); g.lineStyle(1.4, 0xffffff, al).strokeCircle(px, py, r); g.fillStyle(0xffffff, al).fillCircle(px - r * 0.3, py - r * 0.3, Math.max(0.6, r * 0.25)); }
    }
}

/* ---------- win: "LEVEL COMPLETE" bursts out of the bubble the fish made, floats like the level-start words, then the water takes the screen ---------- */
export function paintWinText(L: Layer, c: Ctx) {
    const w = window as unknown as { __winText?: { t0: number } }, I = w.__winText; if (!I) return;
    const t = (performance.now() - I.t0) / 1000, g = L.g, cx = c.w / 2, cy = c.h * 0.36, fade = 1 - clamp01((t - 1.72) / 0.28);
    if (fade <= 0) return;
    // the burst: a ring, a soft glow and drops / bubbles flying outward with a little arc
    const k = clamp01(t / 0.9), ek = 1 - Math.pow(1 - k, 2.4);
    g.fillStyle(0xbff4ff, 0.14 * (1 - k) * fade).fillCircle(cx, cy, 30 + 100 * ek);
    for (let i = 0; i < 16; i++) {
        const ang = i * 2.399 + 0.4, sp = 0.55 + ((i * 37) % 10) / 14, q = clamp01(t / (0.55 + sp * 0.35)), r = 20 + 170 * sp * (1 - Math.pow(1 - q, 2)), px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r * 0.7 + 60 * q * q, rad = (2.6 + (i % 4) * 1.4) * (1 - 0.4 * q), al = (1 - q) * fade;
        if (al <= 0) continue; g.fillStyle(0xbff4ff, 0.24 * al).fillCircle(px, py, rad); g.lineStyle(1.5, 0xffffff, al).strokeCircle(px, py, rad); g.fillStyle(0xffffff, al).fillCircle(px - rad * 0.3, py - rad * 0.3, Math.max(0.7, rad * 0.25));
    }
    // confetti: small bits of paper thrown up with the words, tumbling and fluttering down
    for (let i = 0; i < 46; i++) {
        const sd = i * 12.9898, rnd = (k: number) => { const v = Math.sin(sd + k * 78.233) * 43758.5453; return v - Math.floor(v); }, st = rnd(1) * 0.12, q = t - st; if (q <= 0) continue;
        const life = 1.5 + rnd(2) * 0.6, f = q / life; if (f >= 1) continue;
        const ang = -Math.PI / 2 + (rnd(3) - 0.5) * 2.5, sp = 150 + rnd(4) * 260, vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp, px = cx + vx * q * (1 - 0.35 * f) + Math.sin(q * 5 + i) * 8, py = cy + vy * q + 330 * q * q * 0.5, w = 5 + rnd(5) * 4, h = 3 + rnd(6) * 3, rot = q * (4 + rnd(7) * 8) + i, flip = Math.abs(Math.cos(q * (5 + rnd(8) * 6) + i));
        const col = [0xff7ab8, 0xffd75a, 0x7fe3ff, 0xa88bff, 0x8cf08a, 0xffffff][i % 6], al = (1 - Math.max(0, (f - 0.7) / 0.3)) * Math.min(1, q / 0.1);
        const ca = Math.cos(rot), sa = Math.sin(rot), hw = w / 2, hh = (h / 2) * (0.25 + 0.75 * flip), pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => new Phaser.Math.Vector2(px + x * ca - y * sa, py + x * sa + y * ca));
        g.fillStyle(col, 0.95 * al).fillPoints(pts, true);
    }
    // the words themselves (the painted LEVEL COMPLETE! title, bent along an arch) are drawn in the overlay 3D scene by winTitleUpdate in game/src/main.js
}

/* ---------- messages: toast, goal message, hints, camera tutorial, pointing hand ---------- */
export function paintMessages(L: Layer, c: Ctx) {
    const toast = document.getElementById('toast'), ta = toast ? opacityOf(toast) : 0;
    if (toast && ta > 0.02) paintToastBF(L, c, toast, ta);
    paintGuideBF(L, c);   // level 1: the "Tap a fish" board and the hand
    const hint = document.getElementById('hint'), hr = rectOf(hint, c.o);
    if (hint && hr && opacityOf(hint) > 0.02) L.text('hint', hr.x + hr.w / 2, hr.y + hr.h / 2, lerpTxt(hint), { size: 13, color: '#e6f7ff', stroke: '#001e46', sw: 3, alpha: opacityOf(hint) });
}
export { FONT, hex, inRect };
