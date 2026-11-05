# Game Design Document

**Spot A Fish** · Game Design Document · tracks build `latest` (see [Changelog](./changelog))

This document describes what Spot A Fish is, how it plays, and why it is built the way it is. Every number in it (timings, formulas, sizes, colours) comes from the current code. If the two disagree, the code is right and this document has a bug.

## How to read this document

Each feature carries a status:

| Badge | Meaning |
|---|---|
| <Badge type="tip" text="Live" /> | In the current build and playable at [the demo](https://thuannvathena.github.io/spot-a-fish/demo/). |
| <Badge type="warning" text="Coming soon" /> | Designed or planned, **not in the game yet**. Details may change before it ships. |

The game is **3D (Three.js)**, so sizes are in scene units, not canvas pixels. Level numbers come from `game/src/levels.json` and `game/src/levelcfg.js`.

## Contents

| Part | Chapters |
|---|---|
| **I. Vision** | [1. Overview](./overview) |
| **II. Gameplay** | [2. Core loop](./core-loop) · [3. Rules & mechanics](./rules) · [Levels](./levels) · [Art and audio](./art-audio) |
| **III. Production** | [4. Roadmap & open questions](./roadmap) · [5. Changelog](./changelog) |

## One-paragraph summary

A 3D aquarium puzzle: a round tank is full of fish, two target tanks ask for species, and the player taps the right fish before a 7-slot Backup tray fills up. 15 levels, each teaching one new mechanic.
