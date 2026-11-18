# 4. Roadmap & open questions

## 4.1 What exists today <Badge type="tip" text="Live" />

- 60 playable levels in 6 hall looks and 6 tank shapes (10 levels each), 49 fish models, a 3D tank with a glass and water lens.
- Backup, Hint, Clear Tank, Clear Backup, combo words, stars, bounty tanks, Play on, coins, a Purchase pop-up and rewarded-ad buttons (the ad network is not attached).
- Obstacles (jellyfish, octopus with ink, clam, swarm), seven random events including feeding (the fish bite the food) and a falling rock, the pump tube, the pearl.
- Artist models for the octopus, jellyfish, clam and decoration (clay pot, stone pillars and statue, anchor, three corals, glass bottle); decoration laid out again at random every level.
- Collision between fish, obstacles, decoration, clams and the tube; the layout keeps everything apart.
- Painted UI: pop-ups, buttons and icons, the label plates, progress tube, target tanks, combo words, hint arrows, a 3D tap wave, the glass-break and water-on-glass lose sequence, the win sequence with WELL DONE and a "tap to fast forward" line, a curtain between levels.
- Recorded sound effects and music (39 files).
- Progress saved in `localStorage`, a Pause menu with Reset progress, a level list with stars.
- Level editor with a live preview of the real game; checks in the game page (`window.__qa`, see [QA](../qa)).
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
| Artist delivers 2 clips and 5 expressions, then integrate in game | [Art and audio](./art-audio#a-4-animation-and-expressions-wanted-from-the-artist) |
| Real models for the pearl, food bucket, pump tube and the code-built decoration | [Art and audio](./art-audio#a-5-other-art-to-consider) |
| A new UI kit (so the pictures borrowed from the sister project can be retired); the Levels pop-up in the new style | [Art and audio](./art-audio#a-5-other-art-to-consider) |
| Sounds for the missing events (swarm, squabble, conga, biting the food, bounty tanks) | [Sounds](./sounds) |
| App icon and store art | [Art and audio](./art-audio#a-5-other-art-to-consider) |

### M3: Beyond the prototype
| Item | Chapter |
|---|---|
| Ad network (rewarded and the interstitials from L15), analytics, IAP | [Rules](./rules#_3-11-coins-boosters-and-ads) |
| Low-end device mode (lower quality and resolution) | _TBD_ |
| Localization (text is English only) | _TBD_ |
| Endless levels, meta layer (quests, characters) | [Core loop](./core-loop#_2-4-long-term-loop) |
| Port to Unity for the app build | _TBD_ |

## 4.3 Known issues {#known-issues}

| Issue | Impact | Planned fix |
|---|---|---|
| Not tested on a real phone | Touch feel, the two-finger camera, and catchability of small and fast fish unknown | M1 playtest |
| Level balance unverified | The bot says about 100% first-try wins up to L30 and about 69% at L60 (a guess); the old design sheet's target win rates are not met (more than 5 points off) for about 40 levels | M1 playtest |
| Crowded levels (L55-60: 40 fish and more) | A few pairs of fish still overlap for a moment during events; some big one-frame jumps during events or feeding were seen and not traced | Measure with `__qa.jitter` and `overlapAudit` after changes; tune |
| Look-alike colours | A few species have few good colour turns (blue_chunker); fish with many colours turn every colour by the same angle | Per-species list of approved turns after a designer review |
| Levels pop-up is the old HTML look | Not in step with the other pop-ups | New art in M2 |
| UI is a mirror of hidden HTML elements | Phaser draws the UI from state that `main.js` writes into hidden HTML; works, but a later clean-up should make the game emit events instead | Refactor when the UI is final |
| Lens and tube are coupled | Changing lens math without updating `PW_GLSL` bends or offsets the tube | Keep in sync (see dev notes) |
| Phone performance of the water shader, swarm (600 fish) and the lens | Only measured on a desktop browser | Measure FPS on a target device |

## 4.4 Open questions {#open-questions}

| Question | Options | Current lean |
|---|---|---|
| Swarm: hide only, or block taps? | Hide only (current) / block taps | _TBD_ |
| Target level duration and fish count | See [Levels](./levels) | _TBD_ |
| Target player and platform priorities | _TBD_ | _TBD_ |
| Do rewarded ads count towards the 120 s interstitial spacing? | Count / do not count | _TBD_ (see [Rules 3.11](./rules#_3-11-coins-boosters-and-ads)) |
