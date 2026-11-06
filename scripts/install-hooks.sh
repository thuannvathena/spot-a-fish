#!/usr/bin/env bash
# Installs a git pre-commit hook that runs the public-repo check on what is staged
# (links to private tools, tokens, personal paths, e-mail addresses).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
hook="$(git rev-parse --git-path hooks/pre-commit)"
cat > "$hook" <<'HOOK'
#!/usr/bin/env bash
node scripts/check-public.mjs --staged || { echo "Commit stopped by scripts/check-public.mjs (this repo is public)." >&2; exit 1; }
HOOK
chmod +x "$hook"
echo "Installed $hook"
