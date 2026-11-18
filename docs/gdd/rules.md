# 3. Rules & mechanics

Every number below was checked against the code on 18 Nov 2026 (`game/src/main.js`, `game/src/levelcfg.js`, `game/src/levels.json`). The per-level values are in [Levels](./levels).

## 3.1 Win, lose, limits <Badge type="tip" text="Live" />

| Rule | Value |
|---|---|
| Win | All target tanks of the level done |
| Lose | Backup full (`BACKUP_MAX` = 7 slots). The **Out of space!** pop-up first offers Play on (3.11); "No thanks" ends the level on the Level failed screen with a Retry button |
| Levels 1-4 | Cannot be lost in practice: L1-2 have no Backup (a wrong tap only makes the fish dart off) and L3-4 have only 6 wrong fish, fewer than the 7 slots. L5 is the first level that can be lost |
| Max fish in the tank at once | 40 (`FISH_CAP`). The pump tube holds decoys back while the tank is full; held target fish still come out first |
| Fish at the start of a level | 10 in L1, rising to 40 in L59-60 (`startFish` in each level file) |
| Total levels | 60 (`MAX_LV`) |
| Fish needed per tank | L1-7: 1 each; from L8 a mix of 1 and 2; from L18 3 appears (`tanks` in each level file) |
| Stars | Saved per level: at most 3 wrong taps = 3 stars, at most 6 = 2 stars, otherwise 1. There is no stars pop-up; they show in the level list |

## 3.2 Fish <Badge type="tip" text="Live" />

- **49 species**, each a 3D model (`public/models/fish/<name>/`), plus the colour copies used as look-alikes. The shark, the whale and the sea horse are never targets, only wrong fish. A level uses at most 30 species, copies included; the number of species met grows from 4 (L1) to all 49 (L45).
- **Look-alikes** (`look` 0-4 in the level file, from L11 on, see [Levels](./levels)): some wrong fish are colour copies of a target species. The colours of a copy are turned in OKLab (the lightness stays what the artist painted) by an angle that gets smaller as levels go up (130 degrees in L1-10 down to 55 in L51-60). Turns that look bad on a species are blocked (`HUE_BAD`), and a turn that puts pink or purple together with green on one fish (a sickly look) is moved by a few degrees to the nearest good one.
- **Size and speed:** every fish is size 1.4 (`sizeK`) and swims at 85% of its base pace (`speedK` 0.85) times a further 0.85 (`FISH_SLOW`), so about 72% of the old base speed. The measured mean speed of a free fish is about 1.2 units a second. Bounty `fast` fish swim 1.8 times faster.
- **Swimming:** fish pick a waypoint, steer to it and use the whole tank (high, low, near the glass). They keep a soft distance from each other (a capped push, never a jump), and nothing passes through anything solid (3.8).
- **Per level** the tank holds `2 x goal` species: `goal` target species and `goal` wrong species.

## 3.3 Obstacles (tapping one counts as a wrong tap) <Badge type="tip" text="Live" />

An obstacle that is new in a level is shown **alone** in that level (the intro levels L11, L21, L31).

| Obstacle | From level | Behaviour |
|---|---|---|
| Jellyfish | L8 | Wanders. Tapping sends it to the Backup like a wrong fish |
| Octopus | L11 (alone, as the intro) | Swims in pushes, sometimes crawls on the sand. Now and then it **sprays ink**: a dark cloud (10 puffs, strongest 85% opaque, about 29% of the water area at its widest, 9 s) that hides what swims behind it. It only sprays in open water (at least 1.1 from the glass and 1.3 above the floor, and the place the jet goes to is also clear). If tapped it goes to the Backup and takes **3 slots** |
| Clam | L21 (alone, as the intro) | Opens and closes and hides a fish inside; the player has to open it. A needed fish in a shut clam is marked by a gold arrow when Hint is used |
| Fish swarm | L31 (alone, as the intro) | 600 grey-silver fish come out of a cave and cover the tank for 18 s, then go back, every 30 s. **Only hides the view**: a tap through the swarm still hits the real fish |

## 3.4 Boosters <Badge type="tip" text="Live" />

Each booster is introduced in its own level: there it can be used once for free (the button shows a green FREE tag). **The 3 boosters are given at the moment the free one is used.** If the player never uses it and wins the level, the 3 are given when the level is won, so they have them from the next level. The gift is saved: using the free one and then losing or restarting the level does not bring the FREE back, and the 3 stay. A player who is already past the introducing level when the game loads gets the 3 at once. (Using it when it cannot work, for example Clear Backup with an empty Backup, spends nothing and does not count as the free use.) Before its level, a booster slot is a grey round button with a small padlock and "Lv. X" inside the circle; a tap on it plays the click sound and the button shakes sideways for 0.48 s (nothing else happens). After that a booster is a count on its button (a "+" when it is 0 opens the Purchase pop-up, 3.11).

| Booster | From level | Effect |
|---|---|---|
| Hint | L4 | Marks up to 3 needed fish that are not marked yet, with a pulsing gold outline and a bobbing arrow; the mark stays until the fish is caught. The other fish drift away from them. A shell holding a needed fish glows for 3.6 s and shows the arrow. No cooldown. **Nothing is spent** when there is nothing new to mark |
| Clear Tank | L7 | Fills one target tank at once: the fish it still needs fly from the button into it (fish of that kind in the Backup go first) |
| Clear Backup | L9 | Returns the fish in the Backup to the tank: they fly to the open top and drop in with a splash |

A booster that cannot be used right now (Hint with nothing new to mark, Clear Backup with an empty Backup, Clear Tank with nothing to collect) spends nothing, shows a short message ("Already marked!", "No fish to show", "Backup is empty", "Nothing to collect") and its button shakes sideways for about half a second.

## 3.5 Random events <Badge type="tip" text="Live" />

After **any** event ends (random event, feeding, falling rock, swarm) nothing else starts for **20 s** (`EV_COOL`), and the same random event never comes twice in a row. Touching a fish makes it leave the event. **Only one big thing happens at a time:** feeding, the pearl game, the falling rock, the swarm and a tube wave wait until the one before has finished. A random event lasts about 7-15 s depending on its kind (measured in the game on 18 Nov 2026: squabble 6.6 s, waltz 7.7 s, swirl 8.1-8.4 s, pearl 11.9 s, conga 14.1-14.7 s; feeding was not timed).

| Event | From level | What happens |
|---|---|---|
| Conga | L1 | A leader weaves and 6-10 fish follow in a line |
| Waltz | L3 | Two fish chase tails in a small circle |
| Swirl | L6 | A group (up to 14, with a jellyfish or the octopus sometimes) spins into a whirl |
| Pearl | L9 | A pearl drops, the school flees and returns to look, the pearl floats up, a few fish head-butt it, then it pops. At most once per ~80 s |
| Squabble | L12 | Two fish face off, back away, then charge, with dust and a 💢 |
| Feeding | L15 | A 3D food bucket drops, shakes, tips and pours 36 pellets on the surface. About 40% of the pellets sink slowly. Every fish picks **one** pellet of its own (the nearest free one), swims up under it with its mouth at the surface and bites it: the pellet is drawn into its mouth and shrinks in 0.2 s; a pellet that sinks out of reach or that nobody can get melts over 0.7 s. Every 24-34 s; the bucket fades as it lifts away |
| Falling rock | L21 | A rock plops into the tank and the school bolts. Every 26-38 s |

The "hide in a cave" event was taken out of the game.

## 3.6 Pump tube (from L16) <Badge type="tip" text="Live" />

- From L16 part of the fish (targets and decoys) wait in an orange **tube outside the tank** and are pumped in **in waves**. The tube sits in a corner chosen so no decoration is near it, climbs the outside of the glass, and bends into the tank with a hinged cap.
- A wave: the tube shakes and bubbles, the cap opens, fish fly out one by one (squash and stretch). If the tank already holds 40 fish, decoys wait in the tube until the player catches some; fish held back for a target tank are released first. A level has 1 or more waves.
- A wave can hold back the **last fish of a target tank**, so the player must wait or find it. If a tank needs a species and none is left in the tank, the tube pumps by itself after ~2.5 s so the game never gets stuck.
- The tube is drawn "pre-warped" so it stays straight after the glass lens. It fades when in front of the player or when the camera is close, and becomes clear before a wave. Octopus ink covers it.

## 3.7 Bounty tanks (from L25) <Badge type="tip" text="Live" />

Some levels add a x1 tank that asks for one fish, with no species hint, after the first 2 tanks are done.

| Type | Levels | Meaning |
|---|---|---|
| `tiny` | L25, L55 | A very small fish |
| `camo` | L35, L55, L60 | Hidden among look-alikes |
| `fast` | L45, L60 | Swims very fast |

## 3.8 Collision and layout <Badge type="tip" text="Live" />

Nothing passes through anything, and nothing visible in the tank may overlap anything else.

- **Fish and obstacles are pushed out of solid decoration**, the clams and the tube. Every solid piece has a collision box; a piece made of parts (the wreck with its leaning mast) has one box per part. A fish is moved out of a solid by at most 0.045 per frame, so a crowded tank never makes a fish jump. Soft decoration (seaweed, anemones, fans), tiny or flat things and thin parts are ignored. Random spawn points never land inside a solid. A fish leaving the tube has 0.9 s of collision immunity.
- **The decoration is laid out again at the start of every level:** each piece keeps its own place around the tank but is turned and moved a little at random; solid pieces never overlap each other, nothing sticks out through the glass (a piece that cannot fit is left out), and soft pieces are moved out of solid ones. The artist's corals (3 models) are solid and sway gently in the current.
- **Clams** are placed where their whole footprint is clear of decoration and of each other.
- **Paused** (a pop-up is open, or the window lost focus): nothing moves.
- **Checks** in the game (`window.__qa`, see the QA page): `decorFit` (decor against decor and the glass), `fishClip`, `overlapAudit`, `jitter` (smoothness of the swimming).

## 3.9 Tutorial and introductions <Badge type="tip" text="Live" />

- No long tutorial. L1: a short goal pop-up, a hand pointing at a fish, then camera hints (drag to rotate, then zoom, then moving the view up and down with two fingers).
- New features are introduced by **dimming the screen and lighting the real button** with one short line: Backup (L3), Hint (L4), Clear Tank (L7), Clear Backup (L9), Octopus (L11), Pipe (L16), Clam (L21), Swarm (L31). The pop-ups wait until the UI and the lids of the target tanks have finished. While an introduction is up, everything outside the lit place stays visible but dimmed, including the target tanks, the Backup tank and the fish in it (they are drawn in a separate 3D layer, which is shown at 18% outside the lit holes and at full strength inside them). **Level 9 (Clear Backup) starts with two wrong fish already in the Backup**: they are in their slots from the first frame (no flight, not counted as a mistake), they are species that are no target of that level at all (neither now nor later, so nothing pulls them out), and the introduction lights the Backup strip together with the Clear Backup button (two lit holes in the dim; the 3D Backup tank and its fish show at full strength in both). This happens only the first time the introduction is shown. **A booster that is lit by its introduction is drawn at full strength** (normal colour and brightness), even if it is greyed out at that moment (Clear Backup with an empty Backup, Clear Tank with nothing to clear); when the introduction closes it goes back to its normal state, grey if it cannot be used.
- **No** dedicated tutorial for feeding.

## 3.10 Themes and tank shapes <Badge type="tip" text="Live" />

- The hall changes **every 10 levels** between 6 looks (water colour, light, hall): in this order Aquarium hall (L1-10), Sunset reef (L11-20), Kelp forest (L21-30), Atlantis (L31-40), Lagoon (L41-50), Deep sea (L51-60).
- There are 5 decoration sets: reef (L1-10 and L41-50), ruins (L11-20), kelp forest (L21-30), Atlantis (L31-40) and shipwreck (L51-60). The tank shape changes every 10 levels too: cylinder, bowl, rounded box, hexagon, flower, heart.

See [Levels](./levels) for the per-level table.

## 3.11 Coins, boosters and ads <Badge type="warning" text="Prototype: ads not connected" />

- **Coins:** start with 900. A win pays 30 (Easy, Medium), 60 (Hard) or 90 (Very Hard). The WELL DONE screen lets the player take it, or watch an ad for x2.
- **Booster prices (3 per pack):** Hint 300, Clear Backup 900, Clear Tank 1500. A purchase by ad gives 1.
- **Play on** when the Backup is full: clears the Backup (the fish jump back into the tank, no extra slot). The player's **first Play on is FREE**: the pop-up has one button, "FREE", until that free one has been used. After that, with coins (900) there is no limit per level; by ad, at most **5 a day**.
- **Rewarded ads** (x2 reward, booster by ad, Play on by ad): each kind is capped at **5 a day**, and each booster has its own 5. When a kind is used up its ad button is removed and the pop-up shows the coin button alone, in the middle. In the prototype the ad buttons grant the reward at once; no ad network is attached.
- **Pop-ups** keep their buttons as they were when a button was pressed until they close (so the free Play on does not turn into the two-button pop-up for a moment).
- **Interstitial ads:** the first one appears at **Level 15**, and two interstitials are at least **120 seconds** apart. Not built yet: this is the agreed design. A rewarded ad does not reset or count towards the 120 s unless decided otherwise (open question for the full GDD).

## 3.12 The win sequence <Badge type="tip" text="Live" />

When the last target tank is done the UI fades out, the camera pulls back and the fish that are left swirl up out of the tank, circle in a bubble and fall back into the water; the words LEVEL COMPLETE appear. **A fish waiting in the Backup flies into its target tank only after that tank has finished showing itself:** the tank has popped in (1 s), its lid is fully open and a further 0.35 s has passed (measured: new tank at 1.71 s, the fish leaves the Backup at 3.67 s, lid fully open). The Backup fish at the start of L9 appear and fade in together with the Backup tank (no fish visible before it). **Fish let out of the Backup by this win:** when the last target is done, everything in the Backup jumps back into the tank first; the win sequence still starts on time (about 2.2 s after the last target, the same as with an empty Backup) and the released fish, even while they are still diving in, take part in it like every other fish (helix, arc out of the water, circling the bubble, fall back). Only a diving octopus is waited for (at most 8 s). If no fish can take part at all, there is no bubble: after about 0.9 s the sequence goes straight on to LEVEL COMPLETE and WELL DONE, so the level can never hang. From level 2 a grey breathing line "TAP TO FAST FORWARD" shows under the tank; after a tap it reads FAST FORWARD with three triangles until the WELL DONE screen has built up (it slides under the two coin buttons when that screen opens). Then WELL DONE shows the coins to take (with x2 by ad), the progress to the next unlocked feature and, when a feature is earned, UNLOCKED!. The next level opens behind a curtain.
