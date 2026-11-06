import * as Phaser from 'phaser';
import { BR, DPR, Layer, R, Zones, T, hexCss, inRect, porthole, rectOf } from '../ui/kit';
import { Ctx, GameState, paintMessages, paintOverlay, paintSpot, paintTargets, paintTools } from '../ui/panels';

// The whole game UI, drawn by Phaser. The Three.js game keeps writing its state into hidden HTML elements
// (layout, classes, text); every frame this scene mirrors them (see src/ui/panels.ts) and forwards taps to them.
const ff = () => (window as unknown as { __ff?: { G?: GameState } }).__ff;
const UI30 = /[?&]ui30=0/.test(location.search) ? false : matchMedia('(pointer:coarse)').matches || /[?&]ui30=1/.test(location.search);

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
    }

    create() {
        this.cameras.main.setOrigin(0, 0).setZoom(DPR);   // draw in CSS pixels; the canvas has DPR x more pixels
        this.base = new Layer(this, 0); this.ovl = new Layer(this, 20); this.spot = new Layer(this, 40); this.msg = new Layer(this, 60);
        this.zBase = new Zones(this, 5); this.zOv = new Zones(this, 25); this.zSpot = new Zones(this, 45);
        // the 3D canvas calls this before handling a tap: true = the tap belongs to the Phaser UI
        (window as unknown as { __uiHit: (x: number, y: number) => boolean }).__uiHit = (cx, cy) =>
            this.modal || this.hits.some((r) => inRect(r, cx - this.left, cy - this.top));
    }

    private lastDraw = 0;

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
        for (const z of [this.zBase, this.zOv, this.zSpot]) z.begin();
        if (G) {
            this.topBar(c, dt);
            this.backupTray(c);
            paintTargets(this.base, c);
            paintTools(this.base, c);
            paintOverlay(this.ovl, c);
            paintSpot(this.spot, c);
        }
        paintMessages(this.msg, c);
        for (const l of [this.base, this.ovl, this.spot, this.msg]) l.end();
        for (const z of [this.zBase, this.zOv, this.zSpot]) z.end();
        this.hits = c.hits; this.modal = c.modal;
        // the 3D overlay canvas (flying and resident fish) sits above everything: dim it while a popup is open
        this.ovCanvas ??= (window as unknown as { __ff?: { ov?: { canvas: HTMLCanvasElement } } }).__ff?.ov?.canvas ?? null;
        if (this.ovCanvas) this.ovCanvas.style.opacity = this.modal ? '0.15' : '';
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
        const lr = Math.min(lvl.h / 2 + 3, 26), lx = lvl.x + lvl.w / 2, ly = lvl.y + lvl.h / 2;
        porthole(g, lx, ly, lr);
        L.text('lvS', lx, ly - lr * 0.46, 'LEVEL', { size: 8, color: hexCss(T.amberL), stroke: hexCss(T.deeper), sw: 2 });
        L.text('lvN', lx, ly + lr * 0.18, String(G.level), { size: 21, stroke: hexCss(T.deeper), sw: 4 });
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
        const pc = { x: pause.x + pause.w / 2, y: pause.y + pause.h / 2 }, r = Math.min(pause.w, pause.h) / 2, dy = this.zBase.pressed === 'pause' ? 2 : 0;
        porthole(g, pc.x, pc.y + dy, r, { thick: 5 });
        const k2 = r / 19; g.fillStyle(BR.hi, 1).fillRoundedRect(pc.x - 6.5 * k2, pc.y + dy - 6.5 * k2, 4.5 * k2, 13 * k2, 2).fillRoundedRect(pc.x + 2 * k2, pc.y + dy - 6.5 * k2, 4.5 * k2, 13 * k2, 2);
        this.zBase.add('pause', { x: pause.x - 4, y: pause.y - 4, w: pause.w + 8, h: pause.h + 8 }, { click: () => (document.getElementById('pauseBtn') as HTMLElement).click() });
    }

    // Backup shelf: glass jars on a brass rail. Slots sit exactly where the game's own (hidden) slots are, so flying fish still land in them
    // The backup is a painted 3D tank in the overlay now (tankFx in game/src/main.js); here it only blocks taps on the 3D scene behind it.
    private backupTray(c: Ctx) {
        const { o, G } = c, bk = rectOf(document.getElementById('backup'), o);
        if (!G || !bk || !G.cfg.backup) return;   // level 1 has no Backup (the game hides the tank there)
        c.hits.push(bk);
    }
}
