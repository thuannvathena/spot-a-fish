# Art and audio

## A.1 Current state <Badge type="tip" text="Live" />

- **Fish:** 49 species, each a 3D model (`public/models/fish/<name>/`: one `model.fbx` and one `tex.jpg`). The body wave and the blink are done in code. The colour copies used as look-alikes are made from the same texture by turning its colours ([Rules 3.2](./rules#_3-2-fish)).
- **Artist models in the tank:** the octopus, the jellyfish, the clam, the clay pot, the stone pillars and statue, the anchor, the three corals and the glass bottle (`public/models/<name>/`, one `model.fbx` and one `tex.png` each). The source files are in `Fish Asset 3D/`.
- **Still built in code, as placeholders:** rocks, houses, arches, seaweed, anemones, the treasure chest, the wreck, barrels, the Atlantis crystals and sea seeds, the pump tube, the food bucket and the pearl.
- **UI:** drawn by Phaser from pictures: the pop-ups (Pause, Out of space, Purchase, Well Done, Level failed), buttons, ribbons, icons and the progress bar are in `public/ui/bf/` and `public/ui/new/`; the target tanks, the Backup and the cage are in `public/ui/tanks/`; the loading screen and the logo are in `public/ui/load/`. The font is Lilita One. The Levels pop-up (the level grid) is still the older, plain HTML look. The art in `public/ui/bf/` came from the sister project; it can be replaced piece by piece.
- **Look:** a round or shaped tank (6 shapes) in a 3D aquarium hall (6 looks), glass and water bending the view through a post-process lens, a rippling surface, light rays, bubbles, confetti and a curtain between levels.
- **Logo:** `Added Assets/Game logo.png` (cut and resized to `public/ui/load/logo.png`), shown on the loading screen with a wave and a light sweep.

## A.2 3D fish: what a new fish needs

- The fish are 49 models in `public/models/fish/` (source: `Fish Asset 3D/3D model`). **For a new fish:** one mesh, one texture, the eyes drawn on the texture with a dark pupil and a white highlight, the nose to +x or +z (list the file in `FACES_Z` if it faces z), then run `scripts/prep-fish.py`: it copies every fish from `Fish Asset 3D/3D model` into `public/models/fish/` and writes `public/models/fish/list.json`.
- A fish covers only a few dozen pixels on screen, so **big eyes, contrasting colours and a readable shape** matter more than fine detail. The game finds the eye on the texture for the blink; if it is unclear the blink does not show (a position can be given by hand in `EYE_AT`).
- The dark outline is generated from the fish's own colour. **Do not paint a black outline.**
- Keep species clearly different in shape and colour: wrong fish include colour copies of targets, so already-similar originals make levels unfair.
- The old Unity set, `blue_white_babe` and the 2D pictures are gone.

## A.3 Decoration models

- Put the source in `Fish Asset 3D/Decoration/<Name>/` (an `.fbx` and its `.png`), copy it to `public/models/<name>/model.fbx` with the texture resized to 1024 px as `tex.png`, and add the piece to a theme in `game/src/main.js` with `loadDecorModel('<name>')` (the model is scaled to a height you give, stands on the floor and is lit by its own texture).
- Solid pieces are laid out so they never overlap each other or stick out through the glass; a piece that cannot fit in a small tank is left out. A piece made of parts should have a simple shape (the collision box comes from its size; a tilted long part makes a huge box). See [Rules 3.8](./rules#_3-8-collision-and-layout).
- Decoration in real planted aquariums is mostly few and large pieces (rock, driftwood, big plants), while a themed cartoon tank carries more. A crowded tank is where overlap and jitter bugs start, so every new piece should be checked at a small tank shape.

## A.4 Animation and expressions wanted from the artist <Badge type="warning" text="Coming soon" />

None of this is integrated yet. Everything else (bounce on spawn, shake on touch, flying into the tray, bubbles, ink, light rays, water splashes, schooling, biting the food) is done in code.

**Loop clips (30 fps, in place):**

| Clip | Description |
|---|---|
| Swim | S-shaped body bend, fanned tail, pectoral fins flapping, seamless loop. Code scales playback speed, so one clip is enough |
| Hover | Almost still, only pectoral fins and tail move slightly |

**5 face expressions (blendshape or face texture swap):**

| Expression | Eyes | Mouth | Fins / body | Used when |
|---|---|---|---|---|
| Neutral | Medium, round, pupil centred, blink (~0.2 s, every 2-5 s) | Closed, corners slightly up | Relaxed | Normal |
| Happy | Curved ^ ^ (or big round with highlight), slightly puffed cheeks | Wide smile, may be open | Pectoral fins slightly up | Correct fish, celebration |
| Scared | Very big round, tiny pupil | Crooked, small open, trembling | Fins stiff upright, body tucked | Near jellyfish / octopus, tapped, pushed from tube |
| Sad | Big, outer corners drooping, pupil looking down | Closed, curved down | Fins drooping, tail low | Wrong tap, sent to Backup |
| Surprised | Big round, tiny pupil, lid fully open | Round O | Fins slightly spread | Just spawned, caught, startled by a falling object |

Optional if time allows: **Dizzy** (swirl eyes, covered in ink) and **Eating** (a chewing mouth: the fish bite the food but have no chewing animation yet).

Convention: keep the same bone names and the same eye and mouth positions across species so code can share logic.

## A.5 Other art to consider

- Real models for the pearl, the food bucket, the pump tube, and the code-built decoration listed in A.1.
- A new UI kit, so `public/ui/bf/` can be retired; the Levels pop-up in the new style.
- App icon and store images.

## A.6 Audio <Badge type="tip" text="Live" />

Sound is recorded files in `public/sfx/` (38 effects and the music `bgm_ap`, as `.m4a`), played through WebAudio. A sound without a file does not play (the old synthesised bleeps are gone). The music restarts with every level, ducks to half while a pop-up is open and fades out when the win or lose screen comes. See [Sounds](./sounds) for which sound plays when.

**Missing sounds:** the swarm, the squabble and conga events, fish biting the food, the jellyfish, the bounty tanks, the camera and the tank shape change.
