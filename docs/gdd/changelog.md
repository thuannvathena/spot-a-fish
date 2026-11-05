# 5. Changelog

Every published version stays playable at its own URL. The [landing page](https://thuannvathena.github.io/spot-a-fish/) lists them all.

## latest (main) <Badge type="tip" text="Live" />

Imported from the Find Fish prototype (changes since the first playtester feedback):

- **Playtest feedback:** about 50–60% fewer decoy fish; fish per tank rises 1 → 2 → 3; slower, bigger fish early; long tutorial replaced by a goal popup and a pointing hand; level 1 cannot be lost; gentler stars.
- **Fish look and motion:** softer outline from the fish's own colour, less glow, more body wobble and wider tail, longer swim paths, fewer idle fish.
- **Rewards:** combo words with sparkles; every 3rd combo refills Hint.
- **Random events:** squabble, conga, waltz, swirl, hide, pearl, startle (falling object), feeding.
- **Introductions by highlight:** Backup (L2), Hint (L4), Clear Backup (L5); camera tutorial at L1.
- **Obstacles:** squid moved to L3, clam to L6; bounty tanks from L6; fish swarm from L9.
- **Pump tube (L7+)** and a fish cap (now 40 at once, also enforced for pump waves), with many display fixes so the tube is not bent by the lens.
- **Global collision** between fish, obstacles, decorations and tube.
- **Feeding:** 3D food bucket replaces the 3D hand.
- **Water surface:** smooth normals, reflections rebuilt, grid reduced for performance.
- **Hover:** double-layer gold outline on desktop.
- **Pause menu:** Reset progress.
- **Project:** moved into the docs and release structure (Three.js game kept).
- **Phaser 4 UI layer:** the top bar, target tanks (small live aquariums), tool buttons, Backup tray, popups, spotlight tips and messages are drawn by Phaser above the 3D tank. Level editor added.
- **Clear Backup:** returning fish now fly to the open top of the tank and drop in through it, with a splash, instead of appearing under the water.
- **Glass rim and tank shell:** the water lens no longer bends the glass wall, rims, stand or plinth; only what is inside the water (fish, sand, decorations, surface) is refracted.
- **One event at a time:** feeding, the pearl game, the falling rock, the swarm and tube waves now wait for each other instead of overlapping.
- **Fixes:** Clear Backup no longer freezes the game when the Backup holds obstacles (they have no tail, which the new drop animation assumed). Dropping fish now dive head first, seen in profile, and carry on in the direction they dived. The gold hover outline follows the fish silhouette again.
- **UI style: brass and glass.** The whole Phaser UI is drawn like aquarium equipment: a brass control rail with a porthole for the level and a valve wheel for pause; a glass water gauge that fills as target tanks are finished, marked with starfish (the stars of the game); hanging brass nameplates and corner brackets on the target tanks; a brass shelf with glass jars for the Backup (slimmer than before); brass-bezel tool buttons; popups in riveted brass frames with a coral banner and pearl buttons; a level list as a reef of pearls joined by stepping stones, with starfish for the stars; messages and spotlight tips with brass edges.
- **Hover glow:** the gold highlight is now a glow hull around the whole 3D fish, so it wraps the fish from any angle (before it was a flat plane that showed only as a slice when the fish faced the camera).
- **Fish bodies:** each fish is one closed, welded surface that follows the true outline of its picture, with a rounded edge, so there is no gap between the two faces. The rim is rounded with several rows of vertices following a circular profile, and vertices near the edge read the picture a few pixels inside, so there is no seam, stitch marks or pale bands even when a fish is seen head-on. The dark outline is a thin inverted hull behind the body, and the fish colours are smeared a few pixels past the outline, so edge-on views show no black tear or dots. Clear Backup fish leave the tray with a short hop and enter below it through the mouth of the tank.

Detailed history is in the original project's `CHANGELOG.md`.

[Play latest](https://thuannvathena.github.io/spot-a-fish/demo/)

## Document history

| Date | Change |
|---|---|
| 2026-11-05 | GDD created from the Find Fish prototype's handover notes and changelog |
