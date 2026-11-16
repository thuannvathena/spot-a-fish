import { Layer, R } from './kit';
import type { Ctx } from './panels';

// The pop-ups and the first-time guides drawn from the painted pieces in public/ui/bf.
// The game screen is a fixed phone shape (9:16), so every position below is a position in the 1080 x 1920 design pictures (fake screens),
// measured from those pictures and scaled by one number: screen width / 1080. Each pop-up still has a hidden HTML twin (game/src/template.html) that carries state and clicks.
export const NEW_FILES = ['board_hole', 'lock', 'btn_round_grey', 'btn_round', 'ic_hint', 'ic_net', 'ic_back', 'badge_level', 'badge_level_t1', 'badge_level_t2', 'btn_pause'];   // the newly made pieces (public/ui/new): booster button + icons, level badge, pause button
export const BF_FILES = ['pop_set_top', 'pop_set_mid', 'pop_set_bot', 'btn_sq_blue', 'btn_sq_grey', 'ic_sound', 'ic_music', 'ic_vib_off', 'btn_x', 'ic_restart', 'btn_green', 'btn_orange', 'btn_blue', 'btn_red', 'btn_grey', 'bar_blue', 'panel_in', 'ic_sound_off', 'ic_music_off', 'ic_vib_on', 'pic_bubble', 'spark', 'qbubble',
    'pop_base', 'pop_base_blue', 'rib_blue', 'rib_purple', 'hand', 'board', 'board_icon', 'trophy', 'ic_net', 'ic_clear', 'ic_hint', 'pic_water', 'buy_pic', 'buy_d18', 'buy_d20', 'buy_d21', 'buy_d22', 'buy_d23', 'buy_d24', 'buy_d25', 'buy_d26', 'buy_d27', 'buy_d28', 'buy_d33', 'buy_d34', 'buy_d35', 'buy_frame', 'buy_rib', 'badge_count', 'pic_lose', 'fish_fail', 'fish_think', 'txt_levelfailed', 'hand_white', 'nf_title', 'name_squid', 'name_clam', 'name_swarm', 'name_pipe', 'name_frozen', 'fx_light', 'fx_stars', 'board_btn', 'ring', 'ic_coin', 'ic_ad', 'coin_holder', 'ic_plus', 'tag_free', 'ic_plus_round', 'txt_welldone', 'pic_tank_cyl', 'txt_unlocked', 'prog_outline', 'prog_base', 'prog_fill', 'btn_x2', 'pic_tank_frame'];
export const BF_OVERLAYS = ['ovPause', 'ovPlayOn', 'ovLose', 'ovIntro', 'ovBuy', 'ovWell'];

const click = (id: string) => () => (document.getElementById(id) as HTMLElement | null)?.click();
const txt = (id: string) => (document.getElementById(id)?.textContent ?? '').trim();
const attr = (id: string, a: string) => (document.getElementById(id) as HTMLElement | null)?.getAttribute(a) ?? '';
type FF = { save?: { muted?: boolean; noMusic?: boolean; noVib?: boolean }; G?: { backup?: { type?: number; id?: string; junk?: boolean; filler?: boolean }[]; level?: number }; THUMB?: Record<string, string>; SPECIES?: { id: string }[]; cageCanvas?: (w: number, h: number, layer: string) => HTMLCanvasElement | null };
const ff = () => ((window as unknown as { __ff?: FF }).__ff ?? {}) as FF;
const DEV_FLAG = /[?&]dev=1/.test(location.search);   // ?dev=1 opens the developer tools at once; otherwise tap the version text 10 times in the Settings pop-up

const measureCtx = document.createElement('canvas').getContext('2d')!;
const fitCache = new Map<string, number>();
/** font size (design pixels) at which `str` is `w` pixels wide in the UI font */
function fit(str: string, w: number): number {
    const k = str + '|' + w; let v = fitCache.get(k);
    if (v === undefined) { measureCtx.font = '100px "Lilita One"'; v = (100 * w) / Math.max(1, measureCtx.measureText(str).width); fitCache.set(k, v); }
    return v;
}
const width = (str: string, size: number) => { measureCtx.font = `${size}px "Lilita One"`; return measureCtx.measureText(str).width; };

interface Style { fill: string; stroke: string; sw: number; sh: number; lift?: number }
const WHITE: Style = { fill: '#ffffff', stroke: '#0d1a36', sw: 9, sh: 4 };
const TITLE: Style = { fill: '#ffffff', stroke: '#0a1530', sw: 14, sh: 5, lift: 0.09 };   // lift: the letters sit a little high in their box, so they land in the middle of the ribbon
const GREY: Style = { fill: '#98a3b6', stroke: '#2b3548', sw: 8, sh: 3 };
const GREEN_TXT = '#7dff3a', RED_TXT = '#ff5a5a';
/** a picture cut to the area that is not transparent (the small pictures have wide empty margins); the whole picture is used until the cut one is ready */
const cropCache = new Map<string, string>();
function cropped(src: string): string {
    const hit = cropCache.get(src); if (hit !== undefined) return hit || src;
    cropCache.set(src, '');
    const im = new Image(); im.onload = () => {
        const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); if (!g) return; g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 <= x0 || y1 <= y0) return; const w = x1 - x0 + 1, h = y1 - y0 + 1, out = document.createElement('canvas'); out.width = w; out.height = h; out.getContext('2d')?.drawImage(cv, x0, y0, w, h, 0, 0, w, h); cropCache.set(src, out.toDataURL('image/png'));
    };
    im.src = src; return src;
}

// pop in / out: the pop-up grows from 70% with a small overshoot while it fades in, and shrinks while it fades out
const IN_MS = 330, OUT_MS = 200;
interface WellState { level: number; base: number; kind: string; title: string; p0: number; p1: number; full: boolean; claimed: number; mult: number; pr?: number; fullAt?: number; soon?: boolean; fish?: string[] }
let lastWell: WellState | null = null;
let lastBuy: { kind: string; price: number; pack?: number } | null = null;
let cur: { id: string; t0: number } | null = null, leaving: { id: string; t0: number } | null = null, devOpen = false;
const backOut = (u: number) => 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2);

/** called every frame instead of drawing the overlay directly: handles the pop in / out of the new pop-ups; returns true when it drew something */
export function paintBFAnim(L: Layer, c: Ctx, ov: HTMLElement | null): boolean {
    const now = performance.now(), id = ov && BF_OVERLAYS.includes(ov.id) ? ov.id : null;
    if (id && (!cur || cur.id !== id)) { cur = { id, t0: now }; leaving = null; if (id !== 'ovPause') devOpen = false; }
    if (!id && cur) { leaving = { id: cur.id, t0: now }; cur = null; }
    if (id && cur) { const u = Math.min(1, (now - cur.t0) / IN_MS); paintBF(L, c, ov as HTMLElement, id === 'ovWell' ? 1 : 0.7 + 0.3 * backOut(u), id === 'ovWell' ? 1 : Math.min(1, u * 2.2), false); return true; }
    if (leaving) {
        const u = (now - leaving.t0) / OUT_MS, el = document.getElementById(leaving.id);
        if (u >= 1 || !el) { leaving = null; return false; }
        paintBF(L, c, el, leaving.id === 'ovWell' ? 1 : 1 - 0.3 * u * u, 1 - u, true); return true;
    }
    return false;
}

export function paintBF(L: Layer, c: Ctx, ov: HTMLElement, K = 1, A = 1, out = false) {
    const s = c.w / 1080, z = c.ovZones, g = L.g, id = ov.id, t = c.scene.time.now / 1000, cx0 = c.w / 2, cy0 = c.h / 2;
    // every position goes through the pop in / out transform (scale K about the screen centre)
    const D = (x: number, y: number, w: number, h: number): R => ({ x: cx0 + (x * s - cx0) * K, y: cy0 + (y * s - cy0) * K, w: w * s * K, h: h * s * K });
    const P = {
        pic: (k: string, tex: string, r: R, o: { alpha?: number } = {}) => L.pic(k, tex, r, { alpha: A * (o.alpha ?? 1) }),
        nine: (k: string, tex: string, r: R, ins: [number, number, number, number], o: { alpha?: number; k?: number } = {}) => L.nine(k, tex, r, ins, { alpha: A * (o.alpha ?? 1), k: o.k !== undefined ? o.k * K : undefined }),
        image: (k: string, src: string, r: R, o: { alpha?: number; rot?: number } = {}) => L.image(k, src, r, { alpha: A * (o.alpha ?? 1), rot: o.rot })
    };
    // text with its outline and shadow, placed by its centre (design pixels) and sized to a measured width
    const text = (key: string, str: string, cx: number, cy: number, w: number, st: Style = WHITE, fixedSize?: number) => {
        const size = fixedSize ?? fit(str, Math.max(10, w - st.sw)), p = D(cx, cy - size * (st.lift ?? 0), 0, 0);
        return L.text(key, p.x, p.y, str, { size: size * s * K, color: st.fill, stroke: st.stroke, sw: Math.max(0, st.sw * s * K), sh: Math.max(0, st.sh * s * K), alpha: A });
    };
    // a header on a curved ribbon: every letter sits on the arch of the ribbon (centre highest) and leans with it; W = the ribbon's width, sag = how far the ends hang below the middle
    const arcText = (key: string, str: string, cx: number, cy: number, w: number, st: Style, W: number, sag: number) => {
        const size = fit(str, Math.max(10, w - st.sw)), chars = [...str], ws = chars.map((ch) => width(ch, size)), tw = ws.reduce((a, b) => a + b, 0); let x = cx - tw / 2;
        chars.forEach((ch, i) => {
            const xc = x + ws[i] / 2, u = (xc - cx) / (W / 2), p = D(xc, cy + sag * u * u - size * (st.lift ?? 0), 0, 0); x += ws[i];
            if (ch === ' ') return;
            L.text(`${key}${i}`, p.x, p.y, ch, { size: size * s * K, color: st.fill, stroke: st.stroke, sw: Math.max(0, st.sw * s * K), sh: Math.max(0, st.sh * s * K), alpha: A }).setRotation(Math.atan((2 * sag * u) / (W / 2)));
        });
    };
    const button = (key: string, kind: 'green' | 'orange' | 'blue' | 'grey', r: R, label: string, onClick: () => void, labelW?: number, icon?: string) => {
        const dy = z.pressed === key ? 6 * s : 0, rr = { ...r, y: r.y + dy * K }, h = rr.h * 1.1;
        P.nine(key + 'b', 'bf_btn_' + kind, { ...rr, h }, kind === 'blue' ? [70, 70, 62, 80] : [62, 62, 56, 72], { k: (r.h * 1.1) / (kind === 'blue' ? 227 : 202) / K });
        if (icon) P.pic(key + 'i', 'bf_' + icon, { x: rr.x + rr.w / 2 - 52 * s * K, y: rr.y + rr.h / 2 - 62 * s * K, w: 105 * s * K, h: 113 * s * K });
        else { const sz = fit(label, (labelW ?? 330) - 10) * s * K; L.text(key + 't', rr.x + rr.w / 2, rr.y + r.h * 0.45, label, { size: sz, color: '#ffffff', stroke: kind === 'green' ? '#14420b' : '#0a3a73', sw: 10 * s * K, sh: 5 * s * K, alpha: A }); }
        if (!out) z.add(key, r, { click: onClick });
    };
    if (!out) c.modal = true;
    // the coins: the number counts up when it changes; the header sits top right and is only shown by the pop-ups that deal with coins
    type CoinAnim = { kind: 'gain' | 'spend'; from: number; to: number; t0: number; steps?: { t: number; v: number }[] };
    const cAnim = (): CoinAnim | undefined => (window as unknown as { __coinAnim?: CoinAnim }).__coinAnim;
    const coinsNow = (): number => {
        const f = ff() as FF & { save?: { coins?: number } }, an = cAnim(), real = f.save?.coins ?? 0, now = performance.now(); if (!an) return real;
        if (an.steps) { let v = an.from; for (const st of an.steps) if (now >= st.t) v = st.v; return v; }   // a reward: one step as each coin lands
        const u = Math.min(1, (now - an.t0) / 700); return Math.round(an.from + (an.to - an.from) * (1 - Math.pow(1 - u, 3)));   // spending: counts down
    };
    const coinHeader = (dy = 0) => {
        const an = cAnim(), now = performance.now(); let bump = 0;
        if (an && an.steps) for (const st of an.steps) { const u = (now - st.t) / 260; if (u >= 0 && u < 1) bump = Math.max(bump, Math.sin(Math.PI * u)); }   // every coin that lands makes the header bounce
        const spendU = an && an.kind === 'spend' ? (now - an.t0) / 800 : 2, spending = spendU >= 0 && spendU < 1, kb = 1 + 0.13 * bump + (spending ? 0.04 * Math.sin(spendU * Math.PI * 6) : 0);
        const cx = 908, cy = 105 + dy, H = (x: number, y: number, w: number, h: number): R => D(cx + (x - cx) * kb, cy + (y - cy) * kb, w * kb, h * kb);
        P.pic('chH', 'bf_coin_holder', H(790, 66 + dy, 236, 77));
        P.pic('chC', 'bf_ic_coin', H(762, 57.5 + dy, 88, 94));   // (its centre is the centre line of the pill: 66 + 77 / 2 = 104.5)
        P.pic('chP', 'bf_ic_plus_round', H(806, 113 + dy, 40, 40));
        const pop = 1 + 0.38 * bump, tp = D(938, 105 + dy, 0, 0), sz = 52 * pop * s * K;
        L.text('chT', tp.x, tp.y, String(coinsNow()), { size: sz, color: spending ? '#e23a3a' : bump > 0.05 ? '#0b6bd6' : '#17408f', stroke: '#ffffff', sw: 0, sh: 0, alpha: A });   // the number jumps when it changes (red while it drops)
        if (an && an.kind === 'spend') for (let i = 0; i < 4; i++) {   // coins spent: their shadows drop out of the counter one after another, while the number counts down
            const u = (now - an.t0 - i * 130) / 560; if (u <= 0 || u >= 1) continue; const e = u * u;
            P.pic('chG' + i, 'bf_ic_coin', D(776 + i * 14 - 40 * u * (i % 2 ? -1 : 1), 62 + dy + e * 360, 76 * (1 - 0.3 * u), 82 * (1 - 0.3 * u)), { alpha: 0.75 * (1 - u) });
        }
    };
    const STROKE = { green: '#14420b', orange: '#7a3a05', grey: '#2b3548' }, LBL = 62;   // ONE label style for the buttons of every coin pop-up: the same size, white letters, an outline in the dark shade of the button
    const label = (key: string, kind: 'green' | 'orange' | 'grey', cx: number, cy: number, str: string, alpha = 1, sc = 1) => L.text(key, cx, cy, str, { size: Math.max(1, LBL * s * K * sc), color: '#ffffff', stroke: STROKE[kind], sw: 10 * s * K * sc, sh: 5 * s * K * sc, alpha: A * alpha });
    const coinBtn = (key: string, kind: 'green' | 'orange' | 'grey', r: R, amount: string, onClick: () => void, shakeAt = 0, vis = 1) => {   // r: a rectangle already in screen pixels (from D); vis: 0..1, how much of it has arrived
        const age = shakeAt ? performance.now() - shakeAt : 1e9, sh = age < 450 ? Math.sin(age / 28) * 14 * s * K * (1 - age / 450) : 0, rr: R = { ...r, x: r.x + sh };
        button(key, kind, rr, '', onClick);
        const dy = z.pressed === key ? 6 * s : 0, cy = rr.y + dy * K + rr.h * 0.45, isz = rr.h * 0.54, iw = isz * 0.93, tw = width(amount, LBL) * s * K * vis, gap = 16 * s * K * vis, x0 = rr.x + (rr.w - (iw + gap + tw)) / 2;   // the icon and the number are one group, centred on the button
        P.pic(key + 'c', 'bf_ic_coin', { x: x0, y: cy - isz / 2, w: iw, h: isz }, { alpha: vis });
        label(key + 'n', kind, x0 + iw + gap + tw / 2, cy, amount, vis, vis);
    };
    const wordBtn = (key: string, kind: 'green' | 'orange' | 'grey', r: R, word: string, onClick: () => void) => {   // a button with a word on it, in the same label style
        button(key, kind, r, '', onClick); const dy = z.pressed === key ? 6 * s : 0;
        label(key + 'w', kind, r.x + r.w / 2, r.y + dy * K + r.h * 0.45, word);
    };
    if (id !== 'ovWell') (window as unknown as { __popA?: number }).__popA = Math.max((window as unknown as { __popA?: number }).__popA ?? 0, A);   // how solid the pop-up is while it pops in / out: the 3D layer behind it fades with it, and is cut out only once the pop-up is solid
    const popR = id === 'ovPause' ? D(99, 400, 882, 800) : id === 'ovPlayOn' ? D(17, 110, 1047, 1330) : id === 'ovBuy' ? D(17, 330, 1047, 1155) : null;   // (the 3D layer is cut out behind the pop-up body, so nothing shows through it)
    (window as unknown as { __popRect?: unknown }).__popRect = popR && !out ? { x: popR.x + c.o.left, y: popR.y + c.o.top, w: popR.w, h: popR.h, r: 70 * s * K, top: id === 'ovPause' || id === 'ovBuy' ? ((q) => ({ x: q.x + c.o.left, y: q.y + c.o.top, w: q.w, h: q.h }))(id === 'ovBuy' ? D(97, 392, 878, 80) : D(143, 332, 778, 197)) : undefined } : null;
    const S = ff().save ?? {};
    g.fillStyle(0x040c1c, (id === 'ovWell' ? 0.84 * Math.min(1, (cur ? (performance.now() - cur.t0) / 1000 : 9) / 0.45) : 0.88) * A).fillRect(0, 0, c.w, c.h);   // (the WELL DONE screen dims in slowly and lets the tank show a little through)
    if (!out) z.add('ovBlock', { x: 0, y: 0, w: c.w, h: c.h }, {});   // swallows taps behind the pop-up
    const add = (key: string, r: R, fn: () => void) => { if (!out) z.add(key, r, { click: fn }); };

    if (id === 'ovPause') {   // SETTING HOME.png: white frame, the curved ribbon, the three switches, Restart + Resume
        P.nine('sF', 'bf_pop_base', D(99, 395, 882, 800), [80, 80, 80, 80], { k: 0.9 * s });
        P.pic('sR', 'bf_rib_blue', D(143, 332, 778, 197));
        arcText('sT', 'Settings', 540, 421, 395, TITLE, 778, 46);
        const xr = D(872, 376, 119, 128); P.pic('sX', 'bf_btn_x', { ...xr, y: xr.y + (z.pressed === 'sX' ? 2 : 0) }); add('sX', xr, click('bXPause'));
        const tg = [{ k: 'sSnd', id: 'bSnd', x: 181, on: !S.muted, ic: ['ic_sound', 'ic_sound_off'], w: 143, h: 135 }, { k: 'sMus', id: 'bMus', x: 436, on: !S.noMusic, ic: ['ic_music', 'ic_music_off'], w: 121, h: 147 }, { k: 'sVib', id: 'bVib', x: 691, on: !S.noVib, ic: ['ic_vib_on', 'ic_vib_off'], w: 148, h: 151 }];
        for (const o of tg) {
            const dy = z.pressed === o.k ? 6 : 0;
            P.pic(o.k + 'b', o.on ? 'bf_btn_sq_blue' : 'bf_btn_sq_grey', D(o.x, 597 + dy, 217, 226));
            P.pic(o.k + 'i', 'bf_' + (o.on ? o.ic[0] : o.ic[1]), D(o.x + 108.5 - o.w / 2, 597 + dy + 113 - 10 - o.h / 2, o.w, o.h));
            add(o.k, D(o.x, 597, 217, 226), click(o.id));
        }
        button('sRs', 'orange', D(183, 893, 150, 160), '', click('bRestart1'), undefined, 'ic_restart');
        button('sRe', 'green', D(361, 893, 537, 160), 'Resume', click('bResume'), 330);
        const ver = String(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '');
        text('sVer', ver, 540, 1124, 208, { fill: '#7fb0dc', stroke: '#e8f6ff', sw: 0, sh: 0 }, fit('0.01.03(2)', 208) * 1.4);   // centred between the buttons and the bottom of the card
        if (!out) {   // developer tools: the version text tapped 10 times (or ?dev=1) shows the level list and the reset
            z.add('sDevTap', D(340, 1070, 400, 110), { click: () => { devOpen = true; } });   // one tap on the version text opens the developer tools
            if (devOpen || DEV_FLAG) {
                button('sDLv', 'blue', D(183, 1250, 340, 110), 'Levels', click('bLevels1'), 230);
                button('sDRs', 'orange', D(557, 1250, 340, 110), 'Reset', click('bReset'), 250);
                const dev = (k: 'devWin' | 'devLose') => () => (window as unknown as { __ff?: Record<string, (() => void) | undefined> }).__ff?.[k]?.();
                button('sDWn', 'green', D(183, 1380, 340, 110), 'Win', dev('devWin'), 170);
                button('sDLs', 'orange', D(557, 1380, 340, 110), 'Lose', dev('devLose'), 190);
                const fx = (window as unknown as { __ff?: { devEvents?: string[]; devEvent?: (n: string) => void } }).__ff;   // the events: one button each, to start it right now
                (fx?.devEvents ?? []).forEach((n, i) => button('sDE' + i, i % 2 ? 'blue' : 'green', D(40 + (i % 4) * 255, 1520 + Math.floor(i / 4) * 105, 240, 90), n, () => fx?.devEvent?.(n), 150));
            }
        }
        return;
    }

    if (id === 'ovLose') {   // Level failed (2).png: the title with depth, the level, the scene, one green Retry button
        const lv = ff().G?.level ?? 0;
        P.pic('lT', 'bf_txt_levelfailed', D(90, 234, 889, 164));   // the title picture (855 x 158)
        text('lL', `Level ${lv}`, 540, 434, 235, WHITE, fit('Level 5', 235 - WHITE.sw));
        const fh = 520, fw = fh * 432 / 409;   // the crying fish, bobbing a little
        P.pic('lFish', 'bf_fish_fail', D(540 - fw / 2, 700 + Math.sin(t * 1.8) * 10, fw, fh));
        button('lR', 'green', D(306, 1376, 469, 147), 'Retry', click('bRetry'), 239);
        return;
    }

    if (id === 'ovPlayOn') {   // outofspace.png: the frame, the ribbon, the tank holding the 7 fish of the full Backup, one line, one button
        const top = 448, bottom = 1435;
        P.nine('pf', 'bf_pop_base', D(58, top, 965, bottom - top), [80, 80, 80, 80], { k: 0.9 * s });
        P.pic('pFish', 'bf_fish_think', D(290, 110 + Math.sin(t * 1.8) * 8, 360, 285));   // the puzzled fish over the ribbon
        P.pic('pr', 'bf_rib_blue', D(97, 390, 878, 222));   // placed so the ribbon's inner band lands on the fake's band
        arcText('pT', 'Out of space!', 543, 500, 600, TITLE, 878, 52);
        const xr = D(921, 454, 114, 120); P.pic('pX', 'bf_btn_x', { ...xr, y: xr.y + (z.pressed === 'pX' ? 2 : 0) }); add('pX', xr, click('bNoPlayOn'));
        P.nine('pPan', 'bf_panel_in', D(100, 650, 880, 380), [60, 60, 60, 60], { k: 0.9 * s });   // the inner frame sits evenly between the ribbon above and the Play on button below
        // the Backup as it looks in the game: the murky cell behind, the fish, then the steel frame and the bars in front (both pictures are drawn once from the same pieces as the game)
        const CW = 1560, CH = 355;
        if (!c.scene.textures.exists('tk_cage_b')) { const cb = ff().cageCanvas?.(CW, CH, 'back'), cf = ff().cageCanvas?.(CW, CH, 'front'); if (cb && cf) { c.scene.textures.addCanvas('tk_cage_b', cb); c.scene.textures.addCanvas('tk_cage_f', cf); } }
        const cage = c.scene.textures.exists('tk_cage_b'), tk = !cage && c.scene.textures.exists('tk_back') ? c.scene.textures.get('tk_back').getSourceImage() as HTMLImageElement : null, ar = cage ? CW / CH : tk ? tk.width / tk.height : 2.2, tw = 780, th = tw / ar, tx = 540 - tw / 2, ty = 672;
        P.pic('pv1', cage ? 'tk_cage_b' : 'tk_back', D(tx, ty, tw, th));
        const F = ff(), items = (F.G?.backup ?? []).slice(0, 7), cw = (tw * (cage ? 0.972 : 0.9)) / 7;
        items.forEach((it, i) => {
            const src = it.filler ? '' : ((it.junk ? F.THUMB?.[it.id ?? ''] : F.THUMB?.[F.SPECIES?.[it.type ?? 0]?.id ?? '']) ?? ''), fx = tx + tw * (cage ? 0.014 : 0.05) + cw * i;
            const wide = it.id === 'squid' && !it.filler ? (F.THUMB?.['squid_wide'] ?? '') : '';   // the octopus takes three cells: its picture is wide and spread over all three
            if (wide) P.image('pvf' + i, wide, (() => { const ar = parseFloat(F.THUMB?.['squid_wide_ar'] ?? '1.5') || 1.5, nL = items[i - 1]?.filler ? 1 : 0, nR = items[i + 1]?.filler ? 1 : 0, w = Math.min(cw * (1 + nL + nR) * 0.96, th * 0.8 * ar) * 0.9, h = w / ar; return D(fx + cw / 2 + (nR - nL) * cw / 2 - w / 2 + (nL ? 0 : 0), ty + th * 0.5 - h / 2 + Math.sin(t * 2 + i) * 2, w, h); })());
            else if (src) P.image('pvf' + i, src, cage ? D(fx + cw * 0.08, ty + th * 0.2 + Math.sin(t * 2 + i) * 3, cw * 0.84, th * 0.56) : D(fx + cw * 0.06, ty + th * 0.36 + Math.sin(t * 2 + i) * 3, cw * 0.88, th * 0.5));
        });
        P.pic('pv3', cage ? 'tk_cage_f' : 'tk_front', D(tx, ty, tw, th));
        const cap = 'Clear the tank to keep playing!', capY = (ty + th + 1025) / 2;
        text('pL', cap, 540, capY, 780, { fill: '#ffffff', stroke: '#0d2a5c', sw: 9, sh: 4 }, Math.min(64, fit(cap, 780 - 9)));
        const poCost = ((ff() as unknown as { coin?: { COIN?: { playOn?: number } } }).coin?.COIN?.playOn) ?? 900, poShake = (window as unknown as { __poShake?: number }).__poShake ?? 0;
        coinHeader();
        coinBtn('pA', coinsNow() >= poCost ? 'green' : 'grey', D(100, 1110, 430, 170), String(poCost), click('bPlayOn'), poShake);   // pay with coins ...
        wordBtn('pAd', 'orange', D(550, 1110, 430, 170), 'Play on', click('bPlayOnAd')); P.pic('pAdI', 'bf_ic_ad', D(878, 1072, 96, 104));   // ... or watch an advertisement
        text('pN', 'No thanks', 540, 1340, 220, { fill: '#e8f4ff', stroke: '#0d3d7a', sw: 8, sh: 3 }); add('pNo', D(400, 1305, 280, 70), click('bNoPlayOn'));
        return;
    }

    if (id === 'ovWell') {   // Well done.png, rebuilt: the LEVEL COMPLETE words (the 3D layer) have docked at the top; then the dim comes in and the rest arrives one piece after another
        const Wn = (window as unknown as { __well?: WellState | null }).__well ?? lastWell; if (!Wn) return; lastWell = Wn;
        const age = cur ? (performance.now() - cur.t0) / 1000 / 0.62 : 9, cl = (u: number) => Math.max(0, Math.min(1, u)), eo = (u: number) => 1 - Math.pow(1 - cl(u), 3);   /* (the whole build-up is played 38% faster than it is written below) */
        const pop = (d: number, dur = 0.5) => { const u = cl((age - d) / dur); return { sc: u <= 0 ? 0.001 : backOut(u), a: Math.min(1, u * 3.2), u }; };
        const sd = (x: number, y: number, w: number, h: number, sc: number): R => D(x + (w / 2) * (1 - sc), y + (h / 2) * (1 - sc), w * sc, h * sc);
        const hd = eo((age - 0.25) / 0.55);
        coinHeader((1 - hd) * -170);   // the coins slide down from the top
        const pL = pop(0.5, 0.45); text('wL', `Level ${Wn.level}`, 540, 400, 280, WHITE, 80 * pL.sc);
        // the standing tank rises from below and floats; the obstacle floats inside it
        const TW = 452, TH = 800, TX = 540 - TW / 2, TY = 446, pT = pop(0.6, 0.75), rise = (1 - eo((age - 0.6) / 0.75)) * 150, bobT = 0;   // the tank stands still once it has risen
        const tcx = TX + TW / 2, tcy = TY + TH / 2 + rise + bobT, tk = (fx: number, fy: number, fw: number, fh: number): R => D(tcx + (fx - 0.5) * TW * pT.sc, tcy + (fy - 0.5) * TH * pT.sc, fw * TW * pT.sc, fh * TH * pT.sc);   // a rectangle given in fractions of the tank picture, following its pop-in
        if (!c.scene.textures.exists('bf_wellwater')) {   // the water of the tank, made to look like the water of the target tanks: lighter under the surface, deep blue below, darker at the sides for volume, a bright line at the surface
            const cv = document.createElement('canvas'); cv.width = 384; cv.height = 590; const q = cv.getContext('2d')!;
            const gr = q.createLinearGradient(0, 0, 0, 590); gr.addColorStop(0, '#59c2ea'); gr.addColorStop(0.18, '#2f9bd6'); gr.addColorStop(0.55, '#1a72b8'); gr.addColorStop(1, '#0d3f86'); q.fillStyle = gr; q.fillRect(0, 0, 384, 590);
            const sg = q.createLinearGradient(0, 0, 384, 0); sg.addColorStop(0, 'rgba(4,28,80,0.55)'); sg.addColorStop(0.16, 'rgba(4,28,80,0)'); sg.addColorStop(0.84, 'rgba(4,28,80,0)'); sg.addColorStop(1, 'rgba(4,28,80,0.55)'); q.fillStyle = sg; q.fillRect(0, 0, 384, 590);
            const sf = q.createLinearGradient(0, 0, 0, 46); sf.addColorStop(0, 'rgba(255,255,255,0.55)'); sf.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = sf; q.fillRect(0, 0, 384, 46);
            for (let i = 0; i < 70; i++) { const x = (i * 97) % 384, y = 40 + ((i * 211) % 520), r = 1 + (i % 3) * 0.8; q.fillStyle = `rgba(255,255,255,${0.10 + (i % 4) * 0.05})`; q.beginPath(); q.arc(x, y, r, 0, Math.PI * 2); q.fill(); }
            c.scene.textures.addCanvas('bf_wellwater', cv);
            const rc = document.createElement('canvas'); rc.width = 120; rc.height = 540; const rq = rc.getContext('2d')!;   // one slanted shaft of light
            const rg = rq.createLinearGradient(0, 0, 0, 540); rg.addColorStop(0, 'rgba(235,250,255,0.55)'); rg.addColorStop(0.7, 'rgba(200,240,255,0.18)'); rg.addColorStop(1, 'rgba(200,240,255,0)'); rq.fillStyle = rg; rq.beginPath(); rq.moveTo(30, 0); rq.lineTo(90, 0); rq.lineTo(120, 540); rq.lineTo(0, 540); rq.closePath(); rq.fill();
            c.scene.textures.addCanvas('bf_wellray', rc);
        }
        const ww = (window as unknown as { __wellWater?: { cv: HTMLCanvasElement } | null }).__wellWater;   // the water is drawn live by a shader (game/src/main.js, wellWaterTick); the painted gradient is only the stand-in until it is ready
        if (ww) { const tx = c.scene.textures; if (!tx.exists('wellWaterLive')) tx.addCanvas('wellWaterLive', ww.cv); else (tx.get('wellWaterLive') as Phaser.Textures.CanvasTexture).refresh(); }
        P.pic('wWb', ww ? 'wellWaterLive' : 'bf_wellwater', tk(0.072, 0.082, 0.856, 0.74), { alpha: pT.a });
        P.pic('wTk', 'bf_pic_tank_frame', sd(TX, TY + bobT + rise, TW, TH, pT.sc), { alpha: pT.a });   // the frame, the glass walls, the base and the sand: the window for the water is cut out of it
        const live = (window as unknown as { __fvWell?: { on: boolean; cv: HTMLCanvasElement } | null }).__fvWell, pO = pop(1.1, 0.75);
        const fa = Wn.fullAt ? (performance.now() - Wn.fullAt) / 1000 : -1, filled = fa >= 0;
        if (live && live.on) { const tx = c.scene.textures; if (!tx.exists('wellLive')) tx.addCanvas('wellLive', live.cv); else (tx.get('wellLive') as Phaser.Textures.CanvasTexture).refresh(); P.pic('wObs', 'wellLive', sd(540 - 215 + Math.sin(t * 1.1) * 10, 810 - 215 + Math.sin(t * 1.6) * 16 + bobT + rise, 430, 430, pO.sc), { alpha: pO.a }); }
        { const wf = (window as unknown as { __wellFish?: { cv: HTMLCanvasElement } | null }).__wellFish;   // nothing left to unlock: the fish the player just caught swim in the tank (drawn live in game/src/main.js, wellFishTick)
            if (Wn.soon && wf) { const tx = c.scene.textures; if (!tx.exists('wellFishLive')) tx.addCanvas('wellFishLive', wf.cv); else (tx.get('wellFishLive') as Phaser.Textures.CanvasTexture).refresh(); P.pic('wFl', 'wellFishLive', tk(0.072, 0.082, 0.856, 0.74), { alpha: pO.a }); } }
        for (let i = 0; i < 7; i++) {   // small bubbles rise through the water (they pass in front of the obstacle)
            const ph = (t * 0.11 + i * 0.147) % 1, bx = 540 + (i % 2 ? -1 : 1) * (48 + ((i * 41) % 118)) + Math.sin(t * 2 + i) * 8, by = TY + TH * 0.82 - ph * TH * 0.68 + bobT + rise, bs = 20 + (i % 3) * 11;
            P.pic('wBb' + i, 'tk_bubble', D(bx - bs / 2, by - bs / 2, bs, bs), { alpha: Math.sin(Math.PI * ph) * 0.95 * pT.a });   // the same soft bubble picture as the loading screen
        }
        if (!c.scene.textures.exists('bf_star3d')) {   // a glossy four-point star: a soft glow, a bevelled body that is white in the middle and ice-blue at the tips, a small bright core
            const cv = document.createElement('canvas'); cv.width = cv.height = 160; const q = cv.getContext('2d')!; q.translate(80, 80);
            const gl = q.createRadialGradient(0, 0, 4, 0, 0, 78); gl.addColorStop(0, 'rgba(210,245,255,0.75)'); gl.addColorStop(0.35, 'rgba(150,215,255,0.28)'); gl.addColorStop(1, 'rgba(120,200,255,0)'); q.fillStyle = gl; q.beginPath(); q.arc(0, 0, 78, 0, Math.PI * 2); q.fill();
            const star = (r: number, w: number) => { q.beginPath(); for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2, ax = Math.cos(a), ay = Math.sin(a), bx = Math.cos(a + Math.PI / 4) * w, by = Math.sin(a + Math.PI / 4) * w, cx2 = Math.cos(a + Math.PI / 2), cy2 = Math.sin(a + Math.PI / 2); if (i === 0) q.moveTo(ax * r, ay * r); q.quadraticCurveTo(bx, by, cx2 * r, cy2 * r); } q.closePath(); };
            q.shadowColor = 'rgba(40,120,220,0.7)'; q.shadowBlur = 8; q.shadowOffsetY = 3; const bg = q.createRadialGradient(0, 0, 2, 0, 0, 56); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#e6f8ff'); bg.addColorStop(1, '#8fd0ff'); q.fillStyle = bg; star(56, 9); q.fill();
            q.shadowColor = 'transparent'; q.lineWidth = 2; q.strokeStyle = 'rgba(255,255,255,0.9)'; q.stroke(); q.fillStyle = 'rgba(255,255,255,0.95)'; q.beginPath(); q.arc(0, 0, 7, 0, Math.PI * 2); q.fill();
            c.scene.textures.addCanvas('bf_star3d', cv);
        }
        if (!c.scene.textures.exists('bf_glassfront')) {   // the glass in front of the obstacle: two soft white streaks, painted once
            const cv = document.createElement('canvas'); cv.width = 226; cv.height = 400; const q = cv.getContext('2d')!;
            const streak = (x: number, y0: number, y1: number, w: number, a: number) => { const gr = q.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.18, `rgba(255,255,255,${a})`); gr.addColorStop(0.8, `rgba(255,255,255,${a * 0.7})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = gr; q.beginPath(); q.roundRect(x, y0, w, y1 - y0, w / 2); q.fill(); };
            streak(26, 70, 270, 13, 0.42); streak(190, 90, 250, 7, 0.28);
            c.scene.textures.addCanvas('bf_glassfront', cv);
        }
        P.pic('wGl', 'bf_glassfront', sd(TX, TY + bobT + rise, TW, TH, pT.sc), { alpha: 0.85 * pT.a });
        if (filled) for (let i = 0; i < 4; i++) { const tw = Math.max(0, Math.sin(t * 2.4 + i * 1.7)), sx = 540 + (i % 2 ? 1 : -1) * (250 + (i >> 1) * 18), sy = 570 + i * 130 + bobT; P.pic('wSp' + i, 'bf_star3d', D(sx - 44 * tw, sy - 44 * tw, 88 * tw, 88 * tw), { alpha: Math.min(1, tw * 1.4) * Math.min(1, fa / 0.5) }); }
        if (filled) {   // the moment it is full: glossy stars burst out of the tank (no ring of light)
            for (let i = 0; i < 9; i++) { const q2 = Math.min(1, fa / 1.15), e2 = 1 - Math.pow(1 - q2, 3), an = (i / 9) * Math.PI * 2 + 0.4, dist = (150 + (i % 3) * 55) * e2, sz = (70 - (i % 3) * 12) * (1 - 0.35 * q2); P.pic('wSt' + i, 'bf_star3d', D(540 + Math.cos(an) * dist - sz / 2, 810 + Math.sin(an) * dist * 1.25 - sz / 2, sz, sz), { alpha: 1 - q2 }); }   // glossy stars burst out of the tank, once
        }
        if (Wn.kind || Wn.soon) {
            const pN = pop(1.5, 0.45), pU = pop(1.7, 0.5), pr = Wn.soon ? 1 : (Wn.pr ?? Wn.p0), BX = 540 - 260, BY = 1318;
            text('wN', Wn.title, 540, 1286, 460, WHITE, 60 * pN.sc);
            if (!c.scene.textures.exists('bf_pbar_frame')) {   // the progress bar, drawn with depth: a drop shadow, a white rim with a dark outline, a dark trough with an inner shadow
                const cv = document.createElement('canvas'); cv.width = 540; cv.height = 112; const q = cv.getContext('2d')!;
                q.fillStyle = 'rgba(0,10,40,0.45)'; q.beginPath(); q.roundRect(10, 16, 520, 90, 45); q.fill();
                q.fillStyle = '#0c2a5c'; q.beginPath(); q.roundRect(6, 6, 528, 92, 46); q.fill();
                const rim = q.createLinearGradient(0, 8, 0, 96); rim.addColorStop(0, '#ffffff'); rim.addColorStop(1, '#bcd6f5'); q.fillStyle = rim; q.beginPath(); q.roundRect(10, 10, 520, 84, 42); q.fill();
                const tr = q.createLinearGradient(0, 18, 0, 86); tr.addColorStop(0, '#0a2a78'); tr.addColorStop(0.5, '#1654b8'); tr.addColorStop(1, '#2468d0'); q.fillStyle = tr; q.beginPath(); q.roundRect(18, 18, 504, 68, 34); q.fill();
                q.fillStyle = 'rgba(0,10,60,0.5)'; q.beginPath(); q.roundRect(18, 18, 504, 20, [34, 34, 6, 6]); q.fill();
                c.scene.textures.addCanvas('bf_pbar_frame', cv);
                const fc = document.createElement('canvas'); fc.width = 160; fc.height = 68; const f = fc.getContext('2d')!;   // the fill: bright cyan on top, deeper blue below, a gloss strip and a soft rim
                const fg = f.createLinearGradient(0, 0, 0, 68); fg.addColorStop(0, '#9af6ff'); fg.addColorStop(0.45, '#22c8ff'); fg.addColorStop(1, '#0c8ae8'); f.fillStyle = fg; f.beginPath(); f.roundRect(1, 1, 158, 66, 33); f.fill();
                f.strokeStyle = '#0a5fc0'; f.lineWidth = 2.5; f.stroke(); f.fillStyle = 'rgba(255,255,255,0.55)'; f.beginPath(); f.roundRect(14, 7, 132, 15, 8); f.fill();
                c.scene.textures.addCanvas('bf_pbar_fill', fc);
            }
            if (!c.scene.textures.exists('bf_unl2')) {   // UNLOCKED !: the artist's letters, given a warm gradient, a dark outline and a drop shadow so they read like the other game titles
                const src = c.scene.textures.get('bf_txt_unlocked').getSourceImage() as HTMLImageElement, pad = 16, W2 = src.width + pad * 2, H2 = src.height + pad * 2 + 10, cv = document.createElement('canvas'); cv.width = W2; cv.height = H2; const q = cv.getContext('2d')!;
                const sil = document.createElement('canvas'); sil.width = src.width; sil.height = src.height; const sq = sil.getContext('2d')!; sq.drawImage(src, 0, 0); sq.globalCompositeOperation = 'source-in'; sq.fillStyle = '#8a4d00'; sq.fillRect(0, 0, src.width, src.height);
                for (let a = 0; a < 28; a++) { const an = (a / 28) * Math.PI * 2; q.drawImage(sil, pad + Math.cos(an) * 6, pad + 10 + Math.sin(an) * 6); }
                q.globalAlpha = 0.5; q.drawImage(sil, pad, pad + 16); q.globalAlpha = 1;
                const lt = document.createElement('canvas'); lt.width = src.width; lt.height = src.height; const lq = lt.getContext('2d')!; lq.drawImage(src, 0, 0); lq.globalCompositeOperation = 'source-atop';
                const lg = lq.createLinearGradient(0, 0, 0, src.height); lg.addColorStop(0, '#fff7a0'); lg.addColorStop(0.55, '#ffe21a'); lg.addColorStop(1, '#ffae12'); lq.fillStyle = lg; lq.fillRect(0, 0, src.width, src.height);
                lq.fillStyle = 'rgba(255,255,255,0.35)'; lq.fillRect(0, 0, src.width, src.height * 0.32);
                q.drawImage(lt, pad, pad + 4); c.scene.textures.addCanvas('bf_unl2', cv);
            }
            if (!c.scene.textures.exists('bf_halo')) { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const q = cv.getContext('2d')!; const g2 = q.createRadialGradient(64, 64, 4, 64, 64, 64); g2.addColorStop(0, 'rgba(255,240,140,0.95)'); g2.addColorStop(1, 'rgba(255,200,60,0)'); q.fillStyle = g2; q.fillRect(0, 0, 128, 128); c.scene.textures.addCanvas('bf_halo', cv); }
            if (filled) {   // UNLOCKED !: it pops in once and then stands still (no idle swell, no flicker)
                const k2 = backOut(cl(fa / 0.5)), UW = 560, UH = (UW * (69 + 42)) / (478 + 32);
                P.pic('wUh', 'bf_halo', D(540 - 330, 1366 - 120, 660, 240), { alpha: cl(fa / 0.4) * 0.45 });
                P.pic('wU', 'bf_unl2', sd(540 - UW / 2, 1366 - UH / 2, UW, UH, k2));
            } else {   // the bar: the cyan fill grows (a spark rides its tip), the percent in the middle bumps while it is moving
                const moving = Wn.pr !== undefined && Wn.pr > Wn.p0 + 0.002 && Wn.pr < Wn.p1 - 0.002, fw = Math.max(64, (504 - 8) * pr);
                P.pic('wPf', 'bf_pbar_frame', sd(BX, BY, 540, 112, pU.sc), { alpha: pU.a });
                P.nine('wPi', 'bf_pbar_fill', sd(BX + 22, BY + 22, fw, 68, pU.sc), [33, 33, 33, 33], { alpha: pU.a, k: 0.98 * s });
                const tipX = BX + 22 + fw - 18; if (moving) P.pic('wPs', 'bf_star3d', sd(tipX - 36, BY + 56 - 36, 72, 72, pU.sc), { alpha: pU.a * (0.7 + 0.3 * Math.sin(t * 9)) });
                if (Wn.soon) text('wPp', 'Coming Soon', 540, BY + 57, 330, { fill: '#ffffff', stroke: '#0a3a8e', sw: 8, sh: 3 }, 44 * pU.sc);
                else text('wPp', `${Math.round(pr * 100)}%`, 540, BY + 57, 140, { fill: '#ffffff', stroke: '#0a3a8e', sw: 8, sh: 3 }, 46 * pU.sc * (moving ? 1 + 0.07 * Math.sin(t * 14) : 1));
            }
        }
        const open = !Wn.claimed, pulse = 1 + 0.03 * Math.sin(t * 3.4), u2 = cl((age - 1.85) / 0.6), u1 = cl((age - 2.2) / 0.6), v2 = Math.min(1, u2 * 4), v1 = Math.min(1, u1 * 4);
        const offR = (1 - backOut(u2)) * 640, offL = -(1 - backOut(u1)) * 640;   // the x2 reward slides in from the right first, then the plain coin button from the left (with a small settle)
        const GY = 1520, GX = 56, GW = 420, XX = 584, XW0 = 440;   // lower than before, and a wide gap between the two buttons
        if (u2 > 0) {
            const XW = XW0 * pulse, XH = (XW * 254) / 466, XR = D(XX + (XW0 - XW) / 2 + offR, GY - 24 + (240 - XH) / 2, XW, XH);   // the x2 button: one picture with its own "x2 Reward" tag
            P.pic('wA', 'bf_btn_x2', { ...XR, y: XR.y + (z.pressed === 'wA' && open ? 6 * s : 0) }, { alpha: (open ? 1 : 0.55) * v2 }); if (open && u2 >= 1) add('wA', XR, click('bWellAd'));
            const cy = XR.y + XR.h * 0.36 + (z.pressed === 'wA' && open ? 6 * s : 0), isz = XR.h * 0.36, iw = isz * 0.93, str = '+' + Wn.base * 2, tw = width(str, LBL) * s * K * v2, gap = 16 * s * K * v2, x0 = XR.x + (XR.w - (iw + gap + tw)) / 2; P.pic('wAc', 'bf_ic_coin', { x: x0, y: cy - isz / 2, w: iw, h: isz }, { alpha: v2 });
            label('wAn', 'orange', x0 + iw + gap + tw / 2, cy, str, v2, v2);
            P.pic('wAd', 'bf_ic_ad', D(XX + XW0 - 92 + offR, GY - 62 + Math.sin(t * 5) * 3, 100, 108), { alpha: v2 });
        }
        if (u1 > 0) coinBtn('wG', open ? 'green' : 'grey', D(GX + offL, GY, GW, 165), '+' + Wn.base, open && u1 >= 1 ? click('bWellCoin') : () => {}, 0, v1);
        if (Wn.claimed) {   // five coins fly from the button you pressed up to the counter, each with a short trail; the header bounces as each one lands (see coinHeader)
            const fly = (window as unknown as { __coinFly?: { n: number; d0: number; gap: number; dur: number } }).__coinFly ?? { n: 5, d0: 0.06, gap: 0.1, dur: 0.6 }, ca = (performance.now() - Wn.claimed) / 1000;
            const ox = Wn.mult > 1 ? XX + XW0 * 0.3 : GX + GW * 0.3, oy = Wn.mult > 1 ? GY + 40 : GY + 70, ex = 850, ey = 104;
            const at = (i: number, u: number) => { const e = u * u * (3 - 2 * u), sw = (i % 2 ? 1 : -1) * (70 + i * 14); return { x: ox + (ex - ox) * e + Math.sin(u * Math.PI) * sw, y: oy + (ey - oy) * e - Math.sin(u * Math.PI) * 150 }; };
            for (let i = 0; i < fly.n; i++) {
                const u = cl((ca - fly.d0 - i * fly.gap) / fly.dur); if (u <= 0 || u >= 1) continue;
                for (let k = 5; k >= 1; k--) { const uu = cl(u - k * 0.035); if (uu <= 0) continue; const q = at(i, uu), tsz = 58 * (1 - k * 0.12); P.pic(`wCt${i}_${k}`, 'bf_ic_coin', D(q.x - tsz / 2, q.y - tsz / 2, tsz, tsz * 1.06), { alpha: 0.5 * (1 - k * 0.17) }); }   // the trail: older positions, smaller and fainter
                const q = at(i, u); P.pic('wCf' + i, 'bf_ic_coin', D(q.x - 33, q.y - 35, 66, 70), { alpha: 1 });
            }
        }
        return;
    }

    if (id === 'ovBuy') {   // Purchase NET.png: the frame, the ribbon with the booster's name, its picture on the water, one line, a coin button (3 boosters) and an advertisement button (1 booster)
        type BuyState = { kind: string; price: number; pack?: number }; const bw = (window as unknown as { __buy?: BuyState | null }).__buy ?? lastBuy; if (bw) lastBuy = bw;   // (the state is cleared the moment the pop-up closes, but the pop-up still fades out for 0.2 s: it keeps drawing what it showed)
        const kind = bw?.kind ?? 'hint', price = bw?.price ?? 0, shakeAt = (window as unknown as { __buyShake?: number }).__buyShake ?? 0;
        const INFO: Record<string, { name: string; ic: string; w: number; h: number; txt: string }> = { hint: { name: 'Hint', ic: 'nw_ic_hint', w: 256, h: 256, txt: 'Show the fish you need' }, tank: { name: 'Clear Tank', ic: 'nw_ic_net', w: 256, h: 256, txt: 'Fill the target tank' }, clear: { name: 'Clear Backup', ic: 'nw_ic_back', w: 256, h: 256, txt: 'Send Backup fish back' } };
        const info = INFO[kind] ?? INFO.hint;
        coinHeader();
        // laid out like the artist's Popup file: the blue body, the flat purple header, the picture across the full width, one line, then the two buttons
        // the shell, starfish, seaweed and bubbles behind the header, all drawn from the artist's pieces and moving a little (the seaweed sways from its root, the starfish and shell rock, the bubbles rise and fade)
        const DEC: [number, number, number, number, number, string][] = [[35, 668, 217, 66, 70, 'b'], [34, 368, 188, 55, 59, 'b'], [33, 503, 138, 48, 47, 'b'], [28, 423, 227, 241, 222, 'c'], [27, 214, 315, 160, 153, 's'], [26, 798, 269, 179, 153, 's'], [25, 380, 260, 171, 253, 'w'], [24, 687, 315, 166, 153, 's'], [23, 113, 331, 184, 215, 'w'], [22, 271, 276, 184, 215, 'w'], [21, 806, 329, 120, 184, 'w'], [20, 648, 279, 120, 184, 'w'], [18, 548, 241, 136, 177, 'w']];
        for (const [di, dx, dy, dw, dh, dk] of DEC) {
            let ox = 0, oy = 0, rot = 0, al = 1;
            if (dk === 'w') { rot = Math.sin(t * 1.6 + di * 1.7) * 0.07; const px = dx + dw / 2, py = dy + dh, cx = dx + dw / 2, cy = dy + dh / 2, rx = cx - px, ry = cy - py; ox = rx * Math.cos(rot) - ry * Math.sin(rot) - rx; oy = rx * Math.sin(rot) + ry * Math.cos(rot) - ry; }   /* the seaweed turns about its root */
            else if (dk === 's') { rot = Math.sin(t * 1.1 + di) * 0.05; oy = Math.sin(t * 1.4 + di) * 2.5; }
            else if (dk === 'c') { oy = Math.sin(t * 1.2) * 1.5; }
            else { const u = ((t * 0.16 + di * 0.37) % 1); oy = -u * 70; ox = Math.sin(t * 2 + di) * 5; al = Math.min(1, u * 5, (1 - u) * 3); }   /* a bubble rises, sways and fades out, then comes again */
            P.pic('bd' + di, 'bf_buy_d' + di, D(dx + ox, dy + oy, dw, dh), { alpha: al, rot } as { alpha?: number });
        }
        P.pic('bF', 'bf_buy_frame', D(50, 400, 981, 1085));   // the body, cut out of the artist's NET picture (the top rows, the flat sides and the bottom rows)
        P.pic('bW', 'bf_buy_pic', D(70, 593, 940, 499));
        P.pic('bSt', 'bf_fx_stars', D(318, 604, 444, 420), { alpha: 0.85 });   // the sparkles stand still, inside the picture
        P.pic('bR', 'bf_buy_rib', D(50, 400, 981, 240));   // the ribbon with its light rim, drawn over the picture's top corners as in the artist's picture
        text('bT', info.name, 540, 500, 600, TITLE, Math.min(96, fit(info.name, 600 - 9)));
        const xr = D(906, 458, 120, 124); P.pic('bX', 'bf_btn_x', { ...xr, y: xr.y + (z.pressed === 'bX' ? 2 : 0) }); add('bX', xr, click('bBuyX'));
        const iw = info.w * 1.3, ih = info.h * 1.3;   // the game's own booster picture (the same one as on the booster button), standing still
        P.pic('bIc', info.ic.startsWith('nw_') ? info.ic : 'bf_' + info.ic, D(520 - iw / 2, 843 - ih / 2, iw, ih));
        P.pic('bX3b', 'bf_badge_count', D(612, 860, 146, 166));   // the "x3" badge from the artist's popup file
        text('bX3', 'x' + (bw?.pack ?? 3), 685, 935, 120, { fill: '#ffffff', stroke: '#6b3a00', sw: 9, sh: 4 }, 70);
        text('bD', info.txt, 540, 1152, 780, WHITE, Math.min(62, fit(info.txt, 780 - 9)));
        coinBtn('bBc', coinsNow() >= price ? 'green' : 'grey', D(125, 1212, 393, 180), String(price), click('bBuyCoin'), shakeAt);
        wordBtn('bBa', 'orange', D(562, 1212, 393, 180), 'GET 1', click('bBuyAd')); P.pic('bAd', 'bf_ic_ad', D(872, 1174, 96, 104));
        return;
    }

    if (id === 'ovIntro') {   // BUBBLE FISh_Popup_New feature.psd: the title picture, the name, light and stars behind a big picture, a cream board, "Tap to continue"
        const title = txt('introTitle'), body = txt('introTxt'), img = attr('introImg', 'src'), slug = ['squid', 'clam', 'swarm', 'pipe', 'frozen'].find((k) => title.toLowerCase().includes(k)), nm = slug ? c.scene.textures.get('bf_name_' + slug).getSourceImage() as HTMLImageElement : null;
        // everything pops in one after another (a soft overshoot, like the LEVEL words at the level start), then keeps floating a little so the pop-up never sits dead
        const age = cur ? (performance.now() - cur.t0) / 1000 : 9, pp = (d: number, dur = 0.55) => { const u = Math.max(0, Math.min(1, (age - d) / dur)); return { sc: u <= 0 ? 0.001 : backOut(u), a: Math.min(1, u * 3.2) }; };
        const sd = (x: number, y: number, w: number, h: number, sc: number, dy = 0): R => D(x + (w / 2) * (1 - sc), y + (h / 2) * (1 - sc) + dy, w * sc, h * sc);
        const pT = pp(0.05), pN = pp(0.18), pF = pp(0.1, 0.65), pB = pp(0.32);
        P.pic('fT', 'bf_nf_title', D(163, 226, 755, 124), { alpha: pT.a });   // 755 x 124 keeps the picture's own proportions (783 x 129); it was squashed to 755 x 101   // the title and the name stand still (no float, no pulse), they only fade in
        if (slug && nm) P.pic('fN', 'bf_name_' + slug, D(540 - nm.width / 2, 410, nm.width, nm.height), { alpha: pN.a });
        else { const tt = text('fN', title, 540, 472, 640, { fill: '#fee600', stroke: '#000000', sw: 8, sh: 6 }); tt.setAlpha(A * pN.a); }
        const bob = Math.sin(t * 2) * 6;
        const fv = (window as unknown as { __fv?: { on: boolean; cv: HTMLCanvasElement } }).__fv;
        if (fv && fv.on) {   // a live picture: the obstacle moves like it does in the game (game/src/main.js, FV)
            const tx = c.scene.textures; if (!tx.exists('fvLive')) tx.addCanvas('fvLive', fv.cv); else (tx.get('fvLive') as Phaser.Textures.CanvasTexture).refresh();
            P.pic('fImg', 'fvLive', sd(540 - 330, 830 - 330, 660, 660, pF.sc), { alpha: pF.a });
        } else if (img) P.image('fImg', cropped(img), sd(540 - 280, 821 - 280 + bob, 560, 560, pF.sc), { alpha: pF.a });
        P.pic('fStars', 'bf_fx_stars', D(243, 610, 592, 554), { alpha: 0.65 + 0.35 * Math.sin(t * 3) });
        boardText(L, s, 'fL', body, title, 1279, fit('Special bubbles are here! Clearing fish', 786 - WHITE.sw), 786, 70, A * pB.a, K, cx0, cy0);   // text only, no frame
        button('fC', 'green', D(320, 1470, 440, 150), 'Continue', click('bIntro'), 300);   // a real button, in place of the line "Tap to continue"
    }
}

/** the lines of a board's text: a plain greedy wrap to `maxW` design pixels (a line break after every sentence and balanced lines were tried and reverted) */
function layoutLines(body: string, size: number, maxW: number): string[] {
    const lines: string[] = [];
    for (const para of body.split('\n')) { let cur = ''; for (const w of para.split(/\s+/)) { const tl = cur ? cur + ' ' + w : w; if (width(tl, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = tl; } lines.push(cur); }
    return lines;
}

/** a board's text: lines from `layoutLines`, centred on `cxD`, the words equal to `hi` in another colour (green by default) */
function boardText(L: Layer, s: number, key: string, body: string, hi: string, cy: number, size: number, maxW: number, lineH: number, A = 1, K = 1, cx0 = 0, cy0 = 0, cxD = 540, hiColor = GREEN_TXT, anim?: (i: number) => { a: number; sc: number; dy: number }) {
    const lines = layoutLines(body, size, maxW), n = Math.min(lines.length, 4);
    lines.slice(0, 4).forEach((ln, i) => {
        const y = cy + (i - (n - 1) / 2) * lineH, at = hi ? ln.toLowerCase().indexOf(hi.toLowerCase()) : -1;
        const parts: [string, string][] = at >= 0 ? [[ln.slice(0, at), '#ffffff'], [ln.slice(at, at + hi.length), hiColor], [ln.slice(at + hi.length), '#ffffff']] : [[ln, '#ffffff']];
        const total = parts.reduce((a, p) => a + width(p[0], size), 0), an = anim ? anim(i) : { a: 1, sc: 1, dy: 0 }; let x = cxD - total / 2;
        parts.forEach((p, k) => { const xs = cxD + (x - cxD) * an.sc; if (p[0]) L.text(`${key}${i}_${k}`, cx0 + (xs * s - cx0) * K, cy0 + ((y + an.dy) * s - cy0) * K, p[0], { size: size * s * K, color: p[1], stroke: '#0d1a36', sw: 9 * s * K, sh: 3 * s * K, ox: 0, alpha: A * an.a }).setScale(an.sc); x += width(p[0], size); });
    });
    return n;
}

// the highlight guides fade in and out
let spotShown = false, spotT0 = 0, spotLeave = 0;

/** the highlight guide: dim everything, leave a hole round the real control; a cream board (backup) or the booster board whose round hole sits exactly on the real booster button; text to continue */
export function paintSpotBF(L: Layer, c: Ctx) {
    const sp = document.getElementById('spotOv'), on = !!sp && sp.classList.contains('show'), now = performance.now();
    if (on && !spotShown) { spotShown = true; spotT0 = now; spotLeave = 0; }
    if (!on && spotShown) { spotShown = false; spotLeave = now; }
    if (!sp || (!on && !(spotLeave && now - spotLeave < 220))) return;
    const A = on ? Math.min(1, (now - spotT0) / 320) : 1 - (now - spotLeave) / 220, rise = (1 - A) * 24;
    if (on) c.modal = true;
    const s = c.w / 1080, g = L.g, D = (x: number, y: number, w: number, h: number): R => ({ x: x * s, y: (y + rise) * s, w: w * s, h: h * s });
    const booster = sp.dataset.kind === 'booster', sel = sp.dataset.sel ?? '';
    const rel = (el: Element | null) => { const r = el ? el.getBoundingClientRect() : null; return r ? { x: r.left - c.o.left, y: r.top - c.o.top, w: r.width, h: r.height } : null; };
    let box = rel(document.getElementById('spotBox')), hole = box ? Math.min(parseFloat((document.getElementById('spotBox') as HTMLElement).style.borderRadius) || 20, box.w / 2, box.h / 2) : 0;
    const btn = booster && sel ? rel(document.querySelector(sel)) : null;
    if (btn) { const d = Math.max(btn.w, btn.h) - 2; box = { x: btn.x + btn.w / 2 - d / 2, y: btn.y + btn.h / 2 - d / 2, w: d, h: d }; hole = d / 2; }   // a circle exactly round the button
    g.fillStyle(0x040c1c, 0.82 * A);
    if (box) {
        g.fillRect(0, 0, c.w, Math.max(0, box.y)).fillRect(0, box.y + box.h, c.w, Math.max(0, c.h - box.y - box.h)).fillRect(0, box.y, Math.max(0, box.x), box.h).fillRect(box.x + box.w, box.y, Math.max(0, c.w - box.x - box.w), box.h);
        for (const [cx0, cy0, ox, oy, a0, a1] of [[box.x + hole, box.y + hole, box.x, box.y, -Math.PI / 2, -Math.PI], [box.x + box.w - hole, box.y + hole, box.x + box.w, box.y, 0, -Math.PI / 2], [box.x + box.w - hole, box.y + box.h - hole, box.x + box.w, box.y + box.h, Math.PI / 2, 0], [box.x + hole, box.y + box.h - hole, box.x, box.y + box.h, Math.PI, Math.PI / 2]] as [number, number, number, number, number, number][]) {
            g.beginPath(); g.moveTo(ox, oy); g.lineTo(cx0 + Math.cos(a0) * hole, cy0 + Math.sin(a0) * hole); g.arc(cx0, cy0, hole, a0, a1, true); g.closePath(); g.fillPath();
        }
    } else g.fillRect(0, 0, c.w, c.h);
    const body = txt('spotP'), cxm = box ? box.x + box.w / 2 : c.w / 2, cym = box ? box.y + box.h / 2 : c.h / 2;
    const tapText = (str: string, y: number, w: number, st: Style) => L.text('sbK', 540 * s, (y + rise) * s, str, { size: fit(str, w - st.sw) * s, color: st.fill, stroke: st.stroke, sw: st.sw * s, sh: st.sh * s, alpha: A });
    if (booster) {   // the cream board with a round holder bulging above its right end (public/ui/new/board_hole.png, made by scripts/make-tip-board.py: 1024 x 300, hole centre 904,142, diameter 176, thin holder ring): the real lit button shows through the hole
        const bcx = cxm / s, bcy = cym / s, dD = (box ? box.w + 2 : 150) / s, bw = 880, bh = 250, bx = 100, by = bcy - dD / 2 - 34 - bh - 40;   // the cream board sits whole above the row of boosters; its pointer slides along the board to the button being introduced
        L.nine('sbB', 'bf_board', D(bx, by, bw, bh), [60, 60, 60, 60], { k: (bh / 156) * s, alpha: A });
        const px = Math.max(bx + 70, Math.min(bx + bw - 70, bcx)), py = by + bh - 6;
        const pp = (x: number, y: number) => ({ x: x * s, y: (y + rise) * s });
        { const T = [{ x: px - 36, y: py - 12 }, { x: px + 36, y: py - 12 }, { x: bcx, y: py + 44 }], len = (u: { x: number; y: number }, v: { x: number; y: number }) => Math.hypot(u.x - v.x, u.y - v.y);   // the pointer is built like the board's own border (black, blue, pale, cream), on the layer above the pictures, and opens into the board: no seam
            const la = len(T[1], T[2]), lb = len(T[0], T[2]), lc = len(T[0], T[1]), per = la + lb + lc, I = { x: (la * T[0].x + lb * T[1].x + lc * T[2].x) / per, y: (la * T[0].y + lb * T[1].y + lc * T[2].y) / per };
            const area = Math.abs((T[1].x - T[0].x) * (T[2].y - T[0].y) - (T[2].x - T[0].x) * (T[1].y - T[0].y)) / 2, r0 = area / (per / 2), kd = bh / 156;
            const yc = by + bh, layer = (d: number, col: number) => {   // each band is the pointer grown by d, cut flat at the board's bottom edge
                const f = (r0 + d) / r0, V = T.map((v) => ({ x: I.x + (v.x - I.x) * f, y: I.y + (v.y - I.y) * f })), cut = (v: { x: number; y: number }) => { const t = (yc - v.y) / (V[2].y - v.y); return { x: v.x + (V[2].x - v.x) * t, y: yc }; };
                const P = [cut(V[0]), cut(V[1]), V[2]].map((v) => pp(v.x, v.y)); L.gu.fillStyle(col, A).fillTriangle(P[0].x, P[0].y, P[1].x, P[1].y, P[2].x, P[2].y);
                return [cut(V[0]).x, cut(V[1]).x];
            };
            layer(16 * kd, 0x000000); layer(11 * kd, 0x6ca6d3); layer(7 * kd, 0xbcdae2); const [cl, cr] = layer(0, 0xffffec);
            const w1 = pp(cl + 1, yc - 17 * kd), w2 = pp(cr - 1, yc + 1); L.gu.fillStyle(0xffffec, A).fillRect(w1.x, w1.y, w2.x - w1.x, w2.y - w1.y); }
        const availT = bw - 150, size = Math.min(64, fit(body, availT));
        boardText(L, s, 'sbL', body, '', by + 86 + rise, size, availT, 62, A, 1, 0, 0, 540);
        tapText('Tap to continue', by + 168, 320, { fill: '#b3bcc0', stroke: '#b3bcc0', sw: 0, sh: 0 });   // the soft grey hint inside the board
    } else {   // the cream board under (or over) the lit control, "Tap anywhere to continue!"
        const bh = 199, below = cym < c.h * 0.55, by = below ? ((box ? box.y + box.h : cym) / s) + 70 : ((box ? box.y : cym) / s) - 70 - bh - 82;
        L.nine('sbB', 'bf_board', D(98, by, 884, bh), [60, 60, 60, 60], { k: (bh / 156) * s, alpha: A });
        boardText(L, s, 'sbL', body, 'lose', by + bh / 2 + rise, fit('Three fishes complete a cave.', 743 - 9), 760, 72, A, 1, 0, 0, 540, RED_TXT);   // the word that matters in red
        tapText('Tap anywhere to continue!', by + bh + 82, 657, GREY);
    }
    if (on) c.spotZones.add('spot', { x: 0, y: 0, w: c.w, h: c.h }, { click: click('spotOv') });
}

/** level 1: the cream board with "Tap a fish" or one of the three camera hints, the hand on the fish to tap, and for the camera hints the gesture itself */
let gmVis = false, gmT0 = 0, gmLeave = -9, gmLast: { msg: string; hi: string } | null = null, gmHand: { x: number; y: number } | null = null;
const GM_IN = 0.38, GM_OUT = 0.3;
export function paintGuideBF(L: Layer, c: Ctx) {
    const s = c.w / 1080, t = c.scene.time.now / 1000, D = (x: number, y: number, w: number, h: number): R => ({ x: x * s, y: y * s, w: w * s, h: h * s });
    const gm = document.getElementById('goalMsg'), ct = document.getElementById('camTut'), step = ct && ct.classList.contains('show') ? (['rot', 'zoom', 'tilt'].find((k) => ct.classList.contains(k)) ?? '') : '';
    const gh = document.getElementById('guideHand'), hand = gh && gh.classList.contains('show') ? (() => { const r = gh.getBoundingClientRect(); return { x: r.left - c.o.left + 26, y: r.top - c.o.top - 8 }; })() : null;
    const HW = 190, HH = 199, TIPX = 11, TIPY = 6;   // the white hand: size and where the fingertip is
    const CAM: Record<string, [string, string]> = { rot: ['Drag to look around', 'look around'], zoom: ['Pinch to zoom in / out', 'zoom in / out'], tilt: ['Drag with two fingers to\nmove the view up / down', 'move the view up / down'] };
    const want = step ? CAM[step][0] : (gm && gm.classList.contains('show') ? 'Tap a fish' : ''), wantHi = step ? CAM[step][1] : 'fish';
    // the board pops in when the guide starts and shrinks away when it ends; changing the text from one step to the next has no animation of its own
    if (want) { if (!gmVis) { gmVis = true; gmT0 = t; } gmLast = { msg: want, hi: wantHi }; } else if (gmVis) { gmVis = false; gmLeave = t; }
    const leaving = !want && !!gmLast && t - gmLeave < GM_OUT, msg = want || (leaving && gmLast ? gmLast.msg : ''), hi = want ? wantHi : (gmLast ? gmLast.hi : 'fish');
    const pIn = want ? Math.min(1, (t - gmT0) / GM_IN) : 1, back = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);   // ease out with a little overshoot
    const gmA = want ? Math.min(1, pIn * 2.6) : leaving ? 1 - (t - gmLeave) / GM_OUT : 0, gmK = want ? 0.55 + 0.45 * back(pIn) : leaving ? 1 - 0.22 * ((t - gmLeave) / GM_OUT) : 1;
    const handA = want ? Math.max(0, Math.min(1, (t - gmT0 - GM_IN) / 0.25)) : leaving ? gmA : 0;   // the hand comes in after the board has settled
    if (hand) gmHand = hand;
    if (msg) {
        const lines = msg.split('\n'), bw = Math.max(586, Math.min(900, Math.max(...lines.map((l) => width(l, 70))) + 150)), bx = 540 - bw / 2, bh = 156 + (lines.length - 1) * 64;
        const by = 470;   // the tutorial board ("Tap a fish", the camera steps) always sits up under the target tanks
        const ccx = 540 * s, ccy = (by + bh / 2) * s, rr0 = D(bx, by, bw, bh);
        L.nine('gmB', 'bf_board', { x: ccx + (rr0.x - ccx) * gmK, y: ccy + (rr0.y - ccy) * gmK, w: rr0.w * gmK, h: rr0.h * gmK }, [60, 60, 60, 60], { k: s * gmK, alpha: gmA });
        const size = msg === 'Tap a fish' ? fit('Tap a fish', 238 - 9) : Math.min(fit('Tap a fish', 238 - 9), fit(lines.reduce((a, b2) => (a.length > b2.length ? a : b2), ''), bw - 110));
        boardText(L, s, 'gm', msg, hi, by + bh / 2, size, bw - 110, 64, gmA, gmK, ccx, ccy);
    }
    // the gesture of the camera step: a right and a left hand (the second one mirrored), moving fast, each leaving a fading white trail
    const H = (key: string, cx: number, cy: number, a = 1, flip = false, fill?: number) => L.pic(key, 'bf_hand_white', D(cx - HW / 2, cy - HH / 2, HW, HH), { alpha: a, flipX: flip, fill });
    const trail = (key: string, at: (tt: number) => [number, number], flip: boolean) => { for (let k = 6; k >= 1; k--) { const [x, y] = at(t - k * 0.04); H(key + k, x, y, 0.6 * (1 - k / 7), flip, 0xffffff); } const [x, y] = at(t); H(key + '0', x, y, 1, flip); };
    const W = 3.8;   // speed of the gesture
    if (step === 'rot') trail('gsa', (tt) => [540 + 200 * Math.sin(tt * W), 1060], false);
    else if (step === 'zoom') { const dd = (tt: number) => 70 + 80 * (0.5 + 0.5 * Math.sin(tt * W)); trail('gsa', (tt) => [540 + dd(tt), 1060 + dd(tt) * 0.5], false); trail('gsb', (tt) => [540 - dd(tt), 1060 + dd(tt) * 0.5], true); }
    else if (step === 'tilt') { trail('gsa', (tt) => [630, 1060 + 130 * Math.sin(tt * W)], false); trail('gsb', (tt) => [450, 1060 + 130 * Math.sin(tt * W)], true); }
    const hnd = hand ?? (leaving && !step && handA > 0 && gmHand ? gmHand : null);   // the old hand only lingers while the board fades out; during a camera step the guide hand is gone
    if (hnd) {   // a tap: the hand hovers, presses down, lifts, and a ring spreads from the fingertip
        const T = 1.15, u = (t % T) / T, press = u < 0.45 ? 0 : u < 0.58 ? (u - 0.45) / 0.13 : Math.max(0, 1 - (u - 0.58) / 0.12), dy = (press * 22 + Math.sin(t * 4) * 3) * s, sc = 1 - 0.06 * press;
        L.pic('ghH', 'bf_hand_white', { x: hnd.x - TIPX * s * sc, y: hnd.y - TIPY * s * sc + dy, w: HW * s * sc, h: HH * s * sc }, { alpha: handA });
        if (u >= 0.58) { const r = (u - 0.58) / 0.42, d = (50 + 170 * r) * s; L.pic('ghR', 'bf_ring', { x: hnd.x - d / 2, y: hnd.y + 6 * s - d / 2, w: d, h: d }, { alpha: 0.9 * (1 - r) * handA }); } else L.pic('ghR', 'bf_ring', { x: hnd.x, y: hnd.y, w: 1, h: 1 }, { alpha: 0 });
    }
}

/** a toast ("New fish are coming out of the pipe!"): the same cream board and lettering as the "Tap a fish" board, placed where the hidden HTML toast is (it carries the pop-in, the rise and the fade) */
export function paintToastBF(L: Layer, c: Ctx, toast: HTMLElement, alpha: number) {
    const s = c.w / 1080, r = toast.getBoundingClientRect(), txt0 = (toast.textContent ?? '').trim(); if (!txt0) return;
    const size = 62, maxW = 700, lines = layoutLines(txt0, size, maxW), bw = Math.min(900, Math.max(520, Math.max(...lines.map((l) => width(l, size))) + 150)), bh = 156 + (lines.length - 1) * 64;
    const cx = (r.left + r.width / 2 - c.o.left) / s, cy = (r.top + r.height / 2 - c.o.top) / s;
    L.nine('toB', 'bf_board', { x: (cx - bw / 2) * s, y: (cy - bh / 2) * s, w: bw * s, h: bh * s }, [60, 60, 60, 60], { k: s, alpha });
    boardText(L, s, 'to', txt0, 'fish', cy, size, maxW, 64, alpha);
}
