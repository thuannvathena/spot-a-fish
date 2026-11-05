#!/usr/bin/env bash
# Assembles the GitHub Pages site: landing page at /, game at /demo/, docs at /docs/.
set -euo pipefail

rm -rf _site
npm run build           # standalone Three.js game -> game/index.html, level editor -> game/editor/index.html
npm run build:phaser    # the game page with the Phaser UI -> dist/
npm run docs:build

mkdir -p _site
cp site/index.html _site/
cp -R dist _site/demo
mkdir -p _site/editor
cp game/editor/index.html _site/editor/index.html
cp -R docs/.vitepress/dist _site/docs
