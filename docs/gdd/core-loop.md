# 2. Core loop

## 2.1 Moment-to-moment loop <Badge type="tip" text="Live" />

1. Two **target tanks** (`NT = 2`) sit above the main tank. Each shows a species and a count (x1, x2 or x3).
2. The player looks through the crowded tank (rotate, zoom, move the view) and taps a fish of the needed species.
3. **Right tap:** the fish jumps out and flies into the target tank. When the count is filled, that tank is done and a new one appears, until all targets of the level are done.
4. **Wrong tap** (another species, a jellyfish or the octopus): the thing goes to the **Backup** tray (7 slots). Fish in the Backup are **not lost**: when a later target tank needs that species, it is pulled out automatically. The octopus takes 3 slots.
5. **Tap on empty water:** nearby fish dart away; the surface ripples only when the tap is at or near the surface.
6. **Win** when every target tank is done. **Lose** when the Backup reaches 7 slots (the Backup exists from L3, but L5 is the first level with enough wrong fish to fill it).

There is no timer. Pressure comes only from the Backup and from how cluttered the tank is. The player can use **boosters** (Hint, Clear Tank, Clear Backup; [Rules 3.4](./rules#_3-4-boosters)) and, when the Backup is full, **Play on** ([Rules 3.11](./rules#_3-11-coins-boosters-and-ads)).

## 2.2 Feedback loop <Badge type="tip" text="Live" />

- **Combo:** correct taps within 7.5 s of each other chain. From the second tap a cheer word pops up where the fish was tapped: **NICE** (2), **GREAT** (3-4), **SUPER** (5-6), **WOW** (7 and more), with a rising sound that steps up through four recordings. A wrong tap resets the combo.
- **Stars:** at the end of a level, at most 3 wrong taps = 3 stars, at most 6 = 2 stars, otherwise 1. They are saved and shown in the level list; there is no stars pop-up.
- **Target tanks:** when a tank is full its lid shuts, it whirls into a bubble and flies up into the progress gauge, which fills.
- **Win:** the UI fades, the camera pulls back, the fish that are left swirl up out of the tank, circle in a bubble and fall back into the water; LEVEL COMPLETE, then the WELL DONE screen with the coins ([Rules 3.12](./rules#_3-12-the-win-sequence)).
- **Lose:** the Backup glass breaks and the water floods the screen; the **Out of space!** pop-up offers Play on; "No thanks" shows the Level failed screen with Retry.

## 2.3 Session loop <Badge type="tip" text="Live" />

Play a level (20 s to 3 minutes by the plan, not measured on players yet), win with WELL DONE and coins, and the next level opens behind a curtain. The level list (from the Pause menu) lets the player pick any level, and the stars of each. Progress (unlocked level, stars, coins, boosters, tutorial flags, daily ad counts) is saved in `localStorage` under `findfish_v1`.

_TBD_: target session length and how many levels a session should cover.

## 2.4 Long-term loop <Badge type="warning" text="Prototype" />

- **Coins** (start with 900, earned by winning, spent on boosters and Play on), a **Purchase pop-up** for boosters with a coin button and an ad button, and **rewarded-ad buttons** (x2 reward, booster, Play on). The ad buttons grant the reward at once: no ad network is attached.
- **Feature progress:** the WELL DONE screen shows a bar towards the next unlocked feature; a full bar shows UNLOCKED!.
- _TBD_: quests, characters, endless levels, analytics, IAP, interstitial ads (the design is in [Rules 3.11](./rules#_3-11-coins-boosters-and-ads), not built).
