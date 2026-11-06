# Asset workflow: ChatGPT paints, Claude finishes

Claude can draw simple shapes in code, but what it draws by itself is often not pretty enough, and "painting" with code costs a lot of tokens. So the work is split:

| Who | Does | Why |
|---|---|---|
| **ChatGPT** (image generation) | The paintings: tank interiors, glass overlays, orbs, icons, text art | It makes polished 2D art cheaply |
| **Claude** | Checks the files, resizes, cuts the background, wires them into the game, animates them, adds particles and sound, tests the frame rate | Claude knows the code and can test in the running game |
| **People** | Choose the style, approve the results, commit and release | Art direction and publishing stay human |

## Steps

1. **Write the asset list first.** For each picture: name, size and proportions on screen, what is behind it and in front of it, the style reference (a screenshot of existing game art is the best reference), and whether it needs a transparent background.
2. **Generate in ChatGPT.** Use one chat per asset set so the style stays consistent, and ask for the next piece in the same chat ("matching front glass for this tank"). Claude can drive the browser through the Claude in Chrome extension: it opens the chat tool in a new tab (you stay signed in), works only in the project you name, sends the prompts, and downloads only the pictures for this task.
3. **Hand over the raw files.** They go to `Added Assets/<set>/` with plain names such as `target_back.png`, `target_front.png`. Keep the originals; the game uses resized copies.
4. **Claude checks and prepares.** Alpha channel present, centre and corners as intended (a front glass must be transparent in the middle), proportions match the back picture. Then it resizes to about twice the on-screen size (so a phone at 3x is still sharp enough) and writes the copies to `public/ui/...`.
5. **Claude wires it in.** Layer the pictures (back, fish, front), add a little motion (shimmer, bubbles, whirl, shake), and test on a phone-sized view with the `?fps=1` meter.
6. **Polish together.** If a picture is off (colour, edge, scale), either ask ChatGPT for a new version in the same chat, or let Claude fix it in code (tint, crop, mask).

## Prompt recipe

State, in this order: the game and the use ("game UI asset for a mobile casual puzzle game"), the shape and proportions, the style ("cute glossy cartoon, bold clean outlines, bright saturated colours"), what to show, and the exclusions ("NO frame, NO fish, NO text"), then "transparent PNG background". For pairs:

- **Back picture**: "Show only the INSIDE of the tank: water gradient, light rays, sandy floor, plants, bubbles. NO glass frame."
- **Front picture**: "The matching FRONT GLASS overlay for the exact same tank, same size. Almost entirely transparent: only a thin glass rim, a diagonal light streak, a reflection line at the top. The centre stays fully transparent."
- Make a second tank a **different** colour and trim (for example violet water and a gold trim) so the player never confuses the two.

## Checklist before a picture goes into the game

- Transparent PNG (alpha present, corners transparent).
- Same proportions for each back and front pair.
- No text baked into the picture.
- Sharp at 2x the displayed size, but not much bigger (keep each file under about 500 KB).
- The picture reads clearly at phone size (look at it small).

## Keep the public repo clean

The repository is public. Do not write links to chat tools, design tools, documents or drives, project or workspace names, e-mail addresses or personal paths in the docs, code comments or commit messages. Describe things in words instead.

- `npm run check:public` scans everything that would be committed.
- `npm run hooks:install` adds a pre-commit hook that runs the same check on what is staged.
- A release (`scripts/release.sh`) runs the check first and stops if it finds a problem.
- A reviewed exception can carry the word `public-ok` on the same line.
