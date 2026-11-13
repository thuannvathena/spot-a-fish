# Levels

## L.1 Design approach <Badge type="tip" text="Live" />

- **Teach one thing at a time.** Each new mechanic (Backup, Hint, Clear Backup, squid, clam, swarm, tube) appears in its own level. An obstacle intro level contains only that obstacle.
- **L1-2 have only target fish.** L3 introduces the Backup together with the first wrong fish; L5 is the first level that can be lost.
- **Difficulty rises through clutter:** more species, more look-alike decoys, more obstacles, smaller and faster fish, more pump waves. No time limit.

## L.2 Level table <Badge type="tip" text="Live" />

60 levels on one smooth ramp, made by `scripts/plan-levels.py --apply` (it writes `game/src/levels.json`; `scripts/make-levels-doc.py` writes this table). About 99 minutes in total at 5 s per fish to catch. The Hard and Very Hard levels are the long ones (up to 195 s); the Easy levels between them are shorter, so long levels do not come one after another. The bot counts 110 minutes because it also waits for the pipe and the swarm.

- **Unlocks:** Backup L3 (the first wrong fish come in the same level), Hint L4, Clear Tank L7, Clear Backup L9, squid L11, pipe L16, clam (shell) L21, swarm L31. Each unlock shows its pop-up in that level, and the pop-ups wait until the UI and the lids of the target tanks have finished.
- **Fish in the tank at once** (`startFish`) climbs from 10 (L1) to 40 (L59-60); the cap is 40 in the tank at once (`FISH_CAP`). The total of a level (`maxFish`) can be above 40 because the pipe pumps fish in later. A Hard level is 2 fish above the trend, the level after it goes back.
- **Wrong fish:** 6 in L1-4 and 7 from L5: the Backup holds 7, so L5 is the first level that can be lost (in L1-2 there is no Backup yet, so a wrong tap only makes the fish dart off). After that they are about 40-50% of the fish, and the crowd, not the length of the level, makes late levels hard. Every level keeps at least 6 fish over once every tank is full, so the win animation always has fish to play with. Two wrong fish of the same species never look alike: each copy after the first has its colours turned a little.
- **Colour noise:** none in L1-10 (the wrong fish come from other colour families than the targets). Colour copies of a target start in L11 (1), then 2 from L21, 3 from L31 and 4 from L46. Species the same colour family as a target also start in L11.
- **Fish to catch** grow from 4 (L1) to about 39 at the longest levels. **Fish per tank** go from 1 (L1-7) to a mix of 1 and 2 (from L8) and 3 (from L18).
- **Pipe:** from L16. Each wave holds back the last fish of 1 target species (2 on Hard / Very Hard). On Hard and Very Hard levels the last wave comes when one tank is left, so the end of the level is a choke point. The pipe tells the player: two tanks before a wave its mouth glows, one tank before it glows more, bubbles rise and it shivers now and then, then it rumbles and opens. Levels 5, 10 and 15 have no pipe: their choke point is only that the last tanks are searched among mostly wrong fish.
- **New fish are met a few at a time:** 4 species at L1, 9 by L3, 24 by L10, 34 by L20, 41 by L30 and all 49 by L45 (the whale, the shark and the sea horse are wrong fish only). A level uses at most 30 species including colour copies.
- **Fish look and speed:** every fish is size 1.4 and speed 0.85 (bounty fish excepted).
- **Bounty tanks** (tiny / camo / fast, 1 fish each) only from L25: L25 tiny, L35 camo, L45 fast, L55 tiny + camo, L60 fast + camo.
- **Urchin and jelly:** first urchin in L8, first jellyfish in L10; none in a level that introduces a feature.
- **Themes and tank shapes:** 6 themes and 6 tank shapes (cylinder, bowl, rounded box, hexagon, flower, heart), 10 levels each.
- **Win rate:** the bot (`node game/tools/wr-sim.mjs`) plays each level thousands of times with a model of a player and reports the first-try win rate (no boosters, no Play On). It is a guess until real players are measured: it says about 100% up to L30 and about 69% at L60. The target win rates of the old design sheet are NOT met for about 30 levels: the ramp has far fewer fish in the middle levels. `game/tools/wr-tune-plan.mjs` can nudge colour copies, urchins and jellyfish towards those targets but it cannot close the gap.
- **Lose position:** the bot reports where in the level a lost run ended (`lossAt`, `lateShare` in `--json`); in the Hard levels it does not lose late, so the choke point at the end is not confirmed by the bot.

| L | Diff | Tanks (fish each) | To catch | Start fish | Total fish | Pipe (waves / fish) | Species (+ colour copies) | Wrong fish | Look-alikes | Urchin / jelly | Squid / clam / swarm | Bounty | Bot WR | Old target WR | Time (s) | New in this level |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Easy | 4×1 | 4 | 10 | 10 | – | 6 | 6 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | 20 | Tutorial |
| 2 | Easy | 5×1 | 5 | 11 | 11 | – | 7 | 6 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | 25 |  |
| 3 | Easy | 5×1 | 5 | 11 | 11 | – | 7 | 6 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 97% | 25 | Backup Slot |
| 4 | Medium | 5×1 | 5 | 11 | 11 | – | 8 | 6 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | 25 | Booster 1: Hint |
| 5 | Hard | 6×1 | 6 | 13 | 13 | – | 10 | 7 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 92% | 30 |  |
| 6 | Easy | 7×1 | 7 | 14 | 14 | – | 11 | 7 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 97% | 35 |  |
| 7 | Easy | 7×1 | 7 | 14 | 14 | – | 11 | 7 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | 35 | Booster 2: Tank Clear |
| 8 | Medium | 6×1+1×2 | 8 | 20 | 20 | – | 11 | 12 | 0 | 1 / 0 | 0 / 0 / 0 | – | 100% | 92% | 40 |  |
| 9 | Easy | 7×1+1×2 | 9 | 22 | 22 | – | 12 | 13 | 0 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | 45 | Booster 3: Backup Clear |
| 10 | Hard | 7×1+1×2 | 9 | 22 | 22 | – | 13 | 13 | 0 | 2 / 1 | 0 / 0 / 0 | – | 100% | 86% | 45 |  |
| 11 | Easy | 5×1+2×2 | 9 | 20 | 20 | – | 12 | 11 | 1 | 0 / 0 | 1 / 0 / 0 | – | 100% | 100% | 45 | Feature 1: Squid |
| 12 | Easy | 6×1+2×2 | 10 | 22 | 22 | – | 13 | 12 | 1 | 0 / 0 | 1 / 0 / 0 | – | 100% | 87% | 50 |  |
| 13 | Easy | 3×1+4×2 | 11 | 20 | 20 | – | 12 | 9 | 1 | 0 / 0 | 1 / 0 / 0 | – | 100% | 82% | 55 |  |
| 14 | Medium | 2×1+5×2 | 12 | 20 | 20 | – | 12 | 8 | 1 | 1 / 0 | 0 / 0 / 0 | – | 100% | 90% | 60 |  |
| 15 | Hard | 1×1+6×2 | 13 | 21 | 21 | – | 12 | 8 | 1 | 1 / 1 | 1 / 0 / 0 | – | 100% | 75% | 65 |  |
| 16 | Easy | 2×1+6×2 | 14 | 19 | 22 | 1 / 3 | 13 | 8 | 1 | 0 / 0 | 0 / 0 / 0 | – | 100% | 90% | 70 | Pump |
| 17 | Easy | 1×1+7×2 | 15 | 20 | 23 | 1 / 3 | 13 | 8 | 1 | 0 / 0 | 0 / 0 / 0 | – | 100% | 87% | 75 |  |
| 18 | Medium | 6×2+1×3 | 15 | 23 | 27 | 1 / 4 | 13 | 12 | 1 | 1 / 0 | 1 / 0 / 0 | – | 100% | 80% | 75 |  |
| 19 | Easy | 8×2 | 16 | 22 | 25 | 1 / 3 | 14 | 9 | 1 | 0 / 0 | 0 / 0 / 0 | – | 100% | 87% | 80 |  |
| 20 | Very Hard | 9×2+1×3 | 21 | 25 | 36 | 1 / 11 | 18 | 15 | 1 | 0 / 0 | 1 / 0 / 0 | – | 100% | 70% | 105 |  |
| 21 | Easy | 5×2+2×3 | 16 | 24 | 27 | 1 / 3 | 14 | 11 | 2 | 0 / 0 | 0 / 1 / 0 | – | 100% | 100% | 80 | Feature 2: Shell |
| 22 | Easy | 3×2+3×3 | 15 | 22 | 25 | 1 / 3 | 14 | 10 | 2 | 0 / 0 | 0 / 1 / 0 | – | 100% | 95% | 75 |  |
| 23 | Easy | 5×2+2×3 | 16 | 24 | 27 | 1 / 3 | 15 | 11 | 2 | 0 / 0 | 0 / 1 / 0 | – | 100% | 90% | 80 |  |
| 24 | Medium | 5×2+3×3 | 19 | 24 | 31 | 1 / 7 | 17 | 12 | 2 | 0 / 0 | 1 / 0 / 0 | – | 100% | 85% | 95 |  |
| 25 | Hard | 1×1+4×2+5×3 | 24 | 26 | 40 | 1 / 14 | 21 | 16 | 2 | 2 / 0 | 0 / 1 / 0 | tiny | 100% | 70% | 120 | First bounty |
| 26 | Easy | 2×2+4×3 | 16 | 24 | 27 | 1 / 3 | 14 | 11 | 2 | 0 / 0 | 0 / 0 / 0 | – | 100% | 98% | 80 |  |
| 27 | Easy | 1×2+5×3 | 17 | 25 | 28 | 1 / 3 | 14 | 11 | 2 | 0 / 0 | 1 / 0 / 0 | – | 99% | 90% | 85 |  |
| 28 | Medium | 3×2+5×3 | 21 | 25 | 34 | 1 / 9 | 17 | 13 | 2 | 1 / 1 | 0 / 1 / 0 | – | 100% | 80% | 105 |  |
| 29 | Easy | 3×2+4×3 | 18 | 27 | 30 | 1 / 3 | 16 | 12 | 2 | 0 / 0 | 1 / 0 / 0 | – | 99% | 90% | 90 |  |
| 30 | Hard | 2×2+8×3 | 28 | 28 | 46 | 2 / 18 | 22 | 18 | 2 | 0 / 0 | 1 / 1 / 0 | – | 99% | 60% | 140 |  |
| 31 | Easy | 6×3 | 18 | 27 | 30 | 1 / 3 | 16 | 12 | 3 | 0 / 0 | 0 / 0 / 1 | – | 100% | 100% | 90 | Feature 3: Fish Swarm |
| 32 | Easy | 6×3 | 18 | 27 | 31 | 1 / 4 | 16 | 13 | 3 | 0 / 0 | 0 / 0 / 1 | – | 99% | 95% | 90 |  |
| 33 | Easy | 6×3 | 18 | 28 | 31 | 1 / 3 | 16 | 13 | 3 | 0 / 0 | 0 / 0 / 1 | – | 99% | 90% | 90 |  |
| 34 | Medium | 8×3 | 24 | 29 | 41 | 1 / 12 | 20 | 17 | 3 | 1 / 0 | 0 / 1 / 0 | – | 99% | 85% | 120 |  |
| 35 | Hard | 1×1+1×2+9×3 | 30 | 31 | 52 | 2 / 21 | 26 | 22 | 3 | 1 / 0 | 0 / 0 / 1 | camo | 97% | 70% | 150 |  |
| 36 | Easy | 1×2+6×3 | 20 | 29 | 34 | 1 / 5 | 18 | 14 | 3 | 0 / 0 | 0 / 1 / 0 | – | 100% | 98% | 100 |  |
| 37 | Easy | 1×2+6×3 | 20 | 30 | 34 | 1 / 4 | 18 | 14 | 3 | 0 / 0 | 1 / 0 / 0 | – | 98% | 90% | 100 |  |
| 38 | Medium | 1×2+8×3 | 26 | 30 | 44 | 1 / 14 | 22 | 18 | 3 | 1 / 0 | 0 / 0 / 1 | – | 99% | 80% | 130 |  |
| 39 | Easy | 7×3 | 21 | 32 | 37 | 1 / 5 | 19 | 16 | 3 | 0 / 0 | 1 / 1 / 0 | – | 96% | 90% | 105 |  |
| 40 | Very Hard | 3×2+9×3 | 33 | 33 | 58 | 2 / 25 | 29 | 25 | 3 | 0 / 0 | 1 / 0 / 1 | – | 99% | 60% | 165 |  |
| 41 | Easy | 7×3 | 21 | 31 | 37 | 1 / 6 | 19 | 16 | 3 | 0 / 0 | 0 / 0 / 0 | – | 100% | 100% | 105 |  |
| 42 | Easy | 2×2+6×3 | 22 | 32 | 38 | 1 / 6 | 20 | 16 | 3 | 0 / 0 | 1 / 0 / 0 | – | 98% | 95% | 110 |  |
| 43 | Easy | 2×2+6×3 | 22 | 32 | 39 | 1 / 7 | 20 | 17 | 3 | 0 / 0 | 0 / 1 / 0 | – | 98% | 90% | 110 |  |
| 44 | Medium | 1×2+9×3 | 29 | 34 | 51 | 2 / 17 | 25 | 22 | 3 | 0 / 0 | 0 / 0 / 1 | – | 99% | 85% | 145 |  |
| 45 | Hard | 1×1+11×3 | 34 | 35 | 62 | 3 / 27 | 30 | 28 | 3 | 0 / 0 | 1 / 1 / 0 | fast | 94% | 70% | 170 |  |
| 46 | Easy | 8×3 | 24 | 34 | 42 | 1 / 8 | 22 | 18 | 4 | 0 / 0 | 0 / 0 / 0 | – | 99% | 98% | 120 |  |
| 47 | Easy | 8×3 | 24 | 34 | 42 | 1 / 8 | 22 | 18 | 4 | 0 / 0 | 0 / 0 / 1 | – | 99% | 90% | 120 |  |
| 48 | Medium | 10×3 | 30 | 35 | 54 | 2 / 19 | 27 | 24 | 4 | 0 / 0 | 1 / 1 / 0 | – | 92% | 80% | 150 |  |
| 49 | Easy | 8×3 | 24 | 36 | 44 | 1 / 8 | 23 | 20 | 4 | 0 / 0 | 0 / 1 / 1 | – | 96% | 90% | 120 |  |
| 50 | Hard | 13×3 | 39 | 38 | 71 | 3 / 33 | 30 | 32 | 4 | 0 / 0 | 1 / 0 / 1 | – | 93% | 60% | 195 |  |
| 51 | Easy | 2×2+7×3 | 25 | 36 | 45 | 1 / 9 | 24 | 20 | 4 | 2 / 0 | 0 / 0 / 0 | – | 97% | 90% | 125 |  |
| 52 | Easy | 2×2+7×3 | 25 | 36 | 46 | 1 / 10 | 25 | 21 | 4 | 0 / 0 | 2 / 0 / 0 | – | 91% | 85% | 125 |  |
| 53 | Easy | 1×2+8×3 | 26 | 37 | 47 | 1 / 10 | 25 | 21 | 4 | 2 / 1 | 0 / 2 / 0 | – | 89% | 80% | 130 |  |
| 54 | Medium | 11×3 | 33 | 38 | 61 | 2 / 23 | 30 | 28 | 4 | 2 / 2 | 0 / 0 / 1 | – | 83% | 75% | 165 |  |
| 55 | Hard | 2×1+12×3 | 38 | 40 | 73 | 3 / 33 | 30 | 35 | 4 | 0 / 0 | 1 / 2 / 0 | tiny, camo | 74% | 60% | 190 |  |
| 56 | Easy | 1×2+8×3 | 26 | 38 | 49 | 1 / 11 | 26 | 23 | 4 | 2 / 1 | 0 / 0 / 0 | – | 92% | 88% | 130 |  |
| 57 | Easy | 9×3 | 27 | 39 | 50 | 1 / 11 | 26 | 23 | 4 | 2 / 2 | 0 / 0 / 1 | – | 85% | 80% | 135 |  |
| 58 | Medium | 2×2+10×3 | 34 | 39 | 64 | 2 / 25 | 30 | 30 | 4 | 1 / 0 | 2 / 1 / 0 | – | 74% | 70% | 170 |  |
| 59 | Easy | 9×3 | 27 | 40 | 51 | 1 / 11 | 26 | 24 | 4 | 2 / 1 | 0 / 2 / 1 | – | 81% | 80% | 135 |  |
| 60 | Very Hard | 2×1+12×3 | 38 | 40 | 76 | 4 / 36 | 30 | 38 | 4 | 0 / 0 | 2 / 0 / 1 | fast, camo | 69% | 50% | 190 |  |

## L.3 Not decided yet

- Duration per level: only the estimate fish × 5 s (and the bot's); not measured with players.
- Difficulty balance: not playtested. Unchecked in particular: the lose path from L3, the jump from L4 (5 wrong fish) to L5 (7), whether the choke point at the end of the Hard levels is felt, and how long the long levels really take (the bot says up to about 200 s with the pipe and the swarm).
