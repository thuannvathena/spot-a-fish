# Levels

## L.1 Design approach <Badge type="tip" text="Live" />

- **Teach one thing at a time.** Each new mechanic (Backup, Hint, Clear Backup, squid, clam, swarm, tube) appears in its own level. An obstacle intro level contains only that obstacle.
- **L1 cannot be lost.** L2 introduces Backup.
- **Difficulty rises through clutter:** more species, more look-alike decoys, more obstacles, smaller and faster fish, more pump waves. No time limit.

## L.2 Level table <Badge type="tip" text="Live" />

60 levels, about 119 minutes in total at 5 s per fish to catch (an average of 2.0 min a level, the longest about 3.2 min). The design sheet is `Level-related/Spot-A-Fish - Level System (filled).csv`; `node game/tools/csv-to-levels.mjs` turns it into `game/src/levels.json`. These are **settings, not results from real players**; the win rates in the sheet are first-try targets (no Play On) and are not measured yet.

- **Unlocks:** Backup L2, Hint L4, Clear Tank L7, Clear Backup L9, squid L11, pipe L16, clam (shell) L21, swarm L31. Each unlock shows its pop-up in that level.
- **Fish to catch** grow from 4 (L1) to 8 at L2 and then step up to about 35 on the last levels. The longest levels are the Hard and Very Hard peaks.
- **Fish per tank** grows from 1 (L1) through a mix of 1, 2 and 3 to 3 in nearly every tank from about L16; a level can mix sizes.
- **Pipe:** from L16. Each wave holds back the last fish of 1 target species (2 on Hard / Very Hard levels), so the tank starts with fewer target fish.
- **Fish look and speed:** every fish is size 1.4 and speed 0.85 (bounty fish excepted). Look-alike decoys step up every 10 levels (none up to L5, then 1, 2 and 3 look-alike species; the hue gap shrinks from 130° to 55°).
- **Bounty tanks** (tiny / camo / fast, 1 fish each, never more than one of a kind per level) appear only on L15, L25, L35, L45 and L60; L45 and L60 have two.
- **Win rate:** the bot (`node game/tools/wr-sim.mjs`) plays each level thousands of times with a model of a player and reports the first-try win rate (no boosters, no Play On). `node game/tools/wr-tune.mjs` nudges start fish, decoy species, look-alikes and obstacles until the bot is within 3 points of the sheet. It is a **model**: the player's error rates are guesses, so use the numbers to rank levels, and fit the constants in `ERR` to real playtests when they exist.
- **Urchin and jelly** only on Medium, Hard and Very Hard levels from L6, at most 2 of each. Easy levels before L40 and the levels that introduce a feature (L11, L16, L21, L31) have none; Easy levels from L40 can have them when the win-rate target needs it.
- **Themes and tank shapes:** 6 themes and 6 tank shapes (cylinder, bowl, rounded box, hexagon, flower, heart), 10 levels each; both repeat after level 60.
- **Which fish:** each level lists its fish in `fishKeys` of `game/src/levels.json` (the first species are the targets, the rest decoys), written by `scripts/assign-fish.py` from the 49-fish set: every level gets a different mix, and the harder the level, the more decoys of the same colour family as a target. The whale and the shark are decoys only; the sea horse appears only as a decoy (about one level in three). Only the species a level names are loaded. There is no level 61.
- **Pipe waves** use `startFish` and `maxFish` of the level: the pipe adds `maxFish - startFish` fish in waves, so the tank never holds more than `maxFish` (a few more only while a fish is held by a clam or hidden by camouflage).
- **Fish cap:** 40 in the tank at once.

| L | Diff | Tanks (fish each) | To catch | Start fish | Pipe (waves / fish) | Species | Look-alikes | Urchin / jelly | Squid / clam / swarm | Bounty | Bot WR | Target WR | New in this level |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Easy | 4×1 | 4 | 10 | – | 7 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | Tutorial |
| 2 | Easy | 6×1+1×2 | 8 | 18 | – | 12 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | Backup Slot |
| 3 | Easy | 6×1+2×2 | 10 | 22 | – | 14 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 97% |  |
| 4 | Medium | 4×1+4×2 | 12 | 28 | – | 16 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | Booster 1: Hint |
| 5 | Hard | 4×1+6×2 | 16 | 40 | – | 22 | 4 | 0 / 0 | 0 / 0 / 0 | – | 96% | 92% |  |
| 6 | Easy | 2×1+6×2 | 14 | 26 | – | 14 | 1 | 0 / 0 | 0 / 0 / 0 | – | 100% | 97% |  |
| 7 | Easy | 1×1+7×2 | 15 | 27 | – | 14 | 1 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | Booster 2: Tank Clear |
| 8 | Medium | 1×1+8×2 | 17 | 40 | – | 21 | 4 | 1 / 0 | 0 / 0 / 0 | – | 94% | 92% |  |
| 9 | Easy | 6×2+1×3 | 15 | 25 | – | 12 | 1 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | Booster 3: Backup Clear |
| 10 | Hard | 5×2+3×3 | 19 | 40 | – | 20 | 4 | 2 / 1 | 0 / 0 / 0 | – | 88% | 86% |  |
| 11 | Easy | 5×2+2×3 | 16 | 26 | – | 12 | 1 | 0 / 0 | 1 / 0 / 0 | – | 100% | 100% | Feature 1: Squid |
| 12 | Easy | 2×2+4×3 | 16 | 40 | – | 18 | 4 | 0 / 0 | 1 / 0 / 0 | – | 86% | 87% |  |
| 13 | Easy | 1×2+5×3 | 17 | 40 | – | 18 | 4 | 0 / 0 | 1 / 0 / 0 | – | 85% | 82% |  |
| 14 | Medium | 2×2+5×3 | 19 | 40 | – | 19 | 4 | 1 / 0 | 0 / 0 / 0 | – | 92% | 90% |  |
| 15 | Hard | 1×1+1×2+6×3 | 21 | 40 | – | 20 | 4 | 1 / 1 | 1 / 0 / 0 | tiny | 76% | 75% |  |
| 16 | Easy | 6×3 | 18 | 40 | 1 / 7 | 18 | 4 | 0 / 0 | 0 / 0 / 0 | – | 91% | 90% | Pump |
| 17 | Easy | 6×3 | 18 | 40 | 2 / 14 | 18 | 4 | 0 / 0 | 0 / 0 / 0 | – | 88% | 87% |  |
| 18 | Medium | 1×2+6×3 | 20 | 39 | 3 / 24 | 14 | 1 | 1 / 0 | 1 / 0 / 0 | – | 81% | 80% |  |
| 19 | Easy | 2×2+5×3 | 19 | 40 | 2 / 14 | 19 | 4 | 0 / 0 | 0 / 0 / 0 | – | 90% | 87% |  |
| 20 | Very Hard | 2×2+7×3 | 25 | 40 | 4 / 40 | 21 | 2 | 0 / 0 | 1 / 0 / 0 | – | 67% | 70% |  |
| 21 | Easy | 1×2+6×3 | 20 | 28 | 2 / 14 | 12 | 2 | 0 / 0 | 0 / 1 / 0 | – | 99% | 100% | Feature 2: Shell |
| 22 | Easy | 1×2+6×3 | 20 | 30 | 2 / 14 | 12 | 2 | 0 / 0 | 0 / 1 / 0 | – | 97% | 95% |  |
| 23 | Easy | 1×2+6×3 | 20 | 36 | 2 / 14 | 12 | 2 | 0 / 0 | 0 / 1 / 0 | – | 91% | 90% |  |
| 24 | Medium | 1×2+7×3 | 23 | 36 | 3 / 24 | 16 | 2 | 0 / 0 | 1 / 0 / 0 | – | 86% | 85% |  |
| 25 | Hard | 1×1+8×3 | 25 | 40 | 4 / 36 | 21 | 3 | 2 / 0 | 0 / 1 / 0 | camo | 68% | 70% |  |
| 26 | Easy | 7×3 | 21 | 29 | 2 / 14 | 12 | 2 | 0 / 0 | 0 / 0 / 0 | – | 99% | 98% |  |
| 27 | Easy | 2×2+6×3 | 22 | 34 | 2 / 14 | 14 | 2 | 0 / 0 | 1 / 0 / 0 | – | 90% | 90% |  |
| 28 | Medium | 8×3 | 24 | 39 | 3 / 24 | 16 | 2 | 1 / 1 | 0 / 1 / 0 | – | 80% | 80% |  |
| 29 | Easy | 2×2+6×3 | 22 | 34 | 2 / 14 | 14 | 2 | 0 / 0 | 1 / 0 / 0 | – | 90% | 90% |  |
| 30 | Hard | 9×3 | 27 | 40 | 4 / 36 | 21 | 3 | 0 / 0 | 1 / 1 / 0 | – | 59% | 60% |  |
| 31 | Easy | 1×2+7×3 | 23 | 33 | 2 / 14 | 14 | 2 | 0 / 0 | 0 / 0 / 1 | – | 98% | 100% | Feature 3: Fish Swarm |
| 32 | Easy | 1×2+7×3 | 23 | 35 | 2 / 14 | 14 | 2 | 0 / 0 | 0 / 0 / 1 | – | 94% | 95% |  |
| 33 | Easy | 8×3 | 24 | 38 | 2 / 14 | 14 | 2 | 0 / 0 | 0 / 0 / 1 | – | 90% | 90% |  |
| 34 | Medium | 1×2+8×3 | 26 | 40 | 3 / 24 | 18 | 2 | 1 / 0 | 0 / 1 / 0 | – | 87% | 85% |  |
| 35 | Hard | 1×1+2×2+8×3 | 29 | 40 | 4 / 36 | 22 | 3 | 1 / 0 | 0 / 0 / 1 | fast | 68% | 70% |  |
| 36 | Easy | 2×2+7×3 | 25 | 37 | 2 / 14 | 16 | 2 | 0 / 0 | 0 / 1 / 0 | – | 96% | 98% |  |
| 37 | Easy | 2×2+7×3 | 25 | 37 | 2 / 14 | 16 | 2 | 0 / 0 | 1 / 0 / 0 | – | 91% | 90% |  |
| 38 | Medium | 2×2+8×3 | 28 | 40 | 3 / 24 | 22 | 3 | 1 / 0 | 0 / 0 / 1 | – | 82% | 80% |  |
| 39 | Easy | 1×2+8×3 | 26 | 38 | 2 / 14 | 16 | 1 | 0 / 0 | 1 / 1 / 0 | – | 92% | 90% |  |
| 40 | Very Hard | 11×3 | 33 | 40 | 5 / 50 | 22 | 0 | 0 / 0 | 1 / 0 / 1 | – | 63% | 60% |  |
| 41 | Easy | 1×2+8×3 | 26 | 38 | 2 / 14 | 16 | 1 | 0 / 0 | 0 / 0 / 0 | – | 98% | 100% |  |
| 42 | Easy | 9×3 | 27 | 39 | 2 / 14 | 16 | 1 | 0 / 0 | 1 / 0 / 0 | – | 93% | 95% |  |
| 43 | Easy | 9×3 | 27 | 39 | 2 / 14 | 16 | 3 | 0 / 0 | 0 / 1 / 0 | – | 91% | 90% |  |
| 44 | Medium | 10×3 | 30 | 40 | 3 / 24 | 20 | 3 | 0 / 0 | 0 / 0 / 1 | – | 85% | 85% |  |
| 45 | Hard | 2×1+2×2+9×3 | 33 | 40 | 4 / 36 | 22 | 1 | 0 / 0 | 1 / 1 / 0 | tiny, camo | 71% | 70% |  |
| 46 | Easy | 2×2+8×3 | 28 | 40 | 2 / 14 | 18 | 1 | 0 / 0 | 0 / 0 / 0 | – | 97% | 98% |  |
| 47 | Easy | 1×2+9×3 | 29 | 40 | 2 / 14 | 18 | 3 | 0 / 0 | 0 / 0 / 1 | – | 89% | 90% |  |
| 48 | Medium | 1×2+10×3 | 32 | 40 | 3 / 24 | 22 | 3 | 0 / 0 | 1 / 1 / 0 | – | 80% | 80% |  |
| 49 | Easy | 1×2+9×3 | 29 | 40 | 2 / 14 | 18 | 2 | 0 / 0 | 0 / 1 / 1 | – | 92% | 90% |  |
| 50 | Hard | 1×2+11×3 | 35 | 40 | 4 / 36 | 22 | 3 | 0 / 0 | 1 / 0 / 1 | – | 60% | 60% |  |
| 51 | Easy | 10×3 | 30 | 40 | 2 / 14 | 22 | 4 | 2 / 0 | 0 / 0 / 0 | – | 91% | 90% |  |
| 52 | Easy | 10×3 | 30 | 40 | 2 / 14 | 18 | 1 | 0 / 0 | 2 / 0 / 0 | – | 86% | 85% |  |
| 53 | Easy | 2×2+9×3 | 31 | 40 | 2 / 14 | 22 | 4 | 2 / 1 | 0 / 2 / 0 | – | 82% | 80% |  |
| 54 | Medium | 2×2+10×3 | 34 | 40 | 3 / 24 | 22 | 4 | 2 / 2 | 0 / 0 / 1 | – | 72% | 75% |  |
| 55 | Hard | 2×2+11×3 | 37 | 40 | 4 / 36 | 22 | 2 | 0 / 0 | 1 / 2 / 0 | – | 57% | 60% |  |
| 56 | Easy | 1×2+10×3 | 32 | 40 | 2 / 14 | 22 | 4 | 2 / 1 | 0 / 0 / 0 | – | 90% | 88% |  |
| 57 | Easy | 1×2+10×3 | 32 | 40 | 2 / 14 | 22 | 4 | 2 / 2 | 0 / 0 / 1 | – | 82% | 80% |  |
| 58 | Medium | 1×2+11×3 | 35 | 40 | 3 / 24 | 22 | 3 | 1 / 0 | 2 / 1 / 0 | – | 70% | 70% |  |
| 59 | Easy | 11×3 | 33 | 40 | 2 / 14 | 22 | 4 | 2 / 1 | 0 / 2 / 1 | – | 78% | 80% |  |
| 60 | Very Hard | 2×1+12×3 | 38 | 40 | 5 / 50 | 22 | 4 | 0 / 0 | 2 / 0 / 1 | fast, camo | 50% | 50% |  |

Notes:
- "Start fish" counts the 8 look-alikes of a camo bounty and leaves out the target fish held back in the pipe.
- Source of truth: `game/src/levels.json`, with defaults in `game/src/levelcfg.js`.

## L.3 Not decided yet

- Duration per level: _TBD_ (guess: L1 tens of seconds, L15 2–4 minutes; not measured).
- Number of fish to catch per level: not final.
- Difficulty balance: not playtested. Unchecked in particular: the lose path from L2, the jump from L4 to L5, fairness of the ×1 bounty tanks, and tolerance for a full tank of 40 fish plus pump waves at L12–15.
