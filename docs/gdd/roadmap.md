# 4. Roadmap & open questions

## 4.1 What exists today <Badge type="tip" text="Live" />

- 15 playable levels, 5 themes, 29 fish species, 3D tank with glass and water lens.
- Backup, Hint, Clear Backup, combo, stars, bounty tanks.
- Obstacles (urchin, jellyfish, squid, clam, swarm), random events, feeding bucket, pump tube.
- Collision between fish, obstacles, decorations and tube.
- Progress saved in `localStorage`, Pause menu with Reset progress.
- Painted UI (label plates, progress tube, tanks), combo words and hint arrow, 3D tap wave, glass-break and water-on-glass lose sequence.
- Level editor with a live preview of the real game.
- Docs site and versioned web releases.

## 4.2 Roadmap <Badge type="warning" text="Coming soon" />

Order of priority. Milestones are scope buckets, not dates.

### M1: Validate on a real device
| Item | Chapter |
|---|---|
| Play on a real phone; measure FPS, touch feel and difficulty per level | [Levels](./levels) |
| Fix level duration and fish count per level after playtest | [Levels](./levels) |
| Short tutorials for the pump tube and feeding | [Rules](./rules#_3-9-tutorial-and-introductions) |
| Decide whether the swarm only hides or also blocks taps | [Rules](./rules#_3-3-obstacles-tapping-one-counts-as-a-wrong-tap) |

### M2: Look and feel
| Item | Chapter |
|---|---|
| Artist delivers 2 clips and 5 expressions, then integrate in game | [Art and audio](./art-audio#a-3-animation-and-expressions-wanted-from-the-artist) |
| Real models for urchin, jellyfish, squid, clam, pearl, bucket; decoration sets | [Art and audio](./art-audio#a-4-other-art-to-consider) |
| Real SFX set, background music, new sounds for missing events | [Art and audio](./art-audio#a-5-audio) |
| Official UI kit, icon, store art | [Art and audio](./art-audio#a-4-other-art-to-consider) |

### M3: Beyond the prototype
| Item | Chapter |
|---|---|
| Low-end device mode (lower quality and resolution) | _TBD_ |
| Localization (text is English only) | _TBD_ |
| Endless levels, meta layer (shop, quests, characters), ads, analytics, IAP | [Core loop](./core-loop#_2-4-long-term-loop) |

## 4.3 Known issues {#known-issues}

| Issue | Impact | Planned fix |
|---|---|---|
| Not tested on a real phone | Touch feel, hover on touch and catchability of small (45% size) and fast (2.6x) fish unknown | M1 playtest |
| Possible lag after water shader changes (grid reduced 110×110 → 90×90, slope computed by formula) | Unknown on target GPU; only measured in a software-rendered test browser (~2 fps) | Measure FPS on target device |
| Level balance unverified | Lose path from L2, L4 → L5 jump, ×1 bounty fairness, a full tank of 40 fish plus pump waves at L12–15 | M1 playtest |
| Event motion never watched live | Only checked for errors and via screenshots | Watch on a real device |
| Squid ink over tube, feeding event thumbnail not checked visually | Possible visual bugs | Visual check |
| Reported clipping when rotating | Script shows 0 violations; pair of objects unknown | Screenshot and name both objects if seen again |
| Hover gold outline checked only in a virtual machine | Thickness or brightness may need tuning on real hardware | Tune on device |
| Lose sequence (water simulation on the glass, breaking tank) tuned only in a desktop browser | Look, timing and frame rate on a phone unknown | Measure on a real phone and tune |
| UI is a mirror of hidden HTML elements | Phaser draws the UI from state that `main.js` writes into hidden HTML; works, but a later clean-up should make the game emit events instead | Refactor when the UI is final |
| Combo words, sparks, flying fish trails are still HTML/3D effects | Not drawn by Phaser | Decide if they should move |
| Lens and tube are coupled | Changing lens math without updating `PW_GLSL` bends or offsets the tube | Keep in sync (see dev notes) |

## 4.4 Open questions {#open-questions}

| Question | Options | Current lean |
|---|---|---|
| Keep `fish_20.png` out of the build? | Drop for good / bring back | _TBD_ (reason it was removed is unknown; ask whoever decided) |
| Swarm: hide only, or block taps? | Hide only (current) / block taps | _TBD_ |
| Target level duration and fish count | See [Levels](./levels) | _TBD_ |
| Fish look: keep inflated 2D art or move to real 3D models | Keep the smoothed inflated mesh (done: one welded surface) / artist 3D models (GLB) | Keep for now, 3D later |
| Target player and platform priorities | _TBD_ | _TBD_ |
| Older variants in the original project's `archive/` (drop, floor) still use a 3D hand for feeding | Sync with main build / leave as reference | Leave as reference (not in this repo) |
