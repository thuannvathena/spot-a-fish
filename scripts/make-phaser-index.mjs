// Generates ./index.html (the Phaser + Three.js page) from the Three.js game's own template,
// so the game's HTML/CSS stays in one place: game/src/template.html.
import fs from 'fs';
let t = fs.readFileSync('game/src/template.html', 'utf8');
const extra = `<style>
/* Phaser HUD layer: sits on top of the Three.js canvas, never takes pointer events itself */
/* high-DPI: the Phaser canvas has DPR times more pixels than its CSS box, so the HUD is sharp on retina screens (see main.ts and Hud.ts) */
#phaser-hud{position:absolute;inset:0;z-index:4;pointer-events:none}
#phaser-hud canvas{pointer-events:none!important;width:100%!important;height:100%!important}
/* the HTML UI stays in the layout as a hidden model (the game writes state and reads positions there); Phaser draws it all */
.topbar,.backup,.targets,.tools,.pan,.overlay,#spotOv,#tut,#toast,#goalMsg,#hint,#camTut,#guideHand{visibility:hidden!important}
</style>`;
t = t.replace('/*FONT*/', '').replace('</head>', extra + '\n</head>')
  .replace('<div id="app">', '<div id="app"><div id="phaser-hud"></div>')
  .replace('<script>/*BUNDLE*/</script>', '<script type="module" src="/src/main.ts"></script>');
if (!t.includes('src/main.ts') || !t.includes('phaser-hud"></div>')) throw new Error('template markers not found');
fs.writeFileSync('index.html', t);
console.log('wrote index.html');
