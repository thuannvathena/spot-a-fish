import * as Phaser from 'phaser';
import { BR, DPR, Layer, R, Zones, T, hexCss, inRect, porthole, rectOf } from '../ui/kit';
import { BF_FILES, NEW_FILES } from '../ui/bf';
import { Ctx, GameState, levelPop, tierOf, paintLevelIntro, paintMessages, paintWinText, paintOverlay, paintSpot, paintTargets, paintTools } from '../ui/panels';

// The whole game UI, drawn by Phaser. The Three.js game keeps writing its state into hidden HTML elements
// (layout, classes, text); every frame this scene mirrors them (see src/ui/panels.ts) and forwards taps to them.
const ff = () => (window as unknown as { __ff?: { G?: GameState } }).__ff;
const UI30 = /[?&]ui30=0/.test(location.search) ? false : matchMedia('(pointer:coarse)').matches || /[?&]ui30=1/.test(location.search);

/** how many px of blur the frosted lose screen has right now (same curve as the CSS on the 3D canvases: rises quickly at first, then slowly to 9 px) */
function wetBlurPx(): number {
    const w = window as unknown as { __wetT0?: number; __wetDur?: number; __wetWin?: number };
    if (w.__wetWin) {   // the water that closes the win sequence: frost in quickly, hold, clear slowly (same curve as the CSS on the 3D canvases)
        const u = Math.min(1, (performance.now() - w.__wetWin) / 2600), pts: [number, number][] = [[0, 0], [0.18, 9], [0.48, 9], [1, 0]];
        for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * ((u - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
        return 0;
    }
    if (!w.__wetT0) return 0;
    const u = Math.min(1, (performance.now() - w.__wetT0) / 1000 / Math.max(0.5, w.__wetDur ?? 3)), pts: [number, number][] = [[0, 0], [0.25, 2], [0.85, 8], [1, 9]];
    for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * ((u - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
    return 9;
}

export class Hud extends Phaser.Scene {
    private base!: Layer; private ovl!: Layer; private spot!: Layer; private msg!: Layer;
    private zBase!: Zones; private zOv!: Zones; private zSpot!: Zones;
    private prog = 0;
    private hits: R[] = [];
    private modal = false;
    private left = 0;
    private top = 0;
    private ovCanvas: HTMLCanvasElement | null = null;

    constructor() {
        super('Hud');
    }

    preload() {   // the painted UI pieces (made in the asset workflow, see docs)
        for (const n of ['ui_plate', 'ui_tube']) this.load.image(n, new URL(`ui/${n}.png`, document.baseURI).href);
        for (const n of BF_FILES) this.load.image('bf_' + n, new URL(`ui/bf/${n}.png`, document.baseURI).href);
        for (const n of NEW_FILES) this.load.image('nw_' + n, new URL(`ui/new/${n}.png`, document.baseURI).href);   // the pop-up pieces
        for (const [k, f] of [['tk_back', 'backup_back'], ['tk_front', 'backup_front']]) this.load.image(k, new URL(`ui/tanks/${f}.png`, document.baseURI).href);
    }

    create() {
        const main = this.cameras.main.setOrigin(0, 0).setZoom(DPR);   // draw in CSS pixels; the canvas has DPR x more pixels
        // two cameras on the same canvas: the first draws only the base layer (the top row, the target plates, the booster buttons) and can be blurred on its own;
        // the second draws everything above it (pop-ups, messages), so a pop-up stays sharp over a blurred screen
        this.camTop = this.cameras.add(0, 0, main.width, main.height).setOrigin(0, 0).setZoom(DPR);
        const toBase = (o: Phaser.GameObjects.GameObject) => this.camTop.ignore(o), toTop = (o: Phaser.GameObjects.GameObject) => main.ignore(o);
        this.base = new Layer(this, 0, toBase); this.ovl = new Layer(this, 20, toTop); this.spot = new Layer(this, 40, toTop); this.msg = new Layer(this, 60, toTop);
        this.zBase = new Zones(this, 5); this.zOv = new Zones(this, 25); this.zSpot = new Zones(this, 45);
        // the level list (60 levels) is drawn by Phaser from a hidden scrolling list: the mouse wheel and a finger / mouse drag scroll that list
        const appEl = document.getElementById('app') as HTMLElement, lvGrid = () => (document.getElementById('ovLevels')?.classList.contains('show') ? document.getElementById('lvGrid') : null);
        let drag = false, y0 = 0, s0 = 0; const W = window as unknown as { __lvDrag?: boolean };
        appEl.addEventListener('wheel', (e) => { const g = lvGrid(); if (g) { g.scrollTop += e.deltaY; e.preventDefault(); } }, { passive: false });
        appEl.addEventListener('pointerdown', (e) => { const g = lvGrid(); if (g) { drag = true; y0 = e.clientY; s0 = g.scrollTop; W.__lvDrag = false; } });
        appEl.addEventListener('pointermove', (e) => { if (!drag) return; const g = lvGrid(); if (!g) { drag = false; return; } const dy = e.clientY - y0; if (Math.abs(dy) > 8) W.__lvDrag = true; if (W.__lvDrag) g.scrollTop = s0 - dy; });
        window.addEventListener('pointerup', () => { drag = false; });
        // the 3D canvas calls this before handling a tap: true = the tap belongs to the Phaser UI
        (window as unknown as { __uiHit: (x: number, y: number) => boolean }).__uiHit = (cx, cy) =>
            this.modal || this.hits.some((r) => inRect(r, cx - this.left, cy - this.top));
    }

    private lastDraw = 0;
    private camTop!: Phaser.Cameras.Scene2D.Camera;
    private blurCtl: Phaser.Filters.Blur | null = null;

    update(_t: number, _dt: number) {
        const t0 = performance.now();
        // on touch screens the UI is redrawn about 30 times a second: half the work for the phone, and the UI is not noticeably less smooth (add ?ui30=0 to turn this off)
        if (UI30 && t0 - this.lastDraw < 26) { (window as unknown as { __hudLast?: number }).__hudLast = 0; return; }
        const dt = Math.min(100, t0 - this.lastDraw); this.lastDraw = t0;
        const host = document.getElementById('phaser-hud') as HTMLElement, o = host.getBoundingClientRect();
        this.left = o.left; this.top = o.top;
        const G = ff()?.G;
        const c: Ctx = { scene: this, o, w: o.width, h: o.height, G, zones: this.zBase, ovZones: this.zOv, spotZones: this.zSpot, hits: [], modal: false };
        for (const l of [this.base, this.ovl, this.spot, this.msg]) l.begin();
        { const w = window as unknown as { __hudFadeT0?: number; __hudInT0?: number }, now = performance.now();   // the top row, the plates and the boosters fade out when the win sequence starts and back in with the next level
          const al = w.__hudFadeT0 ? 1 - Math.min(1, (now - w.__hudFadeT0) / 450) : w.__hudInT0 ? Math.max(0, Math.min(1, (now - w.__hudInT0) / 350)) : 1; this.cameras.main.setAlpha(al); }
        { const px = wetBlurPx(), cam = this.cameras.main;   // the lose sequence frosts the screen: the base layer blurs together with the 3D scene
          if (px < 0.3) { if (this.blurCtl) this.blurCtl.setActive(false); }
          else { if (!this.blurCtl) this.blurCtl = cam.filters.internal.addBlur(2, 0, 0, 1, 0xffffff, 10) as Phaser.Filters.Blur; this.blurCtl.setActive(true); this.blurCtl.x = px; this.blurCtl.y = px; } }
        for (const z of [this.zBase, this.zOv, this.zSpot]) z.begin();
        if (G) {
            this.topBar(c, dt);
            this.backupTray(c);
            paintTargets(this.base, c);
            paintTools(this.base, c);
            paintOverlay(this.ovl, c);
            paintSpot(this.spot, c);
        }
        paintMessages(this.msg, c); paintLevelIntro(this.msg, c); paintWinText(this.msg, c);
        for (const l of [this.base, this.ovl, this.spot, this.msg]) l.end();
        for (const z of [this.zBase, this.zOv, this.zSpot]) z.end();
        this.hits = c.hits; this.modal = c.modal;
        // the 3D overlay canvas (flying and resident fish) sits above everything: dim it while a popup is open
        this.ovCanvas ??= (window as unknown as { __ff?: { ov?: { canvas: HTMLCanvasElement } } }).__ff?.ov?.canvas ?? null;
        if (this.ovCanvas) {
            const st = this.ovCanvas.style, spot = document.getElementById('spotOv'), hole = document.getElementById('spotBox');
            if (!this.modal) { st.opacity = ''; st.clipPath = ''; }
            else if (spot && spot.classList.contains('show') && hole) {   // a highlight guide: the 3D picture (the Backup tank) shows at full strength inside the lit hole only
                const r = hole.getBoundingClientRect(), rad = parseFloat(hole.style.borderRadius) || 20;
                st.opacity = '1'; st.clipPath = `inset(${Math.max(0, r.top)}px ${Math.max(0, window.innerWidth - r.right)}px ${Math.max(0, window.innerHeight - r.bottom)}px ${Math.max(0, r.left)}px round ${rad}px)`;
            } else {   // a pop-up: the 3D overlay (target tanks, Backup) stays as a faint picture round it, and its own area is cut out so nothing shows through the pop-up
                const pr = (window as unknown as { __popRect?: { x: number; y: number; w: number; h: number; r?: number; top?: { x: number; y: number; w: number; h: number } } | null }).__popRect;
                st.opacity = '0.15';
                if (pr) {   // the hole follows the rounded pop-up (a plain rectangle showed as a dark box behind its corners)
                    const rr = Math.min(pr.r ?? 0, pr.w / 2, pr.h / 2), x1 = pr.x + pr.w, y1 = pr.y + pr.h, tp = pr.top;   // (a pop-up with a ribbon narrower than its body: the hole is the two shapes together)
                    const body = tp ? `M${tp.x} ${tp.y}H${tp.x + tp.w}V${pr.y}H${x1}V${y1 - rr}A${rr} ${rr} 0 0 1 ${x1 - rr} ${y1}H${pr.x + rr}A${rr} ${rr} 0 0 1 ${pr.x} ${y1 - rr}V${pr.y}H${tp.x}Z`
                        : `M${pr.x + rr} ${pr.y}H${x1 - rr}A${rr} ${rr} 0 0 1 ${x1} ${pr.y + rr}V${y1 - rr}A${rr} ${rr} 0 0 1 ${x1 - rr} ${y1}H${pr.x + rr}A${rr} ${rr} 0 0 1 ${pr.x} ${y1 - rr}V${pr.y + rr}A${rr} ${rr} 0 0 1 ${pr.x + rr} ${pr.y}Z`;
                    st.clipPath = `path(evenodd, "M0 0H${window.innerWidth}V${window.innerHeight}H0Z ${body}")`;
                } else st.clipPath = '';
            }
        }
        const w = window as unknown as { __hudMs?: number; __hudLast?: number }; w.__hudLast = performance.now() - t0; w.__hudMs = (w.__hudMs ?? 0) * 0.9 + w.__hudLast * 0.1;   // CPU time of the UI redraw, shown by ?fps=1
    }

    private topBar(c: Ctx, dt: number) {
        const { o, G } = c, L = this.base, g = L.g, t = this.time.now / 1000;
        const top = rectOf(document.querySelector('.topbar'), o), lvl = rectOf(document.querySelector('.topbar .lvl'), o);
        const goal = rectOf(document.getElementById('goal'), o), pause = rectOf(document.getElementById('pauseBtn'), o);
        if (!G || !top || !lvl || !goal || !pause) return;
        c.hits.push(top);
        // no frame around the top row: just the level porthole, the water gauge and the pause button
        // level: a porthole
        const lr = 29, lx = lvl.x + lvl.w / 2, ly = lvl.y + lvl.h / 2;
        const bpk = (() => { const t0 = (window as unknown as { __lvPop?: number }).__lvPop; return t0 ? (performance.now() - t0) / 1000 : 9; })(), bsp = bpk < 1.3 ? 1 + 0.3 * Math.exp(-5.5 * bpk) * Math.cos(17 * bpk) : 1, brot = bpk < 1.3 ? 0.22 * Math.exp(-5 * bpk) * Math.sin(21 * bpk) : 0, lrs = lr * bsp;   // the badge takes the hit of the arriving bubble: it swells, springs back and wobbles
        if (!L.pic('lvBadge', 'nw_badge_level', { x: lx - lrs, y: ly - lrs, w: lrs * 2, h: lrs * 2 }, { rot: brot })) porthole(g, lx, ly, lr);   // the painted gold badge (public/ui/new)
        if ((window as unknown as { __lvShown?: boolean }).__lvShown !== false) {   // at the start of a level the badge stays empty until the bubble with the level number flies in
            const pp = levelPop(), back = (k: number) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2), part = (d: number) => { const k = Math.max(0, Math.min(1, (pp - d) / (1 - d))); return pp >= 1 ? 1 : k <= 0 ? 0.001 : Math.max(0.001, back(k)); };
            const wob = (d: number) => (pp >= 1 ? 0 : Math.sin(Math.max(0, pp - d) * 16) * 0.16 * Math.pow(1 - pp, 1.5)), hop = (d: number) => (pp >= 1 ? 0 : -9 * Math.sin(Math.min(1, Math.max(0, (pp - d) / 0.5)) * Math.PI) * (1 - pp));   // each part springs out of the burst: a little hop, a wobble, then it settles (the word first, the number just after)
            const tr = tierOf(), lt = L.text('lvN', lx + 0.5, ly - 1 + hop(0.1), String(G.level), { size: 28, color: tr ? tr.fill : '#ffffff', stroke: tr ? tr.stroke : hexCss(T.deeper), sw: 4, alpha: pp >= 1 ? 1 : Math.min(1, Math.max(0, pp - 0.08) * 6) });
            const fitK = Math.min(1, (lr * 1.5) / Math.max(1, lt.width));   // 3 or 4 digits shrink to fit the blue disc (1-2 digits keep the full size)
            lt.setScale(part(0.1) * fitK).setRotation(wob(0.1));
        }
        // progress: a glass water gauge. Starfish mark each target tank; the water rises as they are filled
        const done = G.goalShown ?? G.completed, target = Math.min(1, done / Math.max(1, G.cfg.goal));   // the gauge fills when the bubble from the finished tank arrives
        this.prog += (target - this.prog) * Math.min(1, dt / 120);
        // the painted glass tube is drawn over the water; the water and its dark backing sit inside it
        const art: R = { x: goal.x - 5, y: goal.y - 4, w: goal.w + 10, h: goal.h + 8 }, tube: R = { x: art.x + art.h * 0.2, y: art.y + art.h * 0.2, w: art.w - art.h * 0.4, h: art.h * 0.6 };
        g.fillStyle(0x0b5a8c, 0.9).fillRoundedRect(tube.x, tube.y, tube.w, tube.h, tube.h / 2);
        const fh = tube.h - 4, fx = tube.x + 2, fy = tube.y + 2, fw = Math.max(fh, (tube.w - 4) * this.prog);
        if (this.prog > 0.001 || done > 0) {
            const rr = fh / 2;   // everything below stays inside the rounded capsule of the fill
            g.fillStyle(T.sea, 1).fillRoundedRect(fx, fy, fw, fh, rr);
            g.fillStyle(T.aqua, 0.95).fillRoundedRect(fx + 2, fy + 2, fw - 4, fh * 0.5 - 1, { tl: rr - 2, tr: rr - 2, bl: 2, br: 2 });
            const lo = fx + rr, hi = fx + fw - rr;   // a soft glint sliding along the fill, kept away from the rounded ends
            if (hi - lo > 14) { const span = hi - lo, sx = lo + ((t * 34) % (span + 24)) - 12, c0 = (v: number) => Math.min(hi, Math.max(lo, v)); g.fillStyle(0xffffff, 0.2).fillPoints([new Phaser.Math.Vector2(c0(sx), fy + 2), new Phaser.Math.Vector2(c0(sx + 12), fy + 2), new Phaser.Math.Vector2(c0(sx + 7), fy + fh - 2), new Phaser.Math.Vector2(c0(sx - 5), fy + fh - 2)], true); }
            for (let k = 0; k < 3; k++) { const ph = (t * 0.5 + k * 0.33) % 1; if (fw > 36) g.lineStyle(1.1, 0xffffff, 0.7 * (1 - ph)).strokeCircle(fx + fw * (0.2 + 0.26 * k), fy + fh - ph * fh, 1.8); }
        }
        if (!L.pic('tube', 'ui_tube', art)) { g.fillStyle(0xffffff, 0.16).fillRoundedRect(tube.x + 4, tube.y + 3, tube.w - 8, tube.h * 0.28, 4); g.lineStyle(1.5, 0xffffff, 0.5).strokeRoundedRect(tube.x, tube.y, tube.w, tube.h, tube.h / 2); }
        const pk = Math.max(0, 1 - (performance.now() - ((window as unknown as { __gaugePulse?: number }).__gaugePulse ?? -1e9)) / 520);   // flash when a bubble arrives
        if (pk > 0) { g.fillStyle(0xffffff, 0.35 * pk).fillRoundedRect(tube.x, tube.y, tube.w, tube.h, tube.h / 2); g.lineStyle(3, 0xffffff, 0.9 * pk).strokeRoundedRect(tube.x - 3 * pk, tube.y - 3 * pk, tube.w + 6 * pk, tube.h + 6 * pk, tube.h / 2 + 3 * pk); }
        L.text('goal', tube.x + tube.w / 2, tube.y + tube.h / 2 + 1, `${done}/${G.cfg.goal}`, { size: 18, stroke: hexCss(T.deeper), sw: 4 });   // the count sits in the middle of the gauge
        // pause: a brass valve wheel
        const pc = { x: pause.x + pause.w / 2, y: pause.y + pause.h / 2 }, r = 29, dy = this.zBase.pressed === 'pause' ? 2 : 0;   // the pause button is drawn as big as the level badge
        if (!L.pic('pauseBtn', 'nw_btn_pause', { x: pc.x - r, y: pc.y + dy - r, w: r * 2, h: r * 2 })) {   // the painted pause button (public/ui/new); the drawn valve wheel is the fallback
            porthole(g, pc.x, pc.y + dy, r, { thick: 5 });
            const k2 = r / 19; g.fillStyle(BR.hi, 1).fillRoundedRect(pc.x - 6.5 * k2, pc.y + dy - 6.5 * k2, 4.5 * k2, 13 * k2, 2).fillRoundedRect(pc.x + 2 * k2, pc.y + dy - 6.5 * k2, 4.5 * k2, 13 * k2, 2);
        }
        this.zBase.add('pause', { x: pause.x - 4, y: pause.y - 4, w: pause.w + 8, h: pause.h + 8 }, { click: () => (document.getElementById('pauseBtn') as HTMLElement).click() });
    }

    // Backup shelf: glass jars on a brass rail. Slots sit exactly where the game's own (hidden) slots are, so flying fish still land in them
    // The backup is a painted 3D tank in the overlay now (tankFx in game/src/main.js); here it only blocks taps on the 3D scene behind it.
    private backupTray(c: Ctx) {
        const { o, G } = c, bk = rectOf(document.getElementById('backup'), o);
        if (!G || !bk || !G.cfg.backup) return;   // level 1 has no Backup (the game hides the tank there)
        if (((window as unknown as { __bkA?: number }).__bkA ?? 1) > 0.5) c.hits.push(bk);   // faded away with the boosters while the camera moves: not tappable either
    }
}
