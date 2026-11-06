import * as Phaser from 'phaser';

// Small toolkit for drawing the game's UI in Phaser. The game logic still writes its state to hidden HTML elements
// (they keep layout, classes and text), and the panels in panels.ts mirror those elements into Phaser objects every frame.

export interface R { x: number; y: number; w: number; h: number }
export const FONT = '"Lilita One", system-ui, sans-serif';
export const INK = 0x0a2f57, INK2 = 0x06213f;
export const DPR = Math.min(Number((/[?&]uires=([\d.]+)/.exec(location.search) || [])[1]) || 2, window.devicePixelRatio || 1)   // ?uires=3 draws the UI at the phone's full pixel density;

/** Element box in HUD coordinates (CSS pixels from the HUD's top-left), or null when it is not laid out. */
export const rectOf = (el: Element | null | undefined, o: DOMRect): R | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0 ? { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height } : null;
};
export const shown = (el: Element | null | undefined): boolean => !!el && getComputedStyle(el).display !== 'none';
export const opacityOf = (el: Element): number => { const v = parseFloat(getComputedStyle(el).opacity); return isNaN(v) ? 1 : v; };
export const fontPx = (el: Element, fallback = 16): number => { const v = parseFloat(getComputedStyle(el).fontSize); return isNaN(v) ? fallback : v; };
export const hex = (css: string, fallback = 0xffffff): number => {
    const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? (+m[1] << 16) | (+m[2] << 8) | +m[3] : fallback;
};
export const inRect = (r: R | null, x: number, y: number) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// ---- textures from image URLs (the game keeps fish thumbnails as data URLs) ----
const keys = new Map<string, string>();
export function texFor(scene: Phaser.Scene, src: string): string | null {
    if (!src) return null;
    let key = keys.get(src);
    if (!key) { key = 'dyn' + keys.size; keys.set(src, key); scene.textures.addBase64(key, src); }
    return scene.textures.exists(key) ? key : null;
}

export interface TextOpts { size?: number; color?: string; stroke?: string; sw?: number; ox?: number; oy?: number; alpha?: number; wrap?: number; align?: 'left' | 'center'; italic?: boolean }

/** One drawing layer: a Graphics object plus pools of texts and images, all at the same depth band. */
export class Layer {
    readonly g: Phaser.GameObjects.Graphics;
    readonly gt: Phaser.GameObjects.Graphics;   // a second graphics for the booster buttons, so they can fade as a whole
    private texts = new Map<string, { t: Phaser.GameObjects.Text; sig: string }>();
    private imgs = new Map<string, Phaser.GameObjects.Image>();
    private used = new Set<string>();

    constructor(private scene: Phaser.Scene, private depth: number) {
        this.g = scene.add.graphics().setDepth(depth);
        this.gt = scene.add.graphics().setDepth(depth + 0.05);
    }

    begin() { this.g.clear(); this.gt.clear(); this.used.clear(); }

    end() {
        this.texts.forEach((v, k) => { if (!this.used.has('t' + k)) v.t.setVisible(false); });
        this.imgs.forEach((v, k) => { if (!this.used.has('i' + k)) v.setVisible(false); });
    }

    /** Text anchored by its centre (ox/oy 0.5) by default. */
    text(key: string, x: number, y: number, str: string, o: TextOpts = {}) {
        let e = this.texts.get(key);
        if (!e) {
            e = { t: this.scene.add.text(0, 0, '', { fontFamily: FONT }).setResolution(DPR).setDepth(this.depth + 0.5), sig: '' };
            this.texts.set(key, e);
        }
        const sig = [o.size, o.color, o.stroke, o.sw, o.wrap, o.align].join('|');
        if (sig !== e.sig) {
            e.sig = sig;
            e.t.setStyle({ fontFamily: FONT, fontSize: `${o.size ?? 16}px`, color: o.color ?? '#ffffff', stroke: o.stroke ?? '', strokeThickness: o.stroke ? (o.sw ?? 4) : 0, align: o.align ?? 'center', wordWrap: o.wrap ? { width: o.wrap } : undefined });
        }
        e.t.setOrigin(o.ox ?? 0.5, o.oy ?? 0.5).setPosition(x, y).setAlpha(o.alpha ?? 1).setVisible(true);
        if (e.t.text !== str) e.t.setText(str);
        this.used.add('t' + key);
        return e.t;
    }

    /** A preloaded picture stretched to a box (the painted UI pieces). Returns false when the texture is not there. */
    pic(key: string, tex: string, r: R, o: { alpha?: number } = {}) {
        if (!this.scene.textures.exists(tex)) return false;
        let im = this.imgs.get(key);
        if (!im) { im = this.scene.add.image(0, 0, tex).setDepth(this.depth + 0.2); this.imgs.set(key, im); }
        im.setPosition(r.x + r.w / 2, r.y + r.h / 2).setDisplaySize(r.w, r.h).setAlpha(o.alpha ?? 1).setVisible(true);
        this.used.add('i' + key);
        return true;
    }

    /** Image fitted inside a box (object-fit: contain). Returns false while the texture is still loading. */
    image(key: string, src: string, r: R, o: { alpha?: number; tint?: number; rot?: number } = {}) {
        const tk = texFor(this.scene, src);
        if (!tk) return false;
        let im = this.imgs.get(key);
        if (!im) { im = this.scene.add.image(0, 0, tk).setDepth(this.depth + 0.25); this.imgs.set(key, im); }
        if (im.texture.key !== tk) im.setTexture(tk);
        const f = this.scene.textures.get(tk).getSourceImage() as HTMLImageElement, s = Math.min(r.w / f.width, r.h / f.height);
        im.setPosition(r.x + r.w / 2, r.y + r.h / 2).setDisplaySize(f.width * s, f.height * s).setAlpha(o.alpha ?? 1).setRotation(o.rot ?? 0).setVisible(true);
        if (o.tint === undefined) im.clearTint(); else im.setTint(o.tint);
        this.used.add('i' + key);
        return im;
    }
}

// ---- aquarium theme: deep water blues, foam white, coral and amber accents, sea green for success ----
export const T = { deep: 0x2186d3, deeper: 0x16639f, mid: 0x4db3ee, aqua: 0x5fe4f0, foam: 0xf2fbff, coral: 0xff7a5c, coralD: 0xb83a28, coralL: 0xffb4a0, amber: 0xffc14d, amberD: 0x9a5e10, amberL: 0xffe3a0, sea: 0x2fd6a3, seaD: 0x0c7d62, seaL: 0x9bf0d6 };
export const hexCss = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** Frosted-glass panel: soft shadow, translucent tint, light on top, shade below, a bright rim. */
export function glass(g: Phaser.GameObjects.Graphics, r: R, radius: number, o: { tint?: number; alpha?: number; rim?: number; rimA?: number; shadow?: boolean; hi?: number } = {}) {
    const a = o.alpha ?? 0.5, tint = o.tint ?? T.deep, rim = o.rim ?? 0xffffff;
    if (o.shadow !== false) for (let i = 3; i >= 1; i--) g.fillStyle(0x021428, 0.07).fillRoundedRect(r.x - i, r.y + 2 + i * 1.6, r.w + i * 2, r.h + i, radius + i);
    g.fillStyle(tint, a).fillRoundedRect(r.x, r.y, r.w, r.h, radius);
    g.fillStyle(0x000000, 0.14).fillRoundedRect(r.x + 2, r.y + r.h * 0.58, r.w - 4, r.h * 0.4, { tl: 2, tr: 2, bl: Math.max(2, radius - 2), br: Math.max(2, radius - 2) });
    g.fillStyle(0xffffff, o.hi ?? 0.2).fillRoundedRect(r.x + 3, r.y + 3, r.w - 6, Math.max(4, r.h * 0.42), { tl: Math.max(2, radius - 3), tr: Math.max(2, radius - 3), bl: 4, br: 4 });
    g.lineStyle(2, rim, o.rimA ?? 0.7).strokeRoundedRect(r.x, r.y, r.w, r.h, radius);
    g.lineStyle(1, 0xffffff, 0.35).strokeRoundedRect(r.x + 2.5, r.y + 2.5, r.w - 5, r.h - 5, Math.max(2, radius - 2));
}

/** A glass bubble: translucent disc, rim, a bright highlight and a faint lower reflection. */
export function bubble(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rad: number, o: { tint?: number; alpha?: number; rim?: number } = {}) {
    g.fillStyle(o.tint ?? 0xbfeaff, o.alpha ?? 0.26).fillCircle(cx, cy, rad);
    g.fillStyle(0x000a28, 0.12).fillEllipse(cx, cy + rad * 0.35, rad * 1.5, rad * 0.9);
    g.lineStyle(2, o.rim ?? 0xffffff, 0.85).strokeCircle(cx, cy, rad);
    g.fillStyle(0xffffff, 0.8).fillEllipse(cx - rad * 0.35, cy - rad * 0.4, rad * 0.5, rad * 0.28);
    g.fillStyle(0xffffff, 0.4).fillCircle(cx + rad * 0.45, cy + rad * 0.4, Math.max(1, rad * 0.08));
}

// ---- brass-and-glass hardware ----
export const BR = { hi: 0xf4dc94, mid: 0xc9a042, lo: 0x8a621f, dk: 0x4e350f };

/** Brushed brass plate: soft shadow, top-lit gradient, bright top edge, dark outline. */
export function brass(g: Phaser.GameObjects.Graphics, r: R, radius: number, o: { shadow?: boolean; alpha?: number } = {}) {
    const a = o.alpha ?? 1;
    if (o.shadow !== false) for (let i = 3; i >= 1; i--) g.fillStyle(0x021428, 0.08 * a).fillRoundedRect(r.x - i, r.y + 2 + i * 1.5, r.w + i * 2, r.h + i, radius + i);
    vgrad(g, r, radius, [[0, BR.hi], [0.42, BR.mid], [1, BR.lo]], 18, a);
    g.fillStyle(0xffffff, 0.38 * a).fillRoundedRect(r.x + radius * 0.6, r.y + 1.5, Math.max(2, r.w - radius * 1.2), 2, 1);
    g.lineStyle(1.5, BR.dk, 0.85 * a).strokeRoundedRect(r.x, r.y, r.w, r.h, radius);
}
/** A dark inset (the window behind glass, the inside of a brass frame). */
export function recess(g: Phaser.GameObjects.Graphics, r: R, radius: number, tint = 0x1f7cc8, alpha = 1) {
    g.fillStyle(tint, alpha).fillRoundedRect(r.x, r.y, r.w, r.h, radius);
    g.fillStyle(0x000000, 0.16).fillRoundedRect(r.x, r.y, r.w, Math.max(3, r.h * 0.14), { tl: radius, tr: radius, bl: 2, br: 2 });
    g.lineStyle(1.5, 0x021428, 0.55).strokeRoundedRect(r.x, r.y, r.w, r.h, radius);
}
export function rivet(g: Phaser.GameObjects.Graphics, x: number, y: number, rad = 2) {
    g.fillStyle(BR.dk, 0.9).fillCircle(x + 0.4, y + 0.8, rad); g.fillStyle(BR.hi, 1).fillCircle(x, y, rad * 0.82); g.fillStyle(0xffffff, 0.85).fillCircle(x - rad * 0.3, y - rad * 0.3, rad * 0.32);
}
/** Round brass bezel with a dark glass window (porthole, valve housing, button bezel). */
export function porthole(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rad: number, o: { glass?: number; glassA?: number; thick?: number } = {}) {
    const th = o.thick ?? Math.max(3, rad * 0.22);
    g.fillStyle(0x021428, 0.22).fillCircle(cx + 0.5, cy + 3, rad + 1);
    g.fillStyle(BR.dk, 1).fillCircle(cx, cy, rad); g.fillStyle(BR.lo, 1).fillCircle(cx, cy, rad - 1); g.fillStyle(BR.mid, 1).fillCircle(cx, cy - 0.5, rad - 1.6);
    g.fillStyle(BR.hi, 1).fillEllipse(cx - rad * 0.12, cy - rad * 0.55, rad * 1.1, rad * 0.5); g.fillStyle(BR.mid, 1).fillCircle(cx, cy + 0.5, rad - th * 0.9);
    g.fillStyle(BR.dk, 1).fillCircle(cx, cy, rad - th); g.fillStyle(o.glass ?? 0x1f7cc8, o.glassA ?? 1).fillCircle(cx, cy, rad - th - 1.2);
    g.lineStyle(1.2, 0xffffff, 0.3).strokeCircle(cx, cy, rad - th - 1.2); g.fillStyle(0xffffff, 0.12).fillEllipse(cx - rad * 0.2, cy - rad * 0.3, rad * 0.9, rad * 0.45);
}
/** A starfish: five rounded arms, warm gold with pale dots, or an empty outline. */
export function starfish(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rad: number, o: { hollow?: boolean; rot?: number; alpha?: number } = {}) {
    const a = o.alpha ?? 1, rot = o.rot ?? 0, pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) { const an = rot - Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 === 0 ? rad : rad * 0.5; pts.push(new Phaser.Math.Vector2(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr)); }
    if (o.hollow) { g.lineStyle(1.6, 0xffffff, 0.55 * a).strokePoints(pts, true, true); return; }
    g.fillStyle(0x6a3f08, 0.5 * a).fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x + 0.6, p.y + 1.2)), true);
    g.fillStyle(0xe8a023, a).fillPoints(pts, true);
    g.fillStyle(0xffd470, 0.9 * a).fillCircle(cx, cy - rad * 0.08, rad * 0.4);
    for (let i = 0; i < 5; i++) { const an = rot - Math.PI / 2 + (i * 2 * Math.PI) / 5; g.fillStyle(0xfff0b8, 0.9 * a).fillCircle(cx + Math.cos(an) * rad * 0.62, cy + Math.sin(an) * rad * 0.62, Math.max(0.8, rad * 0.09)); }
    g.lineStyle(1.3, 0x8a5a10, 0.9 * a).strokePoints(pts, true, true);
}
/** A pearl: soft white sphere with a bright highlight; an optional warm glow behind it. */
export function pearl(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rad: number, o: { glow?: number; dim?: boolean } = {}) {
    if (o.glow !== undefined) { g.fillStyle(o.glow, 0.28).fillCircle(cx, cy, rad + 6); g.fillStyle(o.glow, 0.3).fillCircle(cx, cy, rad + 3); }
    g.fillStyle(0x021428, 0.22).fillCircle(cx + 0.5, cy + 2, rad);
    g.fillStyle(o.dim ? 0x7d93a6 : 0xa6c4da, 1).fillCircle(cx, cy, rad); g.fillStyle(o.dim ? 0xa7b9c8 : 0xd6eaf6, 1).fillCircle(cx - rad * 0.08, cy - rad * 0.1, rad * 0.84);
    g.fillStyle(0xffffff, o.dim ? 0.5 : 0.95).fillCircle(cx - rad * 0.26, cy - rad * 0.3, rad * 0.46); g.lineStyle(1.4, 0xffffff, 0.8).strokeCircle(cx, cy, rad);
}

/** Rounded rectangle with an optional border and a lower "3D" edge. */
export function plate(g: Phaser.GameObjects.Graphics, r: R, radius: number, fill: number, o: { border?: number; bw?: number; edge?: number; edgeH?: number; gloss?: number; alpha?: number } = {}) {
    const a = o.alpha ?? 1;
    if (o.edge !== undefined) g.fillStyle(o.edge, a).fillRoundedRect(r.x, r.y + (o.edgeH ?? 4), r.w, r.h, radius);
    g.fillStyle(fill, a).fillRoundedRect(r.x, r.y, r.w, r.h, radius);
    if (o.gloss !== undefined) g.fillStyle(o.gloss, a).fillRoundedRect(r.x + 3, r.y + 3, r.w - 6, Math.max(4, r.h * 0.38), Math.max(2, radius - 3));
    if (o.border !== undefined) g.lineStyle(o.bw ?? 3, o.border, a).strokeRoundedRect(r.x, r.y, r.w, r.h, radius);
}

/** Vertical colour gradient inside a rounded rectangle (stops: position 0..1 and colour), drawn as thin opaque bands. */
export function vgrad(g: Phaser.GameObjects.Graphics, r: R, radius: number, stops: [number, number][], steps = 28, alpha = 1) {
    const mix = (a: number, b: number, k: number) => { const f = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k); return (f(16) << 16) | (f(8) << 8) | f(0); };
    for (let i = 0; i < steps; i++) {
        const u = (i + 0.5) / steps; let j = 0; while (j < stops.length - 2 && u > stops[j + 1][0]) j++;
        const [p0, c0] = stops[j], [p1, c1] = stops[j + 1], col = mix(c0, c1, Math.min(1, Math.max(0, (u - p0) / (p1 - p0))));
        g.fillStyle(col, alpha).fillRoundedRect(r.x, r.y + (r.h * i) / steps, r.w, r.h / steps + (alpha < 1 ? 0 : 1), i === 0 ? { tl: radius, tr: radius, bl: 0, br: 0 } : i === steps - 1 ? { tl: 0, tr: 0, bl: radius, br: radius } : 0);
    }
}

/** Touch targets. Zones forward taps to the game (usually by clicking the hidden HTML control). */
export class Zones {
    private zones = new Map<string, { z: Phaser.GameObjects.Zone; cb: ZoneCb; down: boolean; on: boolean }>();
    private used = new Set<string>();
    pressed = '';

    constructor(private scene: Phaser.Scene, private depth: number) { }

    begin() { this.used.clear(); }

    end() {
        this.zones.forEach((v, k) => {
            const on = this.used.has(k);
            if (on && !v.on) { v.on = true; v.z.setInteractive(); } else if (!on && v.on) { v.on = false; v.down = false; v.z.disableInteractive(); }
        });
    }

    /** Register an area for this frame. The callbacks can change every frame. */
    add(key: string, r: R, cb: ZoneCb) {
        let e = this.zones.get(key);
        if (!e) {
            const z = this.scene.add.zone(0, 0, 10, 10).setDepth(this.depth).setInteractive();
            e = { z, cb, down: false, on: true };
            const ent = e;
            z.on('pointerdown', () => { ent.down = true; this.pressed = key; ent.cb.down?.(); });
            z.on('pointerup', () => { if (ent.down) { ent.down = false; if (this.pressed === key) this.pressed = ''; ent.cb.up?.(); ent.cb.click?.(); } });
            z.on('pointerout', () => { if (ent.down) { ent.down = false; if (this.pressed === key) this.pressed = ''; ent.cb.up?.(); } });
            this.zones.set(key, e);
        }
        e.cb = cb;
        e.z.setPosition(r.x + r.w / 2, r.y + r.h / 2).setSize(r.w, r.h);
        if (e.z.input) e.z.input.hitArea.setTo(0, 0, r.w, r.h);
        this.used.add(key);
    }
}
export interface ZoneCb { click?: () => void; down?: () => void; up?: () => void }
