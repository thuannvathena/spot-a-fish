import * as Phaser from 'phaser';
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
    const g = L.g, t = c.scene.time.now / 1000;
    document.querySelectorAll('#targets .target').forEach((el, i) => {
        const root = rectOf(el, c.o); if (!root) return;
        const a = opacityOf(el);
        const bR = rectOf(el.querySelector('.board'), c.o), aR = rectOf(el.querySelector('.aq'), c.o), baseR = rectOf(el.querySelector('.base'), c.o);
        if (a < 0.02) return;
        c.hits.push(root);
        void baseR;   // no brass base under the tank any more
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
                const im = sig && sig.getAttribute('src') ? L.image(`tg${i}sig`, sig.getAttribute('src')!, { x: 0, y: 0, w: 400, h: bodyH * 0.9 }, { alpha: a }) : false;
                const iw = im ? im.displayWidth : 0, gap = im ? 6 : 0, x0 = bR.x + (bR.w - (iw + gap + tx.width)) / 2;
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
    bClear: (g, x, y) => { line(g, 2.6, A, [[x, y + 4], [x, y - 7]]); line(g, 2.6, A, [[x - 5, y - 2], [x, y - 7], [x + 5, y - 2]]); line(g, 2.6, 0xffe27a, [[x - 8, y + 8], [x + 8, y + 8]]); }
};
export function paintTools(L: Layer, c: Ctx) {
    const g = L.g, t = c.scene.time.now / 1000;
    for (const id of ['bHint', 'bClear']) {   // (the camera up / down buttons are gone: two-finger drag moves the view)
        const el = document.getElementById(id); if (!el) continue;
        const r = rectOf(el, c.o); if (!r || r.w < 4 || !shown(el)) continue;
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = r.w / 2, press = c.zones.pressed === id, dy = press ? 3 : 0, off = el.classList.contains('off');
        porthole(g, cx, cy + dy, rad, { thick: 4.5, glass: off ? 0x5a7c99 : 0x1f7cc8 });
        const p = parseFloat(el.style.getPropertyValue('--p')) || 0;
        if (p > 0.5) { g.fillStyle(0x000a1e, 0.6).slice(cx, cy + dy, rad - 5.5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p) / 100, false).fillPath(); }
        ICONS[id](g, cx, cy + dy);
        const glow = el.classList.contains('glow');
        if (glow) { const k = 0.5 + 0.5 * Math.sin(t * 6); g.lineStyle(4, T.amber, 0.6 + 0.4 * k).strokeCircle(cx, cy + dy, rad + 3 + 3 * k); }
        const cnt = el.querySelector('.cnt'), cr = rectOf(cnt, c.o);
        if (cnt && cr && id === 'bClear') {
            plate(g, cr, 9, T.coral, { border: T.foam, bw: 2, gloss: T.coralL });
            L.text('cnt' + id, cr.x + cr.w / 2, cr.y + cr.h / 2 + 0.5, lerpTxt(cnt), { size: 12, color: '#ffffff', stroke: hexCss(T.coralD), sw: 2 });
        }
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
        } else if (e.classList.contains('fishy')) L.text(key, r.x + r.w / 2, r.y + r.h / 2, lerpTxt(e), { size: fontPx(e, 54) });
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
                if (lock) { g.fillStyle(0x8a9bb0, 1).fillRoundedRect(cx - rad, cy - rad * 0.6, rad * 2, rad * 1.5, 6); g.lineStyle(1.5, 0x5d7088, 1).strokeRoundedRect(cx - rad, cy - rad * 0.6, rad * 2, rad * 1.5, 6); L.text(kk + 'n', cx, cy + 2, '🔒', { size: 16 }); }
                else { pearl(g, cx, cy, rad, { glow: cur ? T.amber : undefined }); L.text(kk + 'n', cx, cy + 1, num, { size: fontPx(b, 23) * 0.9, color: hexCss(T.deep) }); }
                if (!lock) for (let st2 = 0; st2 < 3; st2++) starfish(g, cx + (st2 - 1) * rad * 0.78, br.y + br.h - rad * 0.28, rad * 0.3, { hollow: st2 >= earned, rot: (st2 - 1) * 0.3 });
                z.add(kk, br, { click: click(b) });
            }
        } else walk(e);
    });
    if (card) walk(card);
}

/* ---------- spotlight tutorial: dim the screen, light the real control, short tip ---------- */
export function paintSpot(L: Layer, c: Ctx) {
    const sp = document.getElementById('spotOv');
    if (!sp || !sp.classList.contains('show')) return;
    c.modal = true;
    const g = L.g, box = rectOf(document.getElementById('spotBox'), c.o), tip = document.getElementById('spotTip'), tr = rectOf(tip, c.o), t = c.scene.time.now / 1000;
    if (box) {
        const rad = parseFloat((document.getElementById('spotBox') as HTMLElement).style.borderRadius) || 16, k = 0.5 + 0.5 * Math.sin(t * 5.7);
        g.fillStyle(T.deeper, 0.78);
        g.fillRect(0, 0, c.w, Math.max(0, box.y)).fillRect(0, box.y + box.h, c.w, Math.max(0, c.h - box.y - box.h)).fillRect(0, box.y, Math.max(0, box.x), box.h).fillRect(box.x + box.w, box.y, Math.max(0, c.w - box.x - box.w), box.h);
        g.lineStyle(10 + 6 * k, T.aqua, 0.16 + 0.12 * k).strokeRoundedRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8, rad + 4);
        g.lineStyle(3 + 2 * k, k > 0.5 ? T.foam : T.aqua, 1).strokeRoundedRect(box.x, box.y, box.w, box.h, rad);
    } else g.fillStyle(T.deeper, 0.78).fillRect(0, 0, c.w, c.h);
    if (tip && tr) {
        const ax = parseFloat(tip.style.getPropertyValue('--ax')) || tr.w / 2;
        g.fillStyle(BR.mid, 1).fillTriangle(tr.x + ax - 9, tr.y + 1, tr.x + ax + 9, tr.y + 1, tr.x + ax, tr.y - 11);
        g.fillStyle(T.deep, 0.97).fillTriangle(tr.x + ax - 7, tr.y + 2, tr.x + ax + 7, tr.y + 2, tr.x + ax, tr.y - 8);
        brass(g, tr, 18); glass(g, { x: tr.x + 4, y: tr.y + 4, w: tr.w - 8, h: tr.h - 8 }, 14, { tint: T.deep, alpha: 0.97, rim: BR.dk, rimA: 0.6, hi: 0.1, shadow: false });
        const b = document.getElementById('spotT'), p = document.getElementById('spotP'), ok = tip.querySelector('.spotok');
        const br = rectOf(b, c.o), pr = rectOf(p, c.o), okr = rectOf(ok, c.o);
        if (b && br) L.text('spT', br.x + br.w / 2, br.y + br.h / 2, lerpTxt(b), { size: fontPx(b, 21), color: hexCss(T.amber), stroke: hexCss(T.deeper), sw: 4 });
        if (p && pr) L.text('spP', pr.x + pr.w / 2, pr.y + pr.h / 2, lerpTxt(p), { size: fontPx(p, 16), stroke: hexCss(T.deeper), sw: 2, wrap: pr.w + 4 });
        if (ok && okr) L.text('spK', okr.x + okr.w / 2, okr.y + okr.h / 2, lerpTxt(ok), { size: 13, alpha: 0.8 });
    }
    c.spotZones.add('spot', { x: 0, y: 0, w: c.w, h: c.h }, { click: click(sp) });
}

/* ---------- messages: toast, goal message, hints, camera tutorial, pointing hand ---------- */
export function paintMessages(L: Layer, c: Ctx) {
    const g = L.g;
    const toast = document.getElementById('toast'), tr = rectOf(toast, c.o);
    if (toast && tr && opacityOf(toast) > 0.02) {
        const a = opacityOf(toast);
        plate(g, tr, tr.h / 2, T.coral, { border: BR.hi, bw: 2, edge: BR.lo, edgeH: 4, gloss: T.coralL, alpha: a });
        L.text('toast', tr.x + tr.w / 2, tr.y + tr.h / 2 - 1, lerpTxt(toast), { size: fontPx(toast, 26), stroke: hexCss(T.coralD), sw: 4, alpha: a });
    }
    const gm = document.getElementById('goalMsg'), gr = rectOf(gm, c.o);
    if (gm && gr && gm.classList.contains('show')) {
        glass(g, gr, gr.h / 2, { tint: T.deeper, alpha: 0.78, rim: BR.hi, rimA: 0.85, hi: 0.12 });
        L.text('goalMsg', gr.x + gr.w / 2, gr.y + gr.h / 2, lerpTxt(gm), { size: fontPx(gm, 17), stroke: '#031a38', sw: 3, wrap: gr.w });
    }
    const hint = document.getElementById('hint'), hr = rectOf(hint, c.o);
    if (hint && hr && opacityOf(hint) > 0.02) L.text('hint', hr.x + hr.w / 2, hr.y + hr.h / 2, lerpTxt(hint), { size: 13, color: '#e6f7ff', stroke: '#001e46', sw: 3, alpha: opacityOf(hint) });
    const ct = document.getElementById('camTut'), cm = document.getElementById('camMsg'), cmr = rectOf(cm, c.o);
    if (ct && cm && cmr && ct.classList.contains('show')) {
        glass(g, cmr, cmr.h / 2, { tint: T.deeper, alpha: 0.8, rim: BR.hi, rimA: 0.85, hi: 0.12 });
        L.text('camMsg', cmr.x + cmr.w / 2, cmr.y + cmr.h / 2, lerpTxt(cm), { size: fontPx(cm, 18), stroke: '#001428', sw: 3, wrap: cmr.w });
        ct.querySelectorAll('.cg i').forEach((d, k) => { const r = rectOf(d, c.o); if (r) { g.fillStyle(0xffffff, 0.55).fillCircle(r.x + r.w / 2, r.y + r.h / 2, r.w / 2); g.lineStyle(3, 0xffffff, 1).strokeCircle(r.x + r.w / 2, r.y + r.h / 2, r.w / 2); void k; } });
        const arr = ct.querySelector('.cg .arr'), ar = rectOf(arr, c.o); if (arr && ar) L.text('camArr', ar.x + ar.w / 2, ar.y + ar.h / 2, lerpTxt(arr), { size: fontPx(arr, 38) });
    }
    const gh = document.getElementById('guideHand'), ghr = rectOf(gh, c.o);
    if (gh && ghr && shown(gh)) L.text('hand', ghr.x + ghr.w / 2, ghr.y + ghr.h / 2, lerpTxt(gh), { size: fontPx(gh, 44), alpha: opacityOf(gh) });
}
export { FONT, hex, inRect };
