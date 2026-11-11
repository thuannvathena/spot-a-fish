import { Layer, R } from './kit';
import type { Ctx } from './panels';

// The pop-ups and the first-time guides drawn from the painted pieces in public/ui/bf.
// The game screen is a fixed phone shape (9:16), so every position below is a position in the 1080 x 1920 design pictures (fake screens),
// measured from those pictures and scaled by one number: screen width / 1080. Each pop-up still has a hidden HTML twin (game/src/template.html) that carries state and clicks.
export const NEW_FILES = ['board_hole', 'lock', 'btn_round_grey', 'btn_round', 'ic_hint', 'ic_net', 'ic_back', 'badge_level', 'btn_pause'];   // the newly made pieces (public/ui/new): booster button + icons, level badge, pause button
export const BF_FILES = ['pop_set_top', 'pop_set_mid', 'pop_set_bot', 'btn_sq_blue', 'btn_sq_grey', 'ic_sound', 'ic_music', 'ic_vib_off', 'btn_x', 'ic_restart', 'btn_green', 'btn_orange', 'btn_blue', 'btn_red', 'btn_grey', 'bar_blue', 'panel_in', 'ic_sound_off', 'ic_music_off', 'ic_vib_on', 'pic_bubble', 'spark', 'qbubble',
    'pop_base', 'pop_base_blue', 'rib_blue', 'rib_purple', 'hand', 'board', 'board_icon', 'trophy', 'ic_net', 'ic_clear', 'ic_hint', 'pic_water', 'pic_lose', 'fish_fail', 'fish_think', 'txt_levelfailed', 'hand_white', 'nf_title', 'name_squid', 'name_clam', 'name_swarm', 'name_pipe', 'name_frozen', 'fx_light', 'fx_stars', 'board_btn', 'ring'];
export const BF_OVERLAYS = ['ovPause', 'ovPlayOn', 'ovLose', 'ovIntro'];

const click = (id: string) => () => (document.getElementById(id) as HTMLElement | null)?.click();
const txt = (id: string) => (document.getElementById(id)?.textContent ?? '').trim();
const attr = (id: string, a: string) => (document.getElementById(id) as HTMLElement | null)?.getAttribute(a) ?? '';
type FF = { save?: { muted?: boolean; noMusic?: boolean; noVib?: boolean }; G?: { backup?: { type?: number; id?: string; junk?: boolean; filler?: boolean }[]; level?: number }; THUMB?: Record<string, string>; SPECIES?: { id: string }[] };
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
const TITLE: Style = { fill: '#ffffff', stroke: '#0a1530', sw: 14, sh: 0, lift: 0.09 };   // lift: the letters sit a little high in their box, so they land in the middle of the ribbon
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
let cur: { id: string; t0: number } | null = null, leaving: { id: string; t0: number } | null = null, devOpen = false;
const backOut = (u: number) => 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2);

/** called every frame instead of drawing the overlay directly: handles the pop in / out of the new pop-ups; returns true when it drew something */
export function paintBFAnim(L: Layer, c: Ctx, ov: HTMLElement | null): boolean {
    const now = performance.now(), id = ov && BF_OVERLAYS.includes(ov.id) ? ov.id : null;
    if (id && (!cur || cur.id !== id)) { cur = { id, t0: now }; leaving = null; if (id !== 'ovPause') devOpen = false; }
    if (!id && cur) { leaving = { id: cur.id, t0: now }; cur = null; }
    if (id && cur) { const u = Math.min(1, (now - cur.t0) / IN_MS); paintBF(L, c, ov as HTMLElement, 0.7 + 0.3 * backOut(u), Math.min(1, u * 2.2), false); return true; }
    if (leaving) {
        const u = (now - leaving.t0) / OUT_MS, el = document.getElementById(leaving.id);
        if (u >= 1 || !el) { leaving = null; return false; }
        paintBF(L, c, el, 1 - 0.3 * u * u, 1 - u, true); return true;
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
    const button = (key: string, kind: 'green' | 'orange' | 'blue', r: R, label: string, onClick: () => void, labelW?: number, icon?: string) => {
        const dy = z.pressed === key ? 6 * s : 0, rr = { ...r, y: r.y + dy * K }, h = rr.h * 1.1;
        P.nine(key + 'b', 'bf_btn_' + kind, { ...rr, h }, kind === 'blue' ? [70, 70, 62, 80] : [62, 62, 56, 72], { k: (r.h * 1.1) / (kind === 'blue' ? 227 : 202) / K });
        if (icon) P.pic(key + 'i', 'bf_' + icon, { x: rr.x + rr.w / 2 - 52 * s * K, y: rr.y + rr.h / 2 - 62 * s * K, w: 105 * s * K, h: 113 * s * K });
        else { const sz = fit(label, (labelW ?? 330) - 10) * s * K; L.text(key + 't', rr.x + rr.w / 2, rr.y + r.h * 0.45, label, { size: sz, color: '#ffffff', stroke: kind === 'green' ? '#14420b' : '#0a3a73', sw: 10 * s * K, sh: 5 * s * K, alpha: A }); }
        if (!out) z.add(key, r, { click: onClick });
    };
    if (!out) c.modal = true;
    const popR = id === 'ovPause' ? D(99, 400, 882, 800) : id === 'ovPlayOn' ? D(58, 110, 965, 1280) : null;
    (window as unknown as { __popRect?: unknown }).__popRect = popR && !out ? { x: popR.x + c.o.left, y: popR.y + c.o.top, w: popR.w, h: popR.h, r: 70 * s * K, top: id === 'ovPause' ? ((q) => ({ x: q.x + c.o.left, y: q.y + c.o.top, w: q.w, h: q.h }))(D(143, 332, 778, 197)) : undefined } : null;
    const S = ff().save ?? {};
    g.fillStyle(0x040c1c, 0.88 * A).fillRect(0, 0, c.w, c.h);
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
        const top = 448, bottom = 1385;
        P.nine('pf', 'bf_pop_base', D(58, top, 965, bottom - top), [80, 80, 80, 80], { k: 0.9 * s });
        P.pic('pFish', 'bf_fish_think', D(290, 110 + Math.sin(t * 1.8) * 8, 360, 285));   // the puzzled fish over the ribbon
        P.pic('pr', 'bf_rib_blue', D(97, 390, 878, 222));   // placed so the ribbon's inner band lands on the fake's band
        arcText('pT', 'Out of space!', 543, 500, 600, TITLE, 878, 52);
        const xr = D(921, 454, 114, 120); P.pic('pX', 'bf_btn_x', { ...xr, y: xr.y + (z.pressed === 'pX' ? 2 : 0) }); add('pX', xr, click('bNoPlayOn'));
        P.nine('pPan', 'bf_panel_in', D(100, 650, 880, 380), [60, 60, 60, 60], { k: 0.9 * s });   // the inner frame sits evenly between the ribbon above and the Play on button below
        const tk = c.scene.textures.exists('tk_back') ? c.scene.textures.get('tk_back').getSourceImage() as HTMLImageElement : null, ar = tk ? tk.width / tk.height : 2.2, tw = 780, th = tw / ar, tx = 540 - tw / 2, ty = 672;
        P.pic('pv1', 'tk_back', D(tx, ty, tw, th));
        const F = ff(), items = (F.G?.backup ?? []).slice(0, 7), cw = (tw * 0.9) / 7;
        items.forEach((it, i) => {
            const src = it.filler ? '' : ((it.junk ? F.THUMB?.[it.id ?? ''] : F.THUMB?.[F.SPECIES?.[it.type ?? 0]?.id ?? '']) ?? ''), fx = tx + tw * 0.05 + cw * i;
            if (src) P.image('pvf' + i, src, D(fx + cw * 0.06, ty + th * 0.36 + Math.sin(t * 2 + i) * 3, cw * 0.88, th * 0.5));
        });
        P.pic('pv3', 'tk_front', D(tx, ty, tw, th));
        const cap = 'Clear the tank to keep playing!', capY = (ty + th + 1025) / 2;
        text('pL', cap, 540, capY, 780, { fill: '#2e6fb5', stroke: '#ffffff', sw: 6, sh: 0 }, Math.min(64, fit(cap, 780)));
        button('pA', 'green', D(280, 1060, 520, 170), 'Play on', click('bPlayOn'), 330);
        text('pN', 'No thanks', 540, 1290, 220, { fill: '#e8f4ff', stroke: '#0d3d7a', sw: 8, sh: 0 }); add('pNo', D(400, 1255, 280, 70), click('bNoPlayOn'));
        return;
    }

    if (id === 'ovIntro') {   // BUBBLE FISh_Popup_New feature.psd: the title picture, the name, light and stars behind a big picture, a cream board, "Tap to continue"
        const title = txt('introTitle'), body = txt('introTxt'), img = attr('introImg', 'src'), slug = ['squid', 'clam', 'swarm', 'pipe', 'frozen'].find((k) => title.toLowerCase().includes(k)), nm = slug ? c.scene.textures.get('bf_name_' + slug).getSourceImage() as HTMLImageElement : null;
        // everything pops in one after another (a soft overshoot, like the LEVEL words at the level start), then keeps floating a little so the pop-up never sits dead
        const age = cur ? (performance.now() - cur.t0) / 1000 : 9, pp = (d: number, dur = 0.55) => { const u = Math.max(0, Math.min(1, (age - d) / dur)); return { sc: u <= 0 ? 0.001 : backOut(u), a: Math.min(1, u * 3.2) }; };
        const sd = (x: number, y: number, w: number, h: number, sc: number, dy = 0): R => D(x + (w / 2) * (1 - sc), y + (h / 2) * (1 - sc) + dy, w * sc, h * sc);
        const pT = pp(0.05), pN = pp(0.18), pF = pp(0.1, 0.65), pB = pp(0.32), pK = pp(0.9, 0.4);
        P.pic('fT', 'bf_nf_title', sd(163, 238, 755, 101, pT.sc * (1 + 0.012 * Math.sin(t * 2.4)), Math.sin(t * 1.5) * 3), { alpha: pT.a });
        if (slug && nm) P.pic('fN', 'bf_name_' + slug, sd(540 - nm.width / 2, 410, nm.width, nm.height, pN.sc * (1 + 0.025 * Math.sin(t * 2.1 + 1)), Math.sin(t * 1.7 + 0.8) * 5), { alpha: pN.a });
        else { const tt = text('fN', title, 540, 472 + Math.sin(t * 1.7) * 5, 640, { fill: '#fee600', stroke: '#000000', sw: 8, sh: 6 }); tt.setScale(pN.sc).setAlpha(A * pN.a); }
        const bob = Math.sin(t * 2) * 6;
        const fv = (window as unknown as { __fv?: { on: boolean; cv: HTMLCanvasElement } }).__fv;
        if (fv && fv.on) {   // a live picture: the obstacle moves like it does in the game (game/src/main.js, FV)
            const tx = c.scene.textures; if (!tx.exists('fvLive')) tx.addCanvas('fvLive', fv.cv); else (tx.get('fvLive') as Phaser.Textures.CanvasTexture).refresh();
            P.pic('fImg', 'fvLive', sd(540 - 330, 800 - 330, 660, 660, pF.sc), { alpha: pF.a });
        } else if (img) P.image('fImg', cropped(img), sd(540 - 280, 821 - 280 + bob, 560, 560, pF.sc), { alpha: pF.a });
        P.pic('fStars', 'bf_fx_stars', D(243, 610, 592, 554), { alpha: 0.65 + 0.35 * Math.sin(t * 3) });
        P.nine('fB', 'bf_board', sd(103, 1164, 880, 230, pB.sc, (1 - pB.sc) * 60 + Math.sin(t * 1.9) * 3), [60, 60, 60, 60], { k: (230 / 156) * s * pB.sc, alpha: pB.a });
        boardText(L, s, 'fL', body, title, 1279, fit('Special bubbles are here! Clearing fish', 786 - WHITE.sw), 786, 70, A * pB.a, K, cx0, cy0);
        const kk = text('fK', 'Tap to continue', 540, 1558, 392, GREY, fit('Tap to continue', 392 - GREY.sw)); kk.setScale(pK.sc * (1 + 0.035 * Math.sin(t * 3))).setAlpha(A * pK.a * (0.75 + 0.25 * Math.sin(t * 3)));
        add('fTap', { x: 0, y: 0, w: c.w, h: c.h }, click('bIntro'));
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
        { const a1 = pp(px - 34, py - 10), a2 = pp(px + 34, py - 10), a3 = pp(bcx, py + 42); g.fillStyle(0xfff3d6, A).fillTriangle(a1.x, a1.y, a2.x, a2.y, a3.x, a3.y); g.lineStyle(5 * s, 0x2e6fb5, A * 0.9).strokeTriangle(a1.x, a1.y + 6 * s, a3.x, a3.y, a2.x, a2.y + 6 * s); }
        const availT = bw - 150, size = Math.min(64, fit(body, availT));
        boardText(L, s, 'sbL', body, '', by + 100 + rise, size, availT, 62, A, 1, 0, 0, 540);
        tapText('Tap to continue', by + 190, 320, { fill: '#b3bcc0', stroke: '#b3bcc0', sw: 0, sh: 0 });   // the soft grey hint inside the board
    } else {   // the cream board under (or over) the lit control, "Tap anywhere to continue!"
        const bh = 199, below = cym < c.h * 0.55, by = below ? ((box ? box.y + box.h : cym) / s) + 70 : ((box ? box.y : cym) / s) - 70 - bh - 82;
        L.nine('sbB', 'bf_board', D(98, by, 884, bh), [60, 60, 60, 60], { k: (bh / 156) * s, alpha: A });
        boardText(L, s, 'sbL', body, 'lose', by + bh / 2 + rise, fit('Three fishes complete a cave.', 743 - 9), 760, 72, A, 1, 0, 0, 540, RED_TXT);   // the word that matters in red
        tapText('Tap anywhere to continue!', by + bh + 82, 657, GREY);
    }
    if (on) c.spotZones.add('spot', { x: 0, y: 0, w: c.w, h: c.h }, { click: click('spotOv') });
}

/** level 1: the cream board with "Tap a fish" or one of the three camera hints, the hand on the fish to tap, and for the camera hints the gesture itself */
export function paintGuideBF(L: Layer, c: Ctx) {
    const s = c.w / 1080, t = c.scene.time.now / 1000, D = (x: number, y: number, w: number, h: number): R => ({ x: x * s, y: y * s, w: w * s, h: h * s });
    const gm = document.getElementById('goalMsg'), ct = document.getElementById('camTut'), step = ct && ct.classList.contains('show') ? (['rot', 'zoom', 'tilt'].find((k) => ct.classList.contains(k)) ?? '') : '';
    const gh = document.getElementById('guideHand'), hand = gh && gh.classList.contains('show') ? (() => { const r = gh.getBoundingClientRect(); return { x: r.left - c.o.left + 26, y: r.top - c.o.top - 8 }; })() : null;
    const HW = 190, HH = 199, TIPX = 11, TIPY = 6;   // the white hand: size and where the fingertip is
    const CAM: Record<string, [string, string]> = { rot: ['Drag to look around', 'look around'], zoom: ['Pinch to zoom in / out', 'zoom in / out'], tilt: ['Drag with two fingers to\nmove the view up / down', 'move the view up / down'] };
    const msg = step ? CAM[step][0] : (gm && gm.classList.contains('show') ? 'Tap a fish' : ''), hi = step ? CAM[step][1] : 'fish';
    if (msg) {
        const lines = msg.split('\n'), bw = Math.max(586, Math.min(900, Math.max(...lines.map((l) => width(l, 70))) + 150)), bx = 540 - bw / 2, bh = 156 + (lines.length - 1) * 64;
        const by = 470;   // the tutorial board ("Tap a fish", the camera steps) always sits up under the target tanks
        L.nine('gmB', 'bf_board', D(bx, by, bw, bh), [60, 60, 60, 60], { k: s });
        const size = msg === 'Tap a fish' ? fit('Tap a fish', 238 - 9) : Math.min(fit('Tap a fish', 238 - 9), fit(lines.reduce((a, b2) => (a.length > b2.length ? a : b2), ''), bw - 110));
        boardText(L, s, 'gm', msg, hi, by + bh / 2, size, bw - 110, 64);
    }
    // the gesture of the camera step: a right and a left hand (the second one mirrored), moving fast, each leaving a fading white trail
    const H = (key: string, cx: number, cy: number, a = 1, flip = false, fill?: number) => L.pic(key, 'bf_hand_white', D(cx - HW / 2, cy - HH / 2, HW, HH), { alpha: a, flipX: flip, fill });
    const trail = (key: string, at: (tt: number) => [number, number], flip: boolean) => { for (let k = 6; k >= 1; k--) { const [x, y] = at(t - k * 0.04); H(key + k, x, y, 0.6 * (1 - k / 7), flip, 0xffffff); } const [x, y] = at(t); H(key + '0', x, y, 1, flip); };
    const W = 3.8;   // speed of the gesture
    if (step === 'rot') trail('gsa', (tt) => [540 + 200 * Math.sin(tt * W), 1060], false);
    else if (step === 'zoom') { const dd = (tt: number) => 70 + 80 * (0.5 + 0.5 * Math.sin(tt * W)); trail('gsa', (tt) => [540 + dd(tt), 1060 + dd(tt) * 0.5], false); trail('gsb', (tt) => [540 - dd(tt), 1060 + dd(tt) * 0.5], true); }
    else if (step === 'tilt') { trail('gsa', (tt) => [630, 1060 + 130 * Math.sin(tt * W)], false); trail('gsb', (tt) => [450, 1060 + 130 * Math.sin(tt * W)], true); }
    if (hand) {   // a tap: the hand hovers, presses down, lifts, and a ring spreads from the fingertip
        const T = 1.15, u = (t % T) / T, press = u < 0.45 ? 0 : u < 0.58 ? (u - 0.45) / 0.13 : Math.max(0, 1 - (u - 0.58) / 0.12), dy = (press * 22 + Math.sin(t * 4) * 3) * s, sc = 1 - 0.06 * press;
        L.pic('ghH', 'bf_hand_white', { x: hand.x - TIPX * s * sc, y: hand.y - TIPY * s * sc + dy, w: HW * s * sc, h: HH * s * sc });
        if (u >= 0.58) { const r = (u - 0.58) / 0.42, d = (50 + 170 * r) * s; L.pic('ghR', 'bf_ring', { x: hand.x - d / 2, y: hand.y + 6 * s - d / 2, w: d, h: d }, { alpha: 0.9 * (1 - r) }); } else L.pic('ghR', 'bf_ring', { x: hand.x, y: hand.y, w: 1, h: 1 }, { alpha: 0 });
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
