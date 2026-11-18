# 1. Overview

| | |
|---|---|
| **Title** | Fishy Find (earlier name: Spot A Fish; working name in the source: Find Fish) |
| **Genre** | Casual puzzle: find and tap the right object in a crowded 3D aquarium |
| **Platform** | Web, mobile portrait first (touch and mouse) |
| **Engine** | Three.js 0.186 for the 3D tank, Phaser 4 for all UI (HUD, target tanks, popups), bundled by Vite |
| **Status** | Prototype. 60 levels, not yet playtested on a real phone |

## 1.1 Pitch

A round 3D fish tank is full of fish. Two target tanks above it ask for specific species. Tap the right fish before your Backup tray fills up. Wrong taps go into a 7-slot Backup; when it is full you lose.

## 1.2 Target player

_TBD_

## 1.3 What the prototype is built from <Badge type="tip" text="Live" />

- Fish are **49 static 3D models** (single mesh and one texture each, `public/models/fish/<name>/`, prepared by `scripts/prep-fish.py`): 12 from ChatGPT, 6 from Codex and 31 from Tripo, including a whale, a shark and a sea horse that never are targets. Each species is one model; look-alike decoys of the same colour family appear more often in harder levels. There is no skeleton: the body wave is done in the vertex shader.
- **Artist models** are used for the octopus, the jellyfish, the clam and the decoration: the clay pot, the stone pillars and statue, the anchor, three corals and the glass bottle (`public/models/<name>/`, one `model.fbx` and one `tex.png` each; the corals sway in the current, the anchor rocks, the Atlantis crystals glimmer). The rest is a **mesh built in code**, used as a placeholder: rocks, houses, arches, seaweed, anemones, the treasure chest, the wreck, barrels, crystals, the pump tube, the food bucket and the pearl.
- **The UI is art too:** the pop-ups (Pause, Out of space, Purchase, Well Done, Level failed), the buttons and icons are pictures in `public/ui/bf/` and `public/ui/new/`, drawn by Phaser; the target tanks, the Backup and the loading screen use pictures in `public/ui/tanks/` and `public/ui/load/`; the logo is `public/ui/load/logo.png`.
- **6 tank shapes** (cylinder, bowl, rounded box, hexagon, flower, heart) and **6 hall looks**, one for every 10 levels.
- Fish swim with a body wave, turn, and react when scared. They bite the food when it is fed. All 49 blink: 32 by turning the eye on their texture into the colour of the skin next to it (the colour is read from the rendered fish), 17 by a lid made of the body's own triangles round the eye that fades in over it (`refineLid` / `geoLid` in `game/src/main.js`; for 8 of them the eye position is given by hand in `EYE_AT`).
- Fish get a soft dark outline taken from their own colour.
- The tank sits in an "aquarium hall" 3D scene. Glass and water bend the view through a post-process lens; the water surface reflects the sky and ripples on impact.
- Sounds and music are recorded files in `public/sfx` (see `sounds.md` for which one plays when); a sound without a file does not play.

## 1.4 Controls <Badge type="tip" text="Live" />

- Drag to rotate the tank (after a 18 px move, so a light tap does not nudge it). Pinch or mouse wheel to zoom. **Two fingers dragging up or down move the view** up and down (a long way when zoomed in; when the whole tank is in view it gives a little and springs back, so the player feels it work); two fingers pinching only zoom. A button resets the camera.
- On desktop, hovering a fish enlarges it and shows a **gold outline** so the player knows which fish a click will hit. On touch the outline shows only while the finger is down. A tap on the water makes the nearby fish dart away; the surface only ripples when the tap is at or near the surface.

## 1.5 Look and sound

See [Art and audio](./art-audio).
