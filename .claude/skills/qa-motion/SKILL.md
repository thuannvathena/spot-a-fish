---
name: qa-motion
description: Self-QA for Fishy Find animation and logic. Run BEFORE telling the user a motion, size or layer change is done. Uses the in-page checks window.__qa (game/src/main.js), not screenshots alone.
---

# QA for motion / size / layer changes

The user must not have to point out small defects. After any change to an animation, a flight, a size or a layer:

1. `npm run spike:prepare`, then open `http://localhost:8080/?vN` (new N each time) with the Browser tools.
2. Set the save flags (`tut`, `g1`, `gRot`, `gZoom`, `gTilt`, `iSquid`, `iSwarm`, `iClam`, `iPump`) in `localStorage.findfish_v1`, call `window.__ff.newLevel(<level with the thing>)`, wait ~14 s, dismiss any intro popup.
3. Run the matching check with `await window.__qa.<name>()` and read `pass` and `fails`:
   - `octRelease()`: the octopus tapped into the Backup and released: smooth one-way size, no angle jump, nothing outside the glass.
   - `fishClip(sec)`: fish inside solid decor.
4. For anything without a check yet, WRITE ONE (a function in `window.__qa` that samples every frame and returns numbers: size steps, angle steps, positions vs `wallAt`, overlaps) before saying it is fixed. A frame-by-frame number beats a still screenshot.
5. Also check: console errors, the same thing at 2 different levels/tank shapes, and every place the thing appears (tank, flight to the Backup, in the Backup, flight back, popup Out of space, lose screen, New Feature screen).
6. Report what was measured, what only looked fine in a picture, and what was not checked. Never write "done" for something not run.
