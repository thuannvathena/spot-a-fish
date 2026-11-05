# Deployment

The site is built **on your machine** and pushed to the `gh-pages` branch. GitHub Pages serves that branch as-is (Settings → Pages → *Deploy from a branch*: `gh-pages`, `/`). There is no deploy workflow.

| Path | Content |
|---|---|
| [`/spot-a-fish/`](https://thuannvathena.github.io/spot-a-fish/) | Landing page with the list of all versions |
| [`/spot-a-fish/demo/`](https://thuannvathena.github.io/spot-a-fish/demo/) | Latest game build |
| [`/spot-a-fish/docs/`](https://thuannvathena.github.io/spot-a-fish/docs/) | Latest documentation |
| `/spot-a-fish/vX.Y.Z/demo/`, `/vX.Y.Z/docs/` | A frozen release |

## Updating latest

Pushing to `main` does **not** update the live site by itself. After pushing, run:

```bash
npm run release:latest
```

This requires being on `main`, in sync with `origin/main`, so latest always matches GitHub.

## Releasing a version

```bash
npm version minor        # or patch / major: bumps package.json, commits, creates tag vX.Y.Z
git push                 # optional: share the version bump on main
npm run release          # publishes v<package.json version> under /vX.Y.Z/ and pushes the tag
```

You can also name the version: `npm run release -- v0.3.0-beta.1`. The script creates the tag if it doesn't exist. Republishing an existing tag requires checking out the commit it points to.

Both commands refuse to run with uncommitted changes, so every release matches a commit. Pages updates about a minute after the push.

## How it works

`scripts/release.sh`:

1. Checks out `gh-pages` as a git worktree in `.pages/` (ignored by git), reset to `origin/gh-pages`. Your current branch is never touched.
2. Runs `scripts/publish-site.sh <latest|vX.Y.Z> .pages`. That builds the game and docs with the right base path and version label, writes them to the archive root (latest) or `.pages/vX.Y.Z/`, and regenerates `versions.json`. Other versions are left alone.
3. Adds `.nojekyll`, commits, and pushes `gh-pages`. For versions it also tags the commit and pushes the tag.

The game menu shows the version it was built as (bottom-right corner), and the docs have a version menu in the top bar.

To remove a version, delete its folder in `.pages/`, then commit and push `gh-pages` (or run `npm run release:latest` afterwards to rebuild `versions.json`).

## Previewing locally

```bash
npm run build:site                 # latest site only, into _site/
npx vite preview --outDir _site
```
