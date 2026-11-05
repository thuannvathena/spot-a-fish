# Spot A Fish

A 3D aquarium puzzle: find and tap the fish your target tanks need.

A 3D aquarium game: the tank is Three.js, all UI (HUD, tanks, popups) is Phaser 4 drawn on top. Play it at https://thuannvathena.github.io/spot-a-fish/demo/ · docs and Game Design Document at https://thuannvathena.github.io/spot-a-fish/docs/.

## Run

```bash
npm install
npm run dev          # game with the Phaser UI: http://localhost:8080
npm run build        # standalone Three.js game (game/index.html) and the level editor
npm run docs:dev     # docs and GDD dev server
```

## Releases

The live site is built locally and pushed to the `gh-pages` branch. There is no CI deploy.

```bash
npm run release:latest                  # after pushing main: update https://thuannvathena.github.io/spot-a-fish/
npm version minor && npm run release    # publish a frozen copy at /spot-a-fish/vX.Y.0/
```

The landing page lists every version. See `docs/guide/deployment.md` for details.
