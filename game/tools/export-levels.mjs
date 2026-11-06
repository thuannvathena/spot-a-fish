// Regenerates src/levels.json: the built-in 15 levels come from the rules in src/levelcfg.js.
// Hand-made levels after L15 (e.g. L16, the 3D fish test) are kept as they are.
import fs from 'fs';
import { levelToJson } from '../src/levelcfg.js';
const file = new URL('../src/levels.json', import.meta.url);
const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const out = [...Array.from({ length: 15 }, (_, i) => levelToJson(i + 1)), ...old.slice(15)];
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log('wrote', out.length, 'levels');
