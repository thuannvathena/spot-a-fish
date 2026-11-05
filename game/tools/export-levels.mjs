// Regenerates src/levels.json (the built-in 15 levels) from the rules in src/levelcfg.js.
import fs from 'fs';
import { levelToJson } from '../src/levelcfg.js';
const out = Array.from({ length: 15 }, (_, i) => levelToJson(i + 1));
fs.writeFileSync(new URL('../src/levels.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('wrote', out.length, 'levels');
