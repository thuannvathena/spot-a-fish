# Getting Started

## Requirements

- Node.js 20.19 or newer
- npm

## Install

```bash
git clone https://github.com/thuannvathena/spot-a-fish.git
cd spot-a-fish
npm install
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Game with the Phaser UI at http://localhost:8080 (needs the dev server: opening `index.html` as a file shows a black page) |
| `npm run build` | Install game dependencies (`game/`); build the standalone Three.js game (`game/index.html`) and the level editor |
| `npm run build:phaser` | Build the game page with the Phaser UI into `dist/` (this is `/demo/` on the site) |
| `npm run docs:dev` | Start the docs dev server |
| `npm run docs:build` | Build the docs into `docs/.vitepress/dist/` |
| `npm run build:site` | Build the full Pages site (landing + demo + docs) into `_site/` |

## Testing on a phone

Build the game, then serve `game/` on your network (for example `cd game && npx http-server -a 0.0.0.0`) and open the printed network URL on a phone on the same Wi‑Fi.

## Game source

The game is plain JavaScript on Three.js: logic in `game/src/main.js`, UI in `game/src/template.html`, fish images in `game/assets/fishes/`. After editing, run `npm run build` (or `cd game && node build.mjs`) and open `game/index.html`. Level data lives in `game/src/levels.json` (edit with the [level editor](/guide/editor)); see the GDD chapter [Levels](/gdd/levels).
