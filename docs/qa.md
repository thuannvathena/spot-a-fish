# QA checks (self-QA)

In-page checks live in `window.__qa` (`game/src/main.js`). Procedure: `.claude/skills/qa-motion/SKILL.md`. To run one: build (`npm run spike:prepare`), open the game with a new `?v=N`, click the blank border of the page so the window has focus (an unfocused window pauses the game), start a level with `window.__ff.newLevel(<level>)`, wait about 10 s, dismiss any intro pop-up, then `await window.__qa.<name>()` and read `pass` and the counts.

| check | what it measures | pass when |
|---|---|---|
| `octRelease()` | octopus tapped into the Backup, then released into the tank (frame by frame) | size steps <= 12% per frame; angle step <= 0.35 rad; not hidden by the Backup tray; no hang in the air; the 3D speed at the hand-off equals the flying picture's (0.65x to 1.5x); no jerk > 3.5 units/s; nothing outside the glass while it falls in |
| `fishRelease()` | a fish tapped into the Backup and released: speed every frame | no jump > 3.5 units/s between frames, no stop while diving |
| `fishClip(sec)` | fish bodies (middle, nose, tail) inside solid decor | 0 samples inside |
| `decorFit()` | every visible decor piece of every look: sticking out through the glass, solid pieces overlapping on the floor, soft pieces standing inside solid ones | 0 pieces out of the glass, 0 overlapping pairs, 0 soft-in-solid |
| `overlapAudit(sec)` | everything visible in the tank: decor against decor, clams against decor and each other (static), and sampled over time fish, jellyfish, octopus and clams against solid decor and against each other | 0 in every count (`fishFishEvent` counts fish that overlap during an event and is expected to be above 0 while one runs) |
| `jitter(sec)` | the smoothness of the swimming: per frame, how far each fish moved (`stepP50`, `stepP99`, `stepMax`) and how much that changed (`acc*`); `jumps` = steps over 0.18 in one frame | `jumps` close to 0 (a browser hitch shows as a few; a crowded level has a handful) and no teleport-sized `stepMax` |

## Test hooks (`window.__ff`)

`newLevel(n)`, `devWin()` (play the win sequence), `devEvent(name)`, `showPlayOn()`, `showLose()`, `sprayInk(...)`, `modelVariant(...)`, `evFreeIn()` (seconds of quiet left), `feed` (the food state), plus `G`, `orbit`, `THUMB`, `SPECIES`. `window.__hue` has the colour-turn helpers (`toxic`, `pick`, `turn`); `?oldhue=1` switches back to the old colour turn to compare.

## Habits that found real bugs

- Measure **per frame** (not a few pictures) and compare with the same measure before the change.
- Test at a **small tank shape** (heart, bowl) and at a crowded level (55-60) as well as an easy one.
- After a change to fish movement, run `jitter` and `fishClip`; after a change to decor, run `decorFit` and `overlapAudit`.
- Test pop-ups by stretching the closing delay (so a change of buttons while closing becomes visible), and hide the tab to test the paused game.

Add a check here every time a new class of defect is found.
