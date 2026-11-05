# Art and audio

## A.1 Current state <Badge type="tip" text="Live" />

- Fish are 2D PNGs (side view) inflated into pillow meshes. No skeletal animation and no expressions yet; only a code-built blink lid on some species.
- Everything that is not a fish is a code-built shape used as a placeholder: urchin, jellyfish, squid, clam, rocks, houses, columns, seaweed, pump tube, food bucket, pearl.
- UI (HUD, target tanks, tools, popups, level list) is drawn by Phaser in code in a brass-and-glass aquarium style, with the Lilita One font. It reads from hidden HTML elements. No official UI art yet; the shapes are placeholders that real art can replace piece by piece.
- No icon or store art.

## A.2 Fish image requirements (current pipeline)

- Transparent PNG, **side view, head to one side**, clear silhouette. A fish covers only a few dozen pixels on screen, so **big eyes, contrasting colours and a readable shape** matter more than fine detail.
- Code crops to the opaque area, finds the eye (dark round area) and generates thickness. If the eye is unclear, the blink lid will not show.
- The dark outline is generated from the fish's own colour. **Do not paint a black outline.**
- Keep species clearly different in shape and colour: decoys include hue-rotated copies of targets, so already-similar originals make levels unfair.
- Sources: `Fish_img/` (artist PSDs, ~1.9 GB, not in this repo). `game/assets/fishes/` holds the 30 PNGs the build uses.
- `fish_22` (whale) and `fish_30` (shark) use code models; their PNGs are not turned into meshes.

## A.3 Animation and expressions wanted from the artist <Badge type="warning" text="Coming soon" />

None of this is integrated yet. Everything else (bounce on spawn, shake on touch, flying into the tray, bubbles, ink, light rays, water splashes, schooling) is done in code.

**Loop clips (30 fps, in place):**

| Clip | Description |
|---|---|
| Swim | S-shaped body bend, fanned tail, pectoral fins flapping, seamless loop. Code scales playback speed, so one clip is enough |
| Hover | Almost still, only pectoral fins and tail move slightly |

**5 face expressions (blendshape or face texture swap):**

| Expression | Eyes | Mouth | Fins / body | Used when |
|---|---|---|---|---|
| Neutral | Medium, round, pupil centred, blink (~0.2 s, every 2–5 s) | Closed, corners slightly up | Relaxed | Normal |
| Happy | Curved ^ ^ (or big round with highlight), slightly puffed cheeks | Wide smile, may be open | Pectoral fins slightly up | Correct fish, celebration |
| Scared | Very big round, tiny pupil | Crooked, small open, trembling | Fins stiff upright, body tucked | Near urchin / squid, tapped, pushed from tube |
| Sad | Big, outer corners drooping, pupil looking down | Closed, curved down | Fins drooping, tail low | Wrong tap, sent to Backup |
| Surprised | Big round, tiny pupil, lid fully open | Round O | Fins slightly spread | Just spawned, caught, startled by a falling object |

Optional if time allows: **Dizzy** (swirl eyes, covered in ink) and **Eating** (chewing mouth, feeding scene).

Convention: keep the same bone names and the same eye and mouth positions across species so code can share logic. Special species (seahorse, puffer, whale) may need their own Swim clip.

## A.4 Other art to consider

- Real models for urchin, jellyfish, squid, clam, pearl, food bucket. Code reads sizes from bounding boxes, so replacing a model means re-checking [collision](./rules#_3-8-collision).
- Decoration sets for the 5 themes.
- Official UI kit: buttons, Backup tray, target tanks, win/lose popups, stars.
- App icon and store images.

## A.5 Audio <Badge type="tip" text="Live" />

All audio is placeholder sound synthesized in code (WebAudio). No sound files and no background music (an `ambient()` function exists but is off). 13 sounds exist: `ui`, `miss`, `scatter`, `good`, `bad`, `junk`, `land`, `complete`, `win`, `lose`, `hint`, `splash`, `plip`, `start`.

**Missing sounds:** tube shaking and cap opening, food bucket pouring, fish eating, fish head-butting, squid ink spray, clam opening and closing, swarm. A real SFX set and background music are also needed.

To swap sounds, edit `Snd` at the top of `game/src/main.js` (about lines 22–74). Keep the event names (`Snd.play('good')`) and change what is inside to play files.
