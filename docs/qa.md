# QA checks (self-QA)

In-page checks live in `window.__qa` (game/src/main.js). Procedure: `.claude/skills/qa-motion/SKILL.md`.

| check | what it measures | pass when |
|---|---|---|
| `octRelease()` | octopus tapped into the Backup, then released into the tank (frame by frame) | size steps <= 12% per frame; angle step <= 0.35 rad; not hidden by the Backup tray; no hang in the air; the 3D speed at the hand-off equals the flying picture's (0.65x to 1.5x); no jerk > 3.5 units/s; nothing outside the glass while it falls in |
| `fishRelease()` | a fish tapped into the Backup and released: speed every frame | no jump > 3.5 units/s between frames, no stop while diving |
| `fishClip(sec)` | fish bodies (middle, nose, tail) inside solid decor | 0 samples inside |

Add a check here every time a new class of defect is found.
