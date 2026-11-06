import { build } from 'esbuild';
import fs from 'fs';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const tpl = fs.readFileSync('src/template.html', 'utf8');
const font = '@font-face{font-family:"Lilita One";font-weight:400;font-display:block;src:url(data:font/woff2;base64,' + fs.readFileSync('node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2').toString('base64') + ') format("woff2")}';
fs.writeFileSync('index.html', tpl.replace('/*FONT*/', () => font).replace('/*BUNDLE*/', () => js));
console.log('built', (fs.statSync('index.html').size / 1024).toFixed(0) + ' KB');
