import * as Phaser from 'phaser';
import { BR, DPR, Layer, R, Zones, T, brass, bubble, hexCss, inRect, porthole, recess, rectOf, rivet, starfish } from '../ui/kit';
import { Ctx, GameState, paintMessages, paintOverlay, paintSpot, paintTargets, paintTools } from '../ui/panels';

// The whole game UI, drawn by Phaser. The Three.js game keeps writing its state into hidden HTML elements
// (layout, classes, text); every frame this scene mirrors them (see src/ui/panels.ts) and forwards taps to them.
const ff = () => (window as unknown as { __ff?: { G?: GameState } }).__ff;
const BACKUP_MAX = 7;

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

    create() {
        this.cameras.main.setOrigin(0, 0).setZoom(DPR);   // draw in CSS pixels; the canvas has DPR x more pixels
        this.base = new Layer(this, 0); this.ovl = new Layer(this, 20); this.spot = new Layer(this, 40); this.msg = new Layer(this, 60);
        this.zBase = new Zones(this, 5); this.zOv = new Zones(this, 25); this.zSpot = new Zones(this, 45);
        // the 3D canvas calls this before handling a tap: true = the tap belongs to the Phaser UI
        (window as unknown as { __uiHit: (x: number, y: number) => boolean }).__uiHit = (cx, cy) =>
            this.modal || this.hits.some((r) => inRect(r, cx - this.left, cy - this.top));
    }

    update(_t: number, dt: number) {
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
    }

    private topBar(c: Ctx, dt: number) {
        const { o, G } = c, L = this.base, g = L.g, t = this.time.now / 1000;
        const top = rectOf(document.querySelector('.topbar'), o), lvl = rectOf(document.querySelector('.topbar .lvl'), o);
        const goal = rectOf(document.getElementById('goal'), o), pause = rectOf(document.getElementById('pauseBtn'), o);
        if (!G || !top || !lvl || !goal || !pause) return;
        c.hits.push(top);
        // the control rail: a brass bar with a dark inset
        brass(g, top, 24);
        recess(g, { x: top.x + 4, y: top.y + 4, w: top.w - 8, h: top.h - 8 }, 20, 0x0a3a63);
        rivet(g, top.x + 9, top.y + top.h / 2, 1.8); rivet(g, top.x + top.w - 9, top.y + top.h / 2, 1.8);
        // level: a porthole
        const lr = Math.min(lvl.h / 2 + 3, 26), lx = lvl.x + lvl.w / 2, ly = lvl.y + lvl.h / 2;
        porthole(g, lx, ly, lr);
        L.text('lvS', lx, ly - lr * 0.46, 'LEVEL', { size: 8, color: hexCss(T.amberL), stroke: hexCss(T.deeper), sw: 2 });
        L.text('lvN', lx, ly + lr * 0.18, String(G.level), { size: 21, stroke: hexCss(T.deeper), sw: 4 });
        // progress: a glass water gauge. Starfish mark each target tank; the water rises as they are filled
        const target = Math.min(1, G.completed / Math.max(1, G.cfg.goal));
        this.prog += (target - this.prog) * Math.min(1, dt / 120);
        const gh = goal.h, tube: R = { x: goal.x + 5, y: goal.y + 1, w: goal.w - 10, h: gh - 2 };
        brass(g, { x: goal.x - 1, y: goal.y + gh * 0.18, w: 7, h: gh * 0.64 }, 3, { shadow: false }); brass(g, { x: goal.x + goal.w - 6, y: goal.y + gh * 0.18, w: 7, h: gh * 0.64 }, 3, { shadow: false });
        recess(g, tube, tube.h / 2, 0x072b50);
        const fh = tube.h - 6, fx = tube.x + 3, fy = tube.y + 3, fw = Math.max(fh, (tube.w - 6) * this.prog);
        if (this.prog > 0.001 || G.completed > 0) {
            g.fillStyle(T.sea, 1).fillRoundedRect(fx, fy, fw, fh, fh / 2);
            g.fillStyle(T.aqua, 0.95).fillRoundedRect(fx, fy, fw, fh * 0.6, { tl: fh / 2, tr: fh / 2, bl: 3, br: 3 });
            const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(fx + fw - 4, fy)];   // a wavy water front
            for (let y = 0; y <= fh; y += 2) pts.push(new Phaser.Math.Vector2(fx + fw + Math.sin(t * 3 + y * 0.55) * 1.8, fy + y));
            pts.push(new Phaser.Math.Vector2(fx + fw - 4, fy + fh)); g.fillStyle(T.aqua, 0.95).fillPoints(pts, true);
            const sx = fx + ((t * 34) % (fw + 36)) - 18; if (fw > 28) g.fillStyle(0xffffff, 0.2).fillPoints([new Phaser.Math.Vector2(Math.max(fx, sx), fy + 1), new Phaser.Math.Vector2(Math.min(fx + fw - 4, sx + 12), fy + 1), new Phaser.Math.Vector2(Math.min(fx + fw - 4, sx + 7), fy + fh - 1), new Phaser.Math.Vector2(Math.max(fx, sx - 5), fy + fh - 1)], true);
            for (let k = 0; k < 3; k++) { const ph = (t * 0.5 + k * 0.33) % 1; if (fw > 36) g.lineStyle(1.1, 0xffffff, 0.7 * (1 - ph)).strokeCircle(fx + fw * (0.2 + 0.26 * k), fy + fh - ph * fh, 1.8); }
        }
        g.fillStyle(0xffffff, 0.16).fillRoundedRect(tube.x + 4, tube.y + 3, tube.w - 8, tube.h * 0.28, 4);   // glass sheen
        g.lineStyle(1.5, 0xffffff, 0.5).strokeRoundedRect(tube.x, tube.y, tube.w, tube.h, tube.h / 2);
        const n = Math.max(1, G.cfg.goal), span = tube.w * 0.74, sr = Math.min(9, (span / n) * 0.4);
        for (let i = 0; i < n; i++) starfish(g, tube.x + 12 + ((i + 0.5) / n) * (span - 8), tube.y + tube.h / 2, sr, { hollow: i >= G.completed, rot: i * 0.4 });
        L.text('goal', tube.x + tube.w - 22, tube.y + tube.h / 2 + 1, `${G.completed}/${G.cfg.goal}`, { size: 14, stroke: hexCss(T.deeper), sw: 3 });
        // pause: a brass valve wheel
        const pc = { x: pause.x + pause.w / 2, y: pause.y + pause.h / 2 }, r = pause.w / 2 + 1, dy = this.zBase.pressed === 'pause' ? 2 : 0;
        porthole(g, pc.x, pc.y + dy, r, { thick: 5 });
        g.fillStyle(BR.hi, 1).fillRoundedRect(pc.x - 6.5, pc.y + dy - 6.5, 4.5, 13, 2).fillRoundedRect(pc.x + 2, pc.y + dy - 6.5, 4.5, 13, 2);
        this.zBase.add('pause', { x: pause.x - 4, y: pause.y - 4, w: pause.w + 8, h: pause.h + 8 }, { click: () => (document.getElementById('pauseBtn') as HTMLElement).click() });
    }

    // Backup shelf: glass jars on a brass rail. Slots sit exactly where the game's own (hidden) slots are, so flying fish still land in them
    private backupTray(c: Ctx) {
        const { o, G } = c, g = this.base.g, bk = rectOf(document.getElementById('backup'), o), t = this.time.now / 1000;
        if (!G || !bk || !G.cfg.backup) return;   // level 1 has no Backup (the game hides the shelf there)
        c.hits.push(bk);
        const warn = G.backup.length >= BACKUP_MAX - 1, k = 0.5 + 0.5 * Math.sin(t * 7);
        const rail: R = { x: bk.x + 4, y: bk.y + bk.h - 8, w: bk.w - 8, h: 8 };
        brass(g, rail, 4);
        rivet(g, rail.x + 7, rail.y + 4, 1.5); rivet(g, rail.x + rail.w - 7, rail.y + 4, 1.5);
        if (warn) g.fillStyle(T.coral, 0.3 + 0.3 * k).fillRoundedRect(rail.x, rail.y, rail.w, rail.h, 4);
        document.querySelectorAll('#backup .slot').forEach((el, i) => {
            const s = rectOf(el, o); if (!s) return;
            const it = G.backup[i], cx = s.x + s.w / 2, cy = s.y + s.h / 2 - 1, r = s.w / 2 - 1;
            g.fillStyle(BR.lo, 0.9).fillEllipse(cx, rail.y + 1, r * 1.5, 4);   // the jar stands on the rail
            const water = !it ? 0.2 : it.filler ? 0.85 : it.junk ? 0.4 : 0.34, wcol = it?.filler ? 0x3a1c78 : it?.junk ? T.coral : T.aqua;
            g.fillStyle(wcol, water).slice(cx, cy, r - 1.5, 0, Math.PI, false).fillPath();
            bubble(g, cx, cy, r, { tint: 0xbfeaff, alpha: it ? 0.12 : 0.1, rim: it?.junk ? T.coralL : it?.filler ? 0xc9b0ff : BR.hi });
        });
    }
}
