# Levels

## L.1 Design approach <Badge type="tip" text="Live" />

- **Teach one thing at a time.** Each new mechanic (Backup, Hint, Clear Backup, squid, clam, swarm, tube) appears in its own level. An obstacle intro level contains only that obstacle.
- **L1 cannot be lost.** L2 introduces Backup.
- **Difficulty rises through clutter:** more species, more look-alike decoys, more obstacles, smaller and faster fish, more pump waves. No time limit.

## L.2 Level table <Badge type="tip" text="Live" />

Configuration measured by the script `tests/tp18.py`. These are **settings, not results from real players**.

| L | Tanks × fish | To catch | Start fish | Pumped (waves) | Species | Obstacles | New in this level |
|---|---|---|---|---|---|---|---|
| 1 | 4 × 1 | 4 | 12 | – | 8 | 1 urchin | Goal, camera tutorial, cannot lose |
| 2 | 5 × 1 | 5 | 17 | – | 10 | 1 urchin | Backup (7 slots) |
| 3 | 4 × 2 | 8 | 22 | – | 8 | 1 squid | Squid, feeding, look-alike colours |
| 4 | 4 × 2 | 8 | 26 | – | 8 | 1 urchin, 1 jelly, 1 squid | Hint, swirl event |
| 5 | 5 × 3 | 15 | 39 | – | 10 | 2 urchin, 1 jelly, 1 squid | Clear Backup |
| 6 | 6 × 3 | 18 | 40 | – | 12 | 1 clam | Clam, ×1 `tiny` bounty |
| 7 | 6 × 3 | 18 | 40 | 14 (1) | 11 | 2 urchin, 2 jelly, 1 squid, 1 clam | Pump tube, hide event |
| 8 | 7 × 3 | 21 | 40 | 29 (2) | 13 | 2 urchin, 2 jelly, 1 squid, 1 clam | ×1 `camo` bounty |
| 9 | 7 × 3 | 21 | 40 | 29 | 12 | none | Fish swarm, dash fish |
| 10 | 8 × 3 | 24 | 40 | 36 | 14 | 3 urchin, 2 jelly, 1 squid, 1 clam | ×1 `fast` bounty, startle |
| 11 | 8 × 3 | 24 | 40 | 42 | 14 | 3 urchin, 3 jelly, 1 squid, 1 clam | – |
| 12 | 9 × 3 | 27 | 40 | 47 (3) | 16 | 3 urchin, 3 jelly, 2 squid, 2 clam | ×1 `tiny` bounty |
| 13 | 9 × 3 | 27 | 40 | 53 | 16 | 4 urchin, 3 jelly, 2 squid, 2 clam | – |
| 14 | 10 × 3 | 30 | 40 | 66 | 19 | 4 urchin, 3 jelly, 2 squid, 2 clam | ×1 `camo` bounty |
| 15 | 10 × 3 | 30 | 40 | 62 | 18 | 4 urchin, 4 jelly, 2 squid, 2 clam | ×1 `fast` bounty |

Notes:
- "Pumped" counts decoy fish waiting in the tube (held target fish come on top). Total fish at L15 is about 100.
- **Fish cap: at most 40 fish in the tank at once.** Tube levels start at 40 and the tube holds back decoys while the tank is full. The old floor of "at least 6 or 8 decoys" was removed so the cap always holds, so L6 now starts with 40 fish (was 46) and L14 with 40 (was 44).
- On levels with a ×1 bounty, "To catch" can be one higher than shown.
- Source of truth: `game/src/levels.json` (the 15 levels as level files), with default rules in `game/src/levelcfg.js` (`defaultsFor`). Edit levels with the [level editor](../guide/editor) or by hand. Difficulty knobs: `goal`, `per`, `decoyFish`, `urchin`, `jelly`, `sizeK`, `speedK`, `eventGap`, `feedGap`, `swarmGap`, `startleGap`.

## L.3 Not decided yet

- Duration per level: _TBD_ (guess: L1 tens of seconds, L15 2–4 minutes; not measured).
- Number of fish to catch per level: not final.
- Difficulty balance: not playtested. Unchecked in particular: the lose path from L2, the jump from L4 to L5, fairness of the ×1 bounty tanks, and tolerance for a full tank of 40 fish plus pump waves at L12–15.
