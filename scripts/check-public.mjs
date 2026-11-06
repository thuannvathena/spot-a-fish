#!/usr/bin/env node
// Guard for the PUBLIC repo: nothing that points at private tools, accounts or machines may be committed or published.
//
//   node scripts/check-public.mjs            files that would be committed (tracked + new, not ignored)
//   node scripts/check-public.mjs --staged   only what is staged (used by the git pre-commit hook)
//   node scripts/check-public.mjs --tracked  only what is already tracked at HEAD (used before a release)
//   add --strict to also fail on links to hosts that are not on the allow list (default: only listed)
//
// ERROR (blocks): links to chat / design / doc / drive / task tools, secrets and tokens, e-mail addresses, absolute paths of a person's machine.
// WARN: any other external link that is not on the allow list (check it is meant to be public).
// Add a reviewed exception on the line itself with  public-ok  (for example in a comment).
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const args = new Set(process.argv.slice(2));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
const files = args.has('--staged') ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR')
    : args.has('--tracked') ? git('ls-files')
    : [...new Set([...git('ls-files'), ...git('ls-files', '-o', '--exclude-standard')])];

const TEXT = new Set(['.md', '.mdx', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.sh', '.yml', '.yaml', '.txt', '.toml', '.svg', '.vue']);
const SKIP = [/^node_modules\//, /(^|\/)package-lock\.json$/, /^dist\//, /^_site\//, /^\.pages\//, /^docs\/\.vitepress\/(dist|cache)\//, /^public\/models\//, /^\.claude\//, /^scripts\/check-public\.mjs$/];
// hosts that may appear: this project's own repo / site, local development, and the libraries the code is built on
const ALLOW_HOSTS = [/(^|\.)github\.com$/, /(^|\.)github\.io$/, /^localhost$/, /^127\.0\.0\.1$/, /(^|\.)phaser\.io$/, /(^|\.)threejs\.org$/, /(^|\.)vitepress\.dev$/, /(^|\.)vitejs\.dev$/, /(^|\.)npmjs\.(com|org)$/, /(^|\.)w3\.org$/, /(^|\.)example\.(com|org)$/];
const BLOCK_HOSTS = /(chatgpt\.com|chat\.openai\.com|openai\.com|claude\.ai|claude\.com|anthropic\.com|docs\.google\.com|drive\.google\.com|sheets\.google\.com|figma\.com|notion\.(so|site)|slack\.com|trello\.com|atlassian\.net|jira\.com|miro\.com|dropbox\.com|1drv\.ms|onedrive\.live\.com|sharepoint\.com|airtable\.com|linear\.app|clickup\.com|asana\.com|discord(app)?\.com|t\.me|zalo\.me|facebook\.com|lucid\.app|canva\.com|loom\.com|bit\.ly|tinyurl\.com)/i;
const RULES = [
    ['token', /\b(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})\b/],
    ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['secret assignment', /\b(api[_-]?key|secret|passwd|password|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i],
    ['e-mail address', /\b[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
    ['machine path', /(\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\/|[A-Z]:\\Users\\[A-Za-z0-9._-]+\\)/]
];
const URL_RE = /\b(?:https?:)?\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,}|localhost|127\.0\.0\.1)(?::\d+)?[^\s)'"`<>\]]*/g;

let errors = 0, warns = 0;
const out = (kind, f, n, what, line) => { console.log(`${kind} ${f}:${n}  ${what}\n      ${line.trim().slice(0, 160)}`); };
for (const f of files) {
    if (SKIP.some((r) => r.test(f)) || !TEXT.has(extname(f).toLowerCase())) continue;
    let text; try { if (statSync(f).size > 600_000) continue; text = readFileSync(f, 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, i) => {
        if (/public-ok/.test(line)) return;
        for (const [name, re] of RULES) if (re.test(line)) { errors++; out('ERROR', f, i + 1, name, line); }
        for (const m of line.matchAll(URL_RE)) {
            const host = m[1].toLowerCase();
            if (BLOCK_HOSTS.test(host)) { errors++; out('ERROR', f, i + 1, `link to a private tool or service (${host})`, line); }
            else if (!ALLOW_HOSTS.some((r) => r.test(host))) { warns++; out('WARN ', f, i + 1, `external link (${host}) is not on the allow list`, line); }
        }
    });
}
console.log(`\ncheck-public: ${files.length} files looked at, ${errors} error(s), ${warns} warning(s).`);
if (errors || (args.has('--strict') && warns)) {
    console.log('Fix these (remove the link, or describe it in words) before committing or releasing. A reviewed exception can carry "public-ok" on the same line.');
    process.exit(1);
}
