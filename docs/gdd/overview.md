# 1. Overview

| | |
|---|---|
| **Title** | Fishy Find (earlier name: Spot A Fish; working name in the source: Find Fish) |
| **Genre** | Casual puzzle: find and tap the right object in a crowded 3D aquarium |
| **Platform** | Web, mobile portrait first (touch and mouse) |
| **Engine** | Three.js 0.186 for the 3D tank, Phaser 4 for all UI (HUD, target tanks, popups), bundled by Vite |
| **Status** | Prototype. 15 levels, not yet playtested on a real phone |

## 1.1 Pitch

A round 3D fish tank is full of fish. Two target tanks above it ask for specific species. Tap the right fish before your Backup tray fills up. Wrong taps go into a 7-slot Backup; when it is full you lose.

## 1.2 Target player

_TBD_

## 1.3 What the prototype is built from <Badge type="tip" text="Live" />

- Fish are **49 static 3D models** (single mesh and one texture each, `public/models/fish/<name>/`, prepared by `scripts/prep-fish.py`): 12 from ChatGPT, 6 from Codex and 31 from Tripo, including a whale, a shark and a sea horse that never are targets. Each species is one model; look-alike decoys of the same colour family appear more often in harder levels. There is no skeleton: the body wave is done in the vertex shader.
- Every other object (sea urchin, jellyfish, squid, clam, tank decorations, pump tube, food bucket, pearl) is a **mesh built in code**, used as a placeholder.
- Fish swim with a body wave, turn, and react when scared. All 49 blink: 32 by turning the eye on their texture into the colour of the skin next to it (the colour is read from the rendered fish), 17 by a lid made of the body's own triangles round the eye that fades in over it (`refineLid` / `geoLid` in `game/src/main.js`; for 8 of them the eye position is given by hand in `EYE_AT`).
- Fish get a soft dark outline taken from their own colour.
- The tank sits in an "aquarium hall" 3D scene. Glass and water bend the view through a post-process lens; the water surface reflects the sky and ripples on impact.
- Sounds and music are recorded files in `public/sfx` (see `sounds.md` for which one plays when); a sound without a file does not play.

## 1.4 Controls <Badge type="tip" text="Live" />

- Drag to rotate the tank. Pinch or mouse wheel to zoom. Two arrow buttons tilt the camera up or down. A button resets the camera.
- On desktop, hovering a fish enlarges it and shows a **gold outline** so the player knows which fish a click will hit. On touch the outline shows only while the finger is down.

## 1.5 Look and sound

See [Art and audio](./art-audio).
