#!/usr/bin/env node
// ============================================================
// find-domain.mjs — bulk RDAP-based domain availability check
// ============================================================
// Why RDAP, not WHOIS:
//   WHOIS is line-oriented free text, parsing is fragile, lots of
//   registries impose strict per-IP rate limits. RDAP is the modern
//   replacement: JSON over HTTPS, standardized response codes
//   (404 = not registered, 200 = registered), public for all major TLDs.
//
// Usage:
//   node scripts/find-domain.mjs name1 name2 name3
//   node scripts/find-domain.mjs --list scripts/name-candidates.txt
//   node scripts/find-domain.mjs --generate 200
//   node scripts/find-domain.mjs --generate 200 --tlds ru,app,io,pro
//   node scripts/find-domain.mjs --list ... --report results.md
//
// Examples:
//   # Check our curated brainstorm list across 4 TLDs:
//   node scripts/find-domain.mjs --list scripts/name-candidates.txt
//
//   # Generate 200 made-up names and check .ru + .app:
//   node scripts/find-domain.mjs --generate 200 --tlds ru,app
//
//   # One-off check:
//   node scripts/find-domain.mjs cockpit logist trakkr
//
// Output: markdown table sorted by free-TLD count.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// ---- Config ----------------------------------------------------------------
const DEFAULT_TLDS = ['ru', 'app', 'io', 'pro'];
const RATE_LIMIT_MS = 350;           // ~3 req/sec to stay polite
const TIMEOUT_MS = 12_000;
const NAME_RE = /^[a-z][a-z0-9-]{1,30}$/;

// Registry-specific RDAP endpoints. rdap.org acts as a redirector for most
// TLDs but several large registries publish their own endpoint we hit
// directly to avoid an extra hop.
const RDAP_OVERRIDES = {
    ru: 'https://rdap.tcinet.ru/domain/',
    su: 'https://rdap.tcinet.ru/domain/',
};
function rdapUrl(name, tld) {
    const base = RDAP_OVERRIDES[tld] || 'https://rdap.org/domain/';
    return `${base}${encodeURIComponent(name)}.${tld}`;
}

// ---- Status check ----------------------------------------------------------
async function checkDomain(name, tld) {
    const url = rdapUrl(name, tld);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            redirect: 'follow',
            headers: { Accept: 'application/rdap+json,application/json' },
        });
        if (res.status === 404) return 'available';
        if (res.status === 200) return 'taken';
        if (res.status === 429) return 'rate-limited';
        if (res.status >= 500) return `server-${res.status}`;
        return `status-${res.status}`;
    } catch (err) {
        if (err.name === 'AbortError') return 'timeout';
        const msg = (err && err.message) || 'unknown';
        return `error:${msg.slice(0, 40)}`;
    } finally {
        clearTimeout(timer);
    }
}

// ---- Random-name generator -------------------------------------------------
// CV-CV pattern shaped to look like real startup names (Stripe, Notion, etc.)
const ONSETS = [
    'tr', 'br', 'dr', 'kr', 'gl', 'pl', 'sl', 'fl', 'st', 'sk',
    'sp', 'pr', 'cl', 'gr', 'vr', 'l', 'm', 'n', 'r', 't',
    'd', 'k', 'g', 'v', 's', 'p', 'b', 'f', 'ru', 'ka',
    'ma', 'ta', 'va', 'na', 'lo', 'ro', 'so', 'mo', 'po',
];
const NUCLEI = [
    'a', 'o', 'e', 'u', 'i', 'ai', 'oa', 'ei', 'ou', 'ya',
    'an', 'on', 'en', 'in', 'un', 'ar', 'or', 'er', 'ir', 'ur',
];
const CODAS = [
    '', '', '', 'k', 'l', 'r', 's', 'n', 'm', 't', 'd',
    'kt', 'st', 'rk', 'lt', 'nt', 'rn', 'rd', 'x', 'q',
];

function generateOne() {
    const o = ONSETS[Math.floor(Math.random() * ONSETS.length)];
    const n = NUCLEI[Math.floor(Math.random() * NUCLEI.length)];
    const c = CODAS[Math.floor(Math.random() * CODAS.length)];
    return (o + n + c).toLowerCase();
}

function generateNames(count) {
    const set = new Set();
    let safety = count * 20;
    while (set.size < count && safety-- > 0) {
        const raw = generateOne();
        if (raw.length < 3 || raw.length > 7) continue;
        if (!NAME_RE.test(raw)) continue;
        set.add(raw);
    }
    return [...set];
}

// ---- Args ------------------------------------------------------------------
function parseArgs(argv) {
    const out = {
        names: [],
        tlds: [...DEFAULT_TLDS],
        generate: 0,
        listFile: null,
        reportFile: null,
        verbose: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--tlds') {
            out.tlds = argv[++i]
                .split(',')
                .map((s) => s.trim().toLowerCase().replace(/^\./, ''))
                .filter(Boolean);
        } else if (a === '--generate') {
            out.generate = Number.parseInt(argv[++i] ?? '0', 10) || 0;
        } else if (a === '--list') {
            out.listFile = argv[++i];
        } else if (a === '--report') {
            out.reportFile = argv[++i];
        } else if (a === '--verbose' || a === '-v') {
            out.verbose = true;
        } else if (a === '--help' || a === '-h') {
            console.log(
                `Usage:
  node scripts/find-domain.mjs <name1> <name2> ...
  node scripts/find-domain.mjs --list <file>
  node scripts/find-domain.mjs --generate <N>
  node scripts/find-domain.mjs --tlds ru,app,io,pro,tech,cloud,market
  node scripts/find-domain.mjs --report <output.md>

RDAP returns 404 for unregistered → reported as 'free'.
Rate limit: ${RATE_LIMIT_MS}ms between queries (~${(1000 / RATE_LIMIT_MS).toFixed(1)} req/s).
`,
            );
            process.exit(0);
        } else {
            out.names.push(a.toLowerCase().trim());
        }
    }
    return out;
}

// ---- Main ------------------------------------------------------------------
async function main() {
    const args = parseArgs(process.argv.slice(2));

    let candidates = [...args.names];
    if (args.listFile) {
        const text = fs.readFileSync(args.listFile, 'utf8');
        candidates.push(
            ...text
                .split('\n')
                .map((s) => s.replace(/#.*$/, '').trim().toLowerCase())
                .filter(Boolean),
        );
    }
    if (args.generate > 0) {
        candidates.push(...generateNames(args.generate));
    }

    candidates = [...new Set(candidates)].filter((n) => NAME_RE.test(n));

    if (candidates.length === 0) {
        console.error('No valid candidates. Pass names as args, --list <file>, or --generate <N>.');
        process.exit(1);
    }

    const total = candidates.length * args.tlds.length;
    console.error(
        `Checking ${candidates.length} candidates × ${args.tlds.length} TLDs = ${total} queries`,
    );
    console.error(
        `Rate limit: ${RATE_LIMIT_MS}ms (~${Math.ceil((total * RATE_LIMIT_MS) / 1000)}s ≈ ${Math.ceil((total * RATE_LIMIT_MS) / 1000 / 60)} min)`,
    );
    console.error('');

    const startedAt = Date.now();
    const results = [];
    let done = 0;
    for (const name of candidates) {
        const row = { name };
        for (const tld of args.tlds) {
            const status = await checkDomain(name, tld);
            row[tld] = status;
            done++;
            if (args.verbose || done % 25 === 0) {
                const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
                const pct = ((done / total) * 100).toFixed(0);
                console.error(`progress: ${done}/${total} (${pct}%, ${elapsed}s) — ${name}.${tld} → ${status}`);
            }
            await sleep(RATE_LIMIT_MS);
        }
        results.push(row);
    }

    // ---- Output ----
    const ranked = results
        .map((r) => {
            const free = args.tlds.filter((tld) => r[tld] === 'available').length;
            return { ...r, _free: free };
        })
        .sort((a, b) => b._free - a._free || a.name.localeCompare(b.name));

    const lines = [];
    const push = (s = '') => lines.push(s);

    push(`# Domain availability report`);
    push('');
    push(`- Generated: ${new Date().toISOString()}`);
    push(`- Candidates: ${candidates.length}`);
    push(`- TLDs: \`${args.tlds.join(', ')}\``);
    push('');
    push(`| candidate | ${args.tlds.join(' | ')} | free |`);
    push(`|---|${args.tlds.map(() => '---').join('|')}|---|`);
    for (const r of ranked) {
        const cells = args.tlds.map((tld) => {
            const s = r[tld];
            if (s === 'available') return '✅ free';
            if (s === 'taken') return '❌ taken';
            if (s === 'rate-limited') return '⏳ retry';
            if (s === 'timeout') return '⏱ timeout';
            return `⚠ ${s}`;
        });
        push(`| **${r.name}** | ${cells.join(' | ')} | ${r._free}/${args.tlds.length} |`);
    }

    const allFree = ranked.filter((r) => r._free === args.tlds.length);
    const partialFree = ranked.filter((r) => r._free > 0 && r._free < args.tlds.length);
    const noneFree = ranked.filter((r) => r._free === 0);

    push('');
    push(`## Summary`);
    push('');
    push(`- **${allFree.length}** candidate(s) free in ALL ${args.tlds.length} TLDs ← strongest picks`);
    push(`- **${partialFree.length}** candidate(s) free in at least one TLD`);
    push(`- **${noneFree.length}** candidate(s) fully taken`);

    if (allFree.length > 0) {
        push('');
        push(`### Top candidates (free everywhere)`);
        push('');
        for (const r of allFree.slice(0, 30)) push(`- ${r.name}`);
    }

    const md = lines.join('\n');
    if (args.reportFile) {
        fs.mkdirSync(path.dirname(args.reportFile) || '.', { recursive: true });
        fs.writeFileSync(args.reportFile, md, 'utf8');
        console.error(`\nWrote: ${args.reportFile}`);
    } else {
        console.log('');
        console.log(md);
    }
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
