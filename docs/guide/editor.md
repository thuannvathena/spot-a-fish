# Level editor spec

Status: **first version built** (levels A and B: warnings and Play). Written from the answers of the game designer. Items marked `_TBD_` are undecided and may change.

The editor lives in the same repo as its own page, served next to the game at `<pagesUrl>/editor/` (beside `/demo/` and `/docs/`). It is a Three.js-era custom addition; the Phaser template does not cover it.

Source: `game/editor/` (`main.js`, `template.html`, `build.mjs`). `npm run build` builds the game and the editor; `npm run build:site` copies the editor to `/editor/`. Level rules shared with the game live in `game/src/levelcfg.js`; the built-in 15 levels are `game/src/levels.json` (regenerate with `node game/tools/export-levels.mjs`).

## 0. How it works in practice

- First launch: choose a folder (Chrome/Edge) or Browser storage, then press **Add the 15 built-in levels**.
- Edit a level, press **Save** (Ctrl/Cmd+S). Each save keeps the last 10 versions.
- **Play** opens the game over the editor with the open level. Back and Restart are in the top bar. **Seed**: the same seed gives the same fish layout at the start; after that fish move with real time, so a run is not frame-for-frame identical.
- **Collections** (Organiser tab) order levels. **Export levels.json** downloads the collection as one file; put it at `game/src/levels.json` and rebuild to ship those levels in the game. The published game does not read the editor's folder by itself.
- **Reference level (1-15)** (`refLevel`): a few internal rules are not level fields yet (which random events appear, how many big fish swim around, how far look-alike colours are shifted). The level borrows them from the built-in level with that number. Auto-fill sets it from Difficulty (Easy 3, Medium 8, Hard 13).
- The preview is a 3D sketch (cylinder tank, dots for fish) and does not show real fish positions.
- Known limits of this version: the game uses only the first bounty tank in the list; the logo is a text placeholder until the official Athena asset is added; no simulation (level C).

## 1. What a level is

Spot A Fish levels are **parameter sets, not hand-placed layouts**. Fish positions are random when the game runs, so the editor edits parameters, previews them, and lets the designer play the level. It is not a grid or voxel editor.

| Group | Field (file key) | Label in editor | Notes |
|---|---|---|---|
| Goal | `goal` | Target tanks | Number of target tanks |
| Goal | `per` | **Fish per tank** | 1, 2 or 3; same for every normal tank |
| Goal | `bounty[]` | Bounty tanks | List of ×1 tanks, each `tiny`, `camo` or `fast`. They appear after the first 2 tanks |
| Fish | `species` | Species | Default `2 × goal` (target species + decoy species) |
| Fish | `decoyFish` | Decoy fish | Extra non-target fish |
| Fish | `look` | Look-alike level | 0, 1, 2 (how close decoys are to targets) |
| Fish | `sizeK`, `speedK` | Fish size, Fish speed | Multipliers |
| Obstacles | `urchin`, `jelly`, `squid`, `clam`, `swarm` | Obstacles | Counts; swarm is on/off |
| Pump tube | `tube.enabled` | Tube | On/off |
| Pump tube | `tube.extraFish` | Extra fish | Fish waiting in the tube |
| Pump tube | `tube.waves[]` | Waves | Each wave: `afterTanks` (pump after N target tanks are done) and `holdLast` (keep the last fish of a tank) |
| Pump tube | `tube.autoPumpWhenStuck`, `tube.stuckDelaySec` | Auto-pump | Default on, 2.5 s |
| Boosters | `backup`, `hint`, `clear` | Backup / Hint / Clear Backup | On/off |
| Events | `eventGap`, `feed`, `feedGap`, `swarmGap`, `startle`, `startleGap` | Events | Seconds ranges |
| Look | `theme` | Theme | Default `floor((level-1)/3)`; can be set by hand |

Defaults for every field come from the game's current `levelConfig()`. A level file may leave a field out to use the default.

**Level file:** JSON with `schema: "spot-a-fish-level"` and `version: 1` (required), `id` and `name` (required), then the fields above. Level info (not gameplay): `status`, `difficulty`, `category`.

**Out of editor scope:** progress, stars and tutorial flags (`localStorage`), shop or currency (none exists), fish art and sounds.

## 2. Validation (warnings, level 1)

The editor shows a warning for each of these:

- Total fish in the tank at start is more than `FISH_CAP` (40), or more than `TUBE_INIT` (40) when the tube is on.
- `species` is less than `2 × goal`, or more than the 23 species available.
- Fish needed (`goal × per` plus bounty tanks) is more than the fish available (tank plus tube).
- A tube wave has `afterTanks` larger than the number of target tanks.
- A bounty tank is set but fewer than 2 normal tanks exist.
- Missing required fields, duplicate `id`.

`_TBD_`: further rules ("unwinnable" cases, difficulty rules) will be added later by the designer.

## 3. Level generation

- The designer sets **Target tanks**, **Fish per tank** and **Difficulty**.
- **Auto-fill** fills species (`2 × goal`), decoys, obstacles and tube from the existing `levelConfig()` formulas. This is a **placeholder rule** to be replaced later.
- The designer then edits any field by hand.
- Fish positions are not generated by the editor; the game randomises them at runtime.

## 4. Storage

- A folder on disk (File System Access API: Chrome and Edge only) or **Browser storage** for trying things out.
- Layout: `levels/<id>.json`, `history/<id>/` (10 most recent versions), `collections/`, `drafts/`.
- Import never overwrites: a duplicate id is renamed. Delete and id rename are supported.

## 5. Level management

- Per level: **Name**, **Id**, **Status** (Draft / Ready / Retired), **Difficulty** (Easy / Medium / Hard, set by hand), **Category** (for example Tutorial, Normal, Bounty, Boss).
- Levels are ordered into **collections** in the Organiser tab (for example "Main 1–15"). Organiser behaviour and the Add level dialog follow the fixed defaults below.

## 6. Checking a level

- **Level A, built first:** warnings for basic data errors (section 2).
- **Level B, built first:** a **Play** button that runs the level in the editor.
- **Level C, later:** a simulation tool that estimates win rate and difficulty. What counts as "difficult" is `_TBD_`.

## 7. Play test

- Play opens the game over the editor, with **Back** and **Restart**.
- The game reads the editor's level JSON **directly**; no conversion step. `game/src/main.js` will load levels from JSON; the current 15 levels are exported to JSON as the default data, so the game runs as before without the editor.
- Play test does not write `localStorage` progress and does not award stars.
- A **Seed** box (optional, empty = random) makes fish layout repeatable. This needs the game to use a seeded random generator in place of `Math.random` for level setup.

## 8. Look and layout (fixed defaults)

- Athena logo (orange on dark theme, black on light). Dark and light theme with a Theme toggle, choice remembered. Colour tone as in the Fish Ball editor.
- Level list on the left, main work area in the centre, properties (inspector) on the right. Panels are collapsible and resizable, state remembered.

### Organiser: Add level dialog

1. Lists only levels not in the current collection, one row per level (name, size info, difficulty), with a tick box.
2. A search box filters by level name.
3. Buttons **Add all levels** and **Add selected levels**, with an "N of M selected" line.
4. **Add selected levels** is dimmed while nothing is ticked.
5. Either add button closes the dialog; new levels are appended at the end in the order listed.
6. If every level is already in the collection, the dialog shows "All levels are already in this collection." and no add buttons.
7. An X button closes the dialog without adding.
