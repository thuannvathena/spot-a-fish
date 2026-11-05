#!/usr/bin/env bash
# Builds the site locally and publishes it to the gh-pages branch, which GitHub Pages serves.
#
# Usage:
#   scripts/release.sh latest    rebuild the latest site (/, /demo/, /docs/) from main
#   scripts/release.sh vX.Y.Z    publish a frozen copy under /vX.Y.Z/ and tag the commit
#   scripts/release.sh           same as above, using the version in package.json
#
# gh-pages is checked out as a worktree in .pages/, so the current branch is never touched.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

VERSION="${1:-v$(node -p "require('./package.json').version")}"
TITLE="$(node -p "require('./prototype.config.json').title")"
PAGES_URL="$(node -p "require('./prototype.config.json').pagesUrl")"
PAGES=.pages

if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree has uncommitted changes; commit or stash them so the release matches a commit." >&2
    exit 1
fi

git fetch --quiet origin
if [[ "$VERSION" == latest ]]; then
    # latest always mirrors what's on GitHub's main.
    if [[ "$(git rev-parse --abbrev-ref HEAD)" != main || "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
        echo "Publishing latest requires being on main, in sync with origin/main (pull or push first)." >&2
        exit 1
    fi
elif git rev-parse --quiet --verify "refs/tags/$VERSION" >/dev/null; then
    if [[ "$(git rev-parse "$VERSION^{commit}")" != "$(git rev-parse HEAD)" ]]; then
        echo "Tag $VERSION already exists on another commit; check out that commit to republish it." >&2
        exit 1
    fi
fi

# Fresh gh-pages worktree matching the remote archive.
if [[ -d "$PAGES" ]]; then
    if [[ -n "$(git -C "$PAGES" rev-list origin/gh-pages..HEAD 2>/dev/null)" ]]; then
        echo "$PAGES has gh-pages commits that aren't on origin; push or drop them first." >&2
        exit 1
    fi
    git -C "$PAGES" reset --quiet --hard origin/gh-pages
    git -C "$PAGES" clean -fdq
else
    git worktree add --quiet -B gh-pages "$PAGES" origin/gh-pages
fi

bash scripts/publish-site.sh "$VERSION" "$PAGES"
# Serve files as-is; skip Jekyll processing on Pages.
touch "$PAGES/.nojekyll"

git -C "$PAGES" add -A
if git -C "$PAGES" diff --cached --quiet; then
    echo "Nothing changed on gh-pages."
else
    git -C "$PAGES" commit --quiet -m "Publish $VERSION ($(git rev-parse --short HEAD))"
    git -C "$PAGES" push --quiet origin gh-pages
fi

if [[ "$VERSION" != latest ]]; then
    git rev-parse --quiet --verify "refs/tags/$VERSION" >/dev/null || git tag -a "$VERSION" -m "$TITLE $VERSION"
    git push --quiet origin "refs/tags/$VERSION"
fi

echo "Released $VERSION. Pages updates in about a minute:"
if [[ "$VERSION" == latest ]]; then
    echo "  $PAGES_URL/"
else
    echo "  $PAGES_URL/$VERSION/"
fi
