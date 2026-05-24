// ============================================================
// DPA loader — читает docs/legal/dpa/*.md, парсит YAML frontmatter,
// вычисляет SHA-256(content), кэширует в памяти.
//
// Зачем: 152-ФЗ ст. 9 — текст согласия должен показываться пользователю
// до accept. Текст живёт в репо (рядом с кодом, version-controlled),
// чтобы Jurist мог bumpup-ить через PR.
//
// Формат файла:
//   ---
//   provider_id: diadoc
//   provider_label: Контур.Диадок
//   category: edi
//   owner: client | vendor
//   version: 1.0
//   effective_from: 2026-05-23
//   requires_acceptance: true | false
//   ---
//   # Markdown body...
// ============================================================
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Файлы DPA относительно корня репо. В dev/test смотрим docs/legal/dpa/.
// В докер-image эти файлы должны попасть через builder → runner copy
// (см. Dockerfile patch ниже).
const DPA_DIR = process.env.DPA_DIR
    ?? path.resolve(__dirname, '../../../../../docs/legal/dpa');

export type DpaOwner = 'client' | 'vendor';

export interface DpaFrontmatter {
    providerId: string;
    providerLabel: string;
    category: string;
    owner: DpaOwner;
    version: string;
    effectiveFrom: string; // ISO date
    requiresAcceptance: boolean;
}

export interface DpaDocument {
    frontmatter: DpaFrontmatter;
    /** Полное markdown-содержимое (без frontmatter-блока). */
    content: string;
    /** SHA-256 hex от **всего файла** (включая frontmatter + body). */
    contentHash: string;
}

/**
 * Lightweight YAML parser — нам нужны только flat-key value пары.
 * Не используем yaml-пакет, чтобы не добавлять deps.
 */
function parseFrontmatter(yaml: string): DpaFrontmatter {
    const fields: Record<string, string | boolean> = {};
    for (const rawLine of yaml.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const colon = line.indexOf(':');
        if (colon <= 0) continue;
        const key = line.slice(0, colon).trim();
        let value = line.slice(colon + 1).trim();
        // Strip quotes
        if ((value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (value === 'true') fields[key] = true;
        else if (value === 'false') fields[key] = false;
        else fields[key] = value;
    }

    const provider_id = String(fields.provider_id ?? '');
    const provider_label = String(fields.provider_label ?? '');
    const category = String(fields.category ?? '');
    const ownerRaw = String(fields.owner ?? 'client');
    const owner: DpaOwner = ownerRaw === 'vendor' ? 'vendor' : 'client';
    const version = String(fields.version ?? '');
    const effective_from = String(fields.effective_from ?? '');
    const requires_acceptance = fields.requires_acceptance === false ? false : true;

    if (!provider_id) throw new Error('DPA frontmatter: provider_id missing');
    if (!version) throw new Error(`DPA frontmatter (${provider_id}): version missing`);
    if (!effective_from) throw new Error(`DPA frontmatter (${provider_id}): effective_from missing`);

    return {
        providerId: provider_id,
        providerLabel: provider_label || provider_id,
        category,
        owner,
        version,
        effectiveFrom: effective_from,
        requiresAcceptance: requires_acceptance,
    };
}

function parseDpaFile(rawContent: string): { frontmatter: DpaFrontmatter; content: string; contentHash: string } {
    // Frontmatter — между двумя строками «---» в начале файла.
    const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
        throw new Error('DPA file: frontmatter block (---) missing');
    }
    const [, yaml, body] = match;
    const frontmatter = parseFrontmatter(yaml ?? '');
    const contentHash = crypto.createHash('sha256').update(rawContent, 'utf8').digest('hex');
    return {
        frontmatter,
        content: body ?? '',
        contentHash,
    };
}

// ============================================================
// In-memory cache. Загружается лениво при первом обращении и кэшируется
// до перезапуска api. Если Jurist обновил .md — нужен рестарт контейнера
// (или явный invalidate). Для пилота этого достаточно.
// ============================================================
let cache: Map<string, DpaDocument> | null = null;

async function loadAllDpaFromDisk(): Promise<Map<string, DpaDocument>> {
    const files = await fs.readdir(DPA_DIR);
    const result = new Map<string, DpaDocument>();
    for (const file of files) {
        if (!file.endsWith('.md') || file === 'README.md') continue;
        const fullPath = path.join(DPA_DIR, file);
        const raw = await fs.readFile(fullPath, 'utf8');
        try {
            const parsed = parseDpaFile(raw);
            result.set(parsed.frontmatter.providerId, parsed);
        } catch (err) {
            // Fail-fast: некорректный DPA — критичная юр-ошибка. Лучше
            // упасть на старте, чем показать клиенту пустой текст и
            // зафиксировать «согласие» под пустоту.
            throw new Error(`DPA loader: failed to parse ${file} — ${(err as Error).message}`);
        }
    }
    return result;
}

/** Очистить кэш — для тестов и hot-reload. */
export function resetDpaCache(): void {
    cache = null;
}

/** Получить DPA для одного провайдера или null если файла нет. */
export async function getDpa(providerId: string): Promise<DpaDocument | null> {
    if (!cache) cache = await loadAllDpaFromDisk();
    return cache.get(providerId) ?? null;
}

/** Список всех известных provider_id (для health/admin views). */
export async function listDpaProviderIds(): Promise<string[]> {
    if (!cache) cache = await loadAllDpaFromDisk();
    return Array.from(cache.keys()).sort();
}

// Export pure helper для тестов и CI-check скрипта.
export { parseDpaFile };
