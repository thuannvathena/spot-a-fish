// Builds the level editor into one file: editor/index.html (uses the game's node_modules, run `npm ci` in game/ first).
import { build } from 'esbuild';
import fs from 'fs';
import { fileURLToPath } from 'url';
const here = fileURLToPath(new URL('.', import.meta.url));
// the fish icons for the roster in the editor: small pictures of the 3D models, embedded in the page
const ICONS = fileURLToPath(new URL('../assets/fishicons/', import.meta.url));
fs.writeFileSync(here + '../src/fishicons.js', 'export const FISH_ICONS = ' + JSON.stringify(fs.readdirSync(ICONS).filter(f => /\.png$/.test(f)).sort().map(f => ({ n: parseInt(f), src: 'data:image/png;base64,' + fs.readFileSync(ICONS + f).toString('base64') }))) + ';\n');
const r = await build({ entryPoints: [here + 'main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', loader: { '.json': 'json' } });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const tpl = fs.readFileSync(here + 'template.html', 'utf8');
fs.writeFileSync(here + 'index.html', tpl.replace('/*BUNDLE*/', () => js));
console.log('built editor', (fs.statSync(here + 'index.html').size / 1024).toFixed(0) + ' KB');
