#!/usr/bin/env bash
# Builds the site for one version and merges it into the archive of published versions
# (a checkout of the gh-pages branch). Called by scripts/release.sh. Older versions in the archive are left untouched.
#
# Usage: scripts/publish-site.sh <latest|vX.Y.Z> <archive-dir>
#   latest  -> archive root (/, /demo/, /docs/)
#   vX.Y.Z  -> archive/vX.Y.Z/ (/vX.Y.Z/demo/, /vX.Y.Z/docs/)
set -euo pipefail

VERSION="$1"
ARCHIVE="$2"
REPO_BASE="$(node -p "require('./prototype.config.json').basePath")"

if [[ "$VERSION" == latest ]]; then
    DIR=""
elif [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    DIR="$VERSION/"
else
    echo "Version must be 'latest' or a tag like v1.2.3, got '$VERSION'" >&2
    exit 1
fi

mkdir -p "$ARCHIVE"
list_versions() {
    (cd "$ARCHIVE" && find . -maxdepth 1 -type d -name 'v*' | sed 's#^\./##' | sort -rV)
}

# Versions known after this publish, newest first (feeds the docs version menu).
all_versions=$( { list_versions; if [[ -n "$DIR" ]]; then echo "$VERSION"; fi; } | sort -ruV)

export SITE_VERSION="$VERSION"
export DOCS_BASE="$REPO_BASE/${DIR}docs/"
export DOCS_VERSIONS="$(echo "$all_versions" | paste -sd, -)"
bash scripts/build-site.sh

if [[ -z "$DIR" ]]; then
    rm -rf "$ARCHIVE/demo" "$ARCHIVE/docs" "$ARCHIVE/index.html"
    cp -R _site/. "$ARCHIVE/"
else
    rm -rf "$ARCHIVE/$DIR"
    mkdir -p "$ARCHIVE/$DIR"
    cp -R _site/. "$ARCHIVE/$DIR"
fi

# Index read by the landing page's version list.
{
    printf '{"versions":['
    list_versions | sed 's/.*/"&"/' | paste -sd, - | tr -d '\n'
    printf ']}\n'
} > "$ARCHIVE/versions.json"

echo "Published $VERSION -> $ARCHIVE/${DIR}"
cat "$ARCHIVE/versions.json"
