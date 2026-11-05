# 2. Core loop

## 2.1 Moment-to-moment loop <Badge type="tip" text="Live" />

1. Two **target tanks** (`NT = 2`) sit above the main tank. Each shows a species and a count (×1, ×2 or ×3).
2. The player looks through the crowded tank (rotate, zoom, tilt) and taps a fish of the needed species.
3. **Right tap:** the fish jumps out and flies into the target tank. When the count is filled, that tank is done and a new one appears, until all targets of the level are done.
4. **Wrong tap** (another species, or a sea urchin / jellyfish / squid): the thing goes to the **Backup** tray (7 slots). Fish in Backup are **not lost**: when a later target tank needs that species, it is pulled out automatically.
5. **Tap on empty water:** nearby fish panic and scatter.
6. **Win** when every target tank is done. **Lose** when Backup reaches 7 slots.

There is no timer. Pressure comes only from Backup and from how cluttered the tank is.

## 2.2 Feedback loop <Badge type="tip" text="Live" />

- **Combo:** consecutive right taps show GOOD / NICE / GREAT / AMAZING / UNREAL ×n with sparkles. Every 3rd combo refills the Hint booster. A wrong tap resets combo to 0.
- **Stars at the end of a level:** at most 3 wrong taps = 3 stars, at most 6 = 2 stars, otherwise 1 star.

## 2.3 Session loop <Badge type="tip" text="Live" />

Pick a level from the level grid, play it (seconds to a few minutes, not measured yet), see win or lose with stars, go to the next level or retry. Progress (unlocked level, stars, tutorial flags) is saved in `localStorage` under `findfish_v1`.

_TBD_: target session length and how many levels a session should cover.

## 2.4 Long-term loop

_TBD_. The prototype has no meta layer: no shop, quests, characters, endless levels, ads, analytics or IAP.
