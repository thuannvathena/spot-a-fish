import * as Phaser from 'phaser';
import '@fontsource/lilita-one';
// The Three.js game (3D tank, fish, events, tube). It runs on import and renders into canvas#c below the Phaser layer.
import '../game/src/main.js';
import { Hud } from './scenes/Hud';

const app = document.getElementById('app') as HTMLElement;
const host = document.getElementById('phaser-hud') as HTMLElement;
// Native pixel density: the canvas has DPR times more pixels than its CSS box (Hud.ts zooms its camera by the same factor).
// Phaser 4 has no resolution option, so the size is set by hand and kept in sync with the layout.
const DPR = Math.min(Number((/[?&]uires=([\d.]+)/.exec(location.search) || [])[1]) || 2, window.devicePixelRatio || 1)   // ?uires=3 draws the UI at the phone's full pixel density;
const px = () => ({ w: Math.max(1, Math.round(host.clientWidth * DPR)), h: Math.max(1, Math.round(host.clientHeight * DPR)) });

// Phaser draws the HUD on a transparent canvas above the 3D canvas. The canvas ignores pointer events (CSS),
// so Phaser listens on #app instead: taps still reach the 3D canvas below, and Hud.ts tells the 3D side which taps belong to Phaser UI.
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    title: 'Spot A Fish',
    transparent: true,
    parent: 'phaser-hud',
    scale: { mode: Phaser.Scale.NONE, width: px().w, height: px().h },
    input: { mouse: { target: app }, touch: { target: app } },
    scene: [Hud]
};

// Wait for the HUD font so Phaser text is rendered with it from the first frame.
document.fonts.load('28px "Lilita One"').finally(() => {
    const game = new Phaser.Game(config);
    new ResizeObserver(() => { const { w, h } = px(); game.scale.resize(w, h); }).observe(host);
    if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
    (window as unknown as { __phaser: Phaser.Game }).__phaser = game;   // used by the ?prof=1 test buttons
});
