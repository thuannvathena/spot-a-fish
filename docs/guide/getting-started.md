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

Run `npm run dev -- --host` (the full game with the Phaser UI) and open the printed network URL on a phone on the same Wi‑Fi. (The standalone `game/index.html` has no Phaser UI, so it is only good for the 3D part.)

## Game source

The game is JavaScript on Three.js (the 3D tank) with Phaser 4 for the UI: the logic and the 3D scene are in `game/src/main.js`, the HTML shell (and the hidden elements the UI reads) in `game/src/template.html`, the Phaser UI in `src/ui/` and `src/scenes/`, and the 3D models, UI pictures and sounds in `public/` (`models/`, `ui/`, `sfx/`). After editing `game/src/main.js`, run `npm run spike:prepare` (it rebuilds the game page) and reload with a new `?v=N` so the browser does not use its cache. Level data lives in `game/src/levels.json` (edit with the [level editor](/guide/editor)); see the GDD chapter [Levels](/gdd/levels).
