# 3. Rules & mechanics

## 3.1 Win, lose, limits <Badge type="tip" text="Live" />

| Rule | Value |
|---|---|
| Win | All target tanks of the level done |
| Lose | Backup full (`BACKUP_MAX` = 7 slots) |
| Level 1 | Cannot be lost: Backup is hidden and a wrong tap only scatters fish |
| Max fish in tank at once | 40 (`FISH_CAP`). The pump tube holds decoys back while the tank is full; held target fish still come out first |
| Levels with a pump tube start with | 40 fish (`TUBE_INIT`) |
| Total levels | 60 (`MAX_LV`) |
| Fish needed per tank (`per`) | L1–2: 1, L3–4: 2, L5+: 3 |

## 3.2 Fish <Badge type="tip" text="Live" />

- 23 species (3D models) in the build; the colour variants used for look-alikes come on top of that. No whale or shark any more.
- **Look-alikes** from L3: some decoy species are hue-rotated copies of a target species to fool the eye. Similarity rises at L3 and L8 (`look` 0, 1, 2).
- **Size and speed by level:** fish are big and slow early, small and faster later (`sizeK` 1.7 → 1.25, `speedK` 0.72 → 1).
- Per level, the tank holds `2 × goal` species: `goal` target species (exactly `per` fish each) and `goal` decoy species, of which 1–2 are look-alikes.

## 3.3 Obstacles (tapping one counts as a wrong tap) <Badge type="tip" text="Live" />

| Obstacle | From level | Behaviour |
|---|---|---|
| Sea urchin | L1 | Wanders. Tapping sends it to Backup like junk |
| Jellyfish | L4 | Same as urchin |
| Squid | L3 (alone, as intro) | Sprays ink that hides the view. If tapped, takes up to 3 Backup slots |
| Clam | L6 (alone, as intro) | Opens and closes, hides a fish inside; the player must open it |
| Fish swarm | L9 | 400–560 grey-silver fish come out of a cave and cover the tank for 18–26 s, then go back. **Only hides the view**: a tap through the swarm still hits the real fish |

## 3.4 Boosters <Badge type="tip" text="Live" />

| Booster | From level | Effect |
|---|---|---|
| Hint | L4 | Highlights up to 3 needed fish with a pulsing gold outline and arrow for 3.6 s; recharge 9 s. Other fish drift away so they are easier to see |
| Clear Backup | L5 | Returns fish in Backup to the tank: they fly to the open top and drop in with a splash. Once per level |

## 3.5 Random events <Badge type="tip" text="Live" />

After any event ends (random event, feeding, falling rock, swarm) nothing else starts for 8–10 s, and the same random event never comes twice in a row. Touching a fish makes it leave the event. **Only one big thing happens at a time:** feeding, the pearl game, the falling rock, the swarm and a tube wave wait until the one before has finished.

| Event | From level | What happens |
|---|---|---|
| Squabble | early | Two fish face off, back away, then charge, with dust and 💢 |
| Conga | early | A leader weaves, 6–10 fish follow in a line |
| Waltz | early | Two fish chase tails in a small circle |
| Swirl | L4 | The school spins into a whirl |
| Hide | L7 | Fish dash into a cave |
| Pearl | early | A pearl drops, the school flees and returns to look, the pearl floats up, a few fish head-butt it around, then it pops. At most once per ~80 s |
| Startle | L10 | A falling object scatters the school |
| Feeding | L3 | A 3D food bucket drops, shakes, tips, pours flat pellets on the surface; fish swim over and eat. Every 24–34 s (18–26 s from L10). The bucket fades as it lifts away |

## 3.6 Pump tube (from L7) <Badge type="tip" text="Live" />

- From L7 the tank starts with 40 fish (the cap). The rest (targets and decoys) wait in an orange **tube outside the tank** and are pumped in **in waves**. The tube sits in one of 9 corners chosen so no decoration is near it, climbs the outside of the glass, and bends into the tank with a hinged cap.
- A wave: the tube shakes and bubbles, the cap opens, fish fly out one by one (squash and stretch). If the tank already holds 40 fish, decoys wait in the tube until the player catches some; fish held back for a target tank are released first. Every 2–3 finished target tanks triggers a wave.
- A wave can hold back the **last fish of a target tank**, so the player must wait or find it. If a tank needs a species and none is left in the tank, the tube pumps by itself after ~2.5 s so the game never gets stuck.
- The tube is drawn "pre-warped" so it stays straight after the glass lens. It fades when in front of the player or when the camera is close, and becomes clear before a wave. Squid ink covers it.

## 3.7 Bounty tanks (from L6) <Badge type="tip" text="Live" />

Even levels from L6 and L15 add a ×1 tank that asks for one fish, with no species hint, after the first 2 tanks are done.

| Type | Levels | Meaning |
|---|---|---|
| `tiny` | L6, L12 | A very small fish |
| `camo` | L8, L14 | Hidden among look-alikes |
| `fast` | L10, L15 | Swims very fast |

## 3.8 Collision <Badge type="tip" text="Live" />

Nothing passes through anything. Fish and obstacles are pushed out of the bounding boxes of solid decorations (rocks, columns, houses...) and out of the tube (capsule, `PIPE_R` = 0.8). Soft decorations (seaweed, anemone, fans), tiny or flat things, and doors are ignored. Random spawn points never land inside a solid. A fish leaving the tube has 0.9 s of collision immunity. Script result: 0 violations over ~1,500 samples at L7, L10, L13. A tester once reported some objects clipping while rotating, without naming a pair; _TBD_ whether that still happens.

## 3.9 Tutorial and introductions <Badge type="tip" text="Live" />

- No long tutorial. L1: a short goal popup, a hand pointing at a fish, then camera hints (drag to rotate, then zoom, then the two tilt arrows).
- New features are introduced by **dimming the screen and lighting the real button** with one short line: Backup (L2), Hint (L4), Clear Backup (L5), Squid (L3), Clam (L6), Swarm (L9, with a popup).
- **No** dedicated tutorial yet for the pump tube (text only) or for feeding.

## 3.10 Themes <Badge type="tip" text="Live" />

The hall changes theme (water colour, light, decoration set) **every 3 levels**: 5 themes.

See [Levels](./levels) for the per-level table.
