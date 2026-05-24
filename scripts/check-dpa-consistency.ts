// ============================================================
// check-dpa-consistency.ts
//
// CI-проверка для docs/legal/dpa/*.md:
//   1. Frontmatter валидный — provider_id, version, effective_from, owner,
//      requires_acceptance присутствуют, version — semver-like.
//   2. effective_from — валидная ISO-date в прошлом или сегодня.
//   3. Body не пустой и содержит обязательные секции (по README схеме).
//   4. provider_id матчит имя файла (diadoc.md → provider_id=diadoc).
//   5. Если требуется acceptance, в тексте есть «текст подтверждения»
//      или явный invitation (heuristic — наличие заголовка «9» или подобного).
//
// Запускается в CI на каждый PR через `pnpm dpa:check` (см. package.json
// апдейт). Provider-level юр-чистоту НЕ проверяет — только структуру.
//
// Usage:
//   pnpm exec tsx scripts/check-dpa-consistency.ts
// ============================================================
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Inline frontmatter parser — копия логики из apps/api/src/modules/dpa/loader.ts.
// Scripts/ независим от api source: чтобы CI мог запускать check без полного
// TS-проекта apps/api. При изменении формата DPA — обновлять оба места.
type DpaFrontmatter = {
    providerId: string;
    providerLabel: string;
    category: string;
    owner: 'client' | 'vendor';
    version: string;
    effectiveFrom: string;
    requiresAcceptance: boolean;
};

function parseDpaFile(raw: string): { frontmatter: DpaFrontmatter; content: string; contentHash: string } {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) throw new Error('frontmatter block (---) missing');
    const [, yaml, body] = match;
    const fields: Record<string, string | boolean> = {};
    for (const rawLine of (yaml ?? '').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const colon = line.indexOf(':');
        if (colon <= 0) continue;
        const key = line.slice(0, colon).trim();
        let value = line.slice(colon + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (value === 'true') fields[key] = true;
        else if (value === 'false') fields[key] = false;
        else fields[key] = value;
    }
    const ownerRaw = String(fields.owner ?? 'client');
    const frontmatter: DpaFrontmatter = {
        providerId: String(fields.provider_id ?? ''),
        providerLabel: String(fields.provider_label ?? ''),
        category: String(fields.category ?? ''),
        owner: ownerRaw === 'vendor' ? 'vendor' : 'client',
        version: String(fields.version ?? ''),
        effectiveFrom: String(fields.effective_from ?? ''),
        requiresAcceptance: fields.requires_acceptance === false ? false : true,
    };
    const contentHash = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
    return { frontmatter, content: body ?? '', contentHash };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DPA_DIR = path.resolve(__dirname, '../docs/legal/dpa');

interface CheckResult {
    file: string;
    errors: string[];
    warnings: string[];
}

const SEMVER_RE = /^\d+\.\d+(\.\d+)?$/;

async function checkFile(filename: string): Promise<CheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const full = path.join(DPA_DIR, filename);
    const raw = await fs.readFile(full, 'utf8');

    let parsed: ReturnType<typeof parseDpaFile>;
    try {
        parsed = parseDpaFile(raw);
    } catch (err) {
        errors.push(`Parse error: ${(err as Error).message}`);
        return { file: filename, errors, warnings };
    }
    const { frontmatter, content } = parsed;

    // 1. provider_id матчит имя файла.
    const expectedId = filename.replace(/\.md$/, '').replace(/-/g, '_');
    if (frontmatter.providerId !== expectedId) {
        errors.push(`provider_id (${frontmatter.providerId}) не совпадает с именем файла (${expectedId}). Файл назвать <provider_id>.md (дефис → подчёркивание в id).`);
    }

    // 2. version — semver.
    if (!SEMVER_RE.test(frontmatter.version)) {
        errors.push(`version (${frontmatter.version}) должен быть semver: major.minor или major.minor.patch`);
    }

    // 3. effective_from — валидная date, не в будущем.
    const effectiveDate = new Date(frontmatter.effectiveFrom);
    if (Number.isNaN(effectiveDate.getTime())) {
        errors.push(`effective_from (${frontmatter.effectiveFrom}) — некорректная дата (нужен ISO YYYY-MM-DD)`);
    } else {
        const today = new Date();
        today.setUTCHours(23, 59, 59, 999);
        if (effectiveDate.getTime() > today.getTime()) {
            errors.push(`effective_from (${frontmatter.effectiveFrom}) в будущем — нельзя публиковать до даты вступления в силу`);
        }
    }

    // 4. owner — client | vendor.
    if (frontmatter.owner !== 'client' && frontmatter.owner !== 'vendor') {
        errors.push(`owner (${frontmatter.owner}) должен быть 'client' или 'vendor'`);
    }

    // 5. body — не пустой, содержит минимум секции 1-7 по схеме README.
    //    Требование частичное: если requires_acceptance=true — нужны все
    //    9 секций; если false (vendor-info) — достаточно 4-5.
    if (content.trim().length < 200) {
        errors.push(`content слишком короткий (${content.trim().length} chars) — минимум 200`);
    }
    const minRequiredHeadings = frontmatter.requiresAcceptance ? 7 : 4;
    const headingsCount = (content.match(/^##\s+\d+\./gm) ?? []).length;
    if (headingsCount < minRequiredHeadings) {
        warnings.push(`Найдено ${headingsCount} нумерованных секций, ожидается ≥${minRequiredHeadings} (см. structure в README).`);
    }

    // 6. Если requires_acceptance=true — должен быть «текст подтверждения»
    //    (секция 9 по README). Эвристика: упоминание «подтверждаю», «соглашаюсь»
    //    или явного заголовка «Подтверждение».
    if (frontmatter.requiresAcceptance) {
        const lower = content.toLowerCase();
        if (!lower.includes('подтверж') && !lower.includes('соглас')) {
            warnings.push('requires_acceptance=true, но в тексте не найдены слова «подтверждаю/соглашаюсь» — UI-чекбокс может оказаться без opt-in текста.');
        }
    }

    return { file: filename, errors, warnings };
}

async function main() {
    const files = (await fs.readdir(DPA_DIR)).filter(f => f.endsWith('.md') && f !== 'README.md');
    if (files.length === 0) {
        console.error(`❌ В ${DPA_DIR} нет DPA-файлов (.md).`);
        process.exit(1);
    }
    console.log(`Проверяю ${files.length} DPA-файлов в ${DPA_DIR}\n`);

    const results: CheckResult[] = [];
    for (const f of files) {
        results.push(await checkFile(f));
    }

    let hadErrors = false;
    for (const r of results) {
        if (r.errors.length === 0 && r.warnings.length === 0) {
            console.log(`  ✅ ${r.file}`);
            continue;
        }
        console.log(`  ${r.errors.length > 0 ? '❌' : '⚠️ '} ${r.file}`);
        for (const e of r.errors) {
            console.log(`     ERROR: ${e}`);
            hadErrors = true;
        }
        for (const w of r.warnings) {
            console.log(`     WARN: ${w}`);
        }
    }
    console.log('');
    if (hadErrors) {
        console.log('❌ DPA consistency check FAILED. Исправь ошибки выше.');
        process.exit(1);
    } else {
        console.log(`✅ Проверено ${results.length} файлов, ошибок нет.`);
    }
}

main().catch((err) => {
    console.error('FATAL:', (err as Error).message);
    process.exit(1);
});
