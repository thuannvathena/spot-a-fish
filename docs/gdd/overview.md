# 1. Overview

| | |
|---|---|
| **Title** | Spot A Fish (working name in the source: Find Fish) |
| **Genre** | Casual puzzle: find and tap the right object in a crowded 3D aquarium |
| **Platform** | Web, mobile portrait first (touch and mouse) |
| **Engine** | Three.js 0.186 for the 3D tank, Phaser 4 for all UI (HUD, target tanks, popups), bundled by Vite |
| **Status** | Prototype. 15 levels, not yet playtested on a real phone |

## 1.1 Pitch

A round 3D fish tank is full of fish. Two target tanks above it ask for specific species. Tap the right fish before your Backup tray fills up. Wrong taps go into a 7-slot Backup; when it is full you lose.

## 1.2 Target player

_TBD_

## 1.3 What the prototype is built from <Badge type="tip" text="Live" />

- Fish are **rigged 3D models**: 22 from the Unity set (converted with `scripts/unity-fish-to-glb.py`) and the `blue_white_babe` model. Each species is one model; look-alike decoys are the same model with the colours turned.
- Every other object (sea urchin, jellyfish, squid, clam, tank decorations, pump tube, food bucket, pearl) is a **mesh built in code**, used as a placeholder.
- Fish swim with a body wave on their skeleton, turn, flap their fins and react when scared. The Unity fish blink by turning the eye picture on their texture into the colour of the body next to it.
- Fish get a soft dark outline taken from their own colour.
- The tank sits in an "aquarium hall" 3D scene. Glass and water bend the view through a post-process lens; the water surface reflects the sky and ripples on impact.
- All sounds are synthesized in code (WebAudio). There are no audio files and no music.

## 1.4 Controls <Badge type="tip" text="Live" />

- Drag to rotate the tank. Pinch or mouse wheel to zoom. Two arrow buttons tilt the camera up or down. A button resets the camera.
- On desktop, hovering a fish enlarges it and shows a **gold outline** so the player knows which fish a click will hit. On touch the outline shows only while the finger is down.

## 1.5 Look and sound

See [Art and audio](./art-audio).
