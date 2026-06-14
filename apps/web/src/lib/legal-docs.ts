// P1-3 — загрузка markdown юр-пакетов (ЭТрН C1-C10, DPA D1-D7) для публикации
// через web (/legal/etrn/*, /legal/dpa/*). Single source of truth: docs/legal/<folder>.
// Серверные утилиты (fs) — используются в Server Components на этапе build.
import fs from 'node:fs';
import path from 'node:path';

function folderCandidates(folder: string): string[] {
    return [
        path.resolve(process.cwd(), `docs/legal/${folder}`),
        path.resolve(process.cwd(), `../../docs/legal/${folder}`),
    ];
}

function resolveFolder(folder: string): string {
    for (const p of folderCandidates(folder)) {
        try {
            if (fs.statSync(p).isDirectory()) return p;
        } catch {
            // try next
        }
    }
    throw new Error(`legal folder not found: docs/legal/${folder}`);
}

export type LegalDocMeta = { slug: string; title: string };

/** Список документов папки (без README) — slug + заголовок (первый H1). */
export function listLegalDocs(folder: string): LegalDocMeta[] {
    const dir = resolveFolder(folder);
    return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
        .sort()
        .map((f) => {
            const slug = f.replace(/\.md$/, '');
            const src = fs.readFileSync(path.join(dir, f), 'utf-8');
            const h1 = src.match(/^#\s+(.+)$/m);
            return { slug, title: h1 ? h1[1]!.trim() : slug };
        });
}

/** Сырой markdown документа (или README при slug='readme'/пусто). */
export function loadLegalDoc(folder: string, slug: string): string {
    const dir = resolveFolder(folder);
    const file = path.join(dir, `${slug}.md`);
    // Защита от path traversal: slug — только из enumerated списка.
    if (!file.startsWith(dir)) throw new Error('invalid slug');
    return fs.readFileSync(file, 'utf-8');
}

/** Список slug'ов для generateStaticParams (включая readme как индекс не нужен). */
export function listLegalSlugs(folder: string): string[] {
    const dir = resolveFolder(folder);
    return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
        .map((f) => f.replace(/\.md$/, ''));
}

/**
 * Переписывает относительные .md-ссылки в роуты:
 *   [текст](01-foo.md)        → [текст](/legal/<folder>/01-foo)
 *   [текст](../privacy-policy.md) → /legal/privacy
 *   [текст](../terms-of-service.md) → /legal/terms
 * Внешние (http) и якоря (#) не трогаем.
 */
export function rewriteLegalLinks(folder: string, source: string): string {
    return source
        // Опубликованные кросс-документы → их роуты.
        .replace(/\]\(\.\.\/privacy-policy\.md\)/g, '](/legal/privacy)')
        .replace(/\]\(\.\.\/terms-of-service\.md\)/g, '](/legal/terms)')
        .replace(/\]\(\.\.\/personal-data-consent\.md\)/g, '](/legal/personal-data)')
        // Внутрипапочные документы → роуты пакета.
        .replace(/\]\((?!https?:|\/|#|\.\.\/)([^)]+?)\.md\)/g, `](/legal/${folder}/$1)`)
        // Любые оставшиеся .md-ссылки (неопубликованные internal-доки: invoice-spec,
        // consent-gosklyuch и т.п.) — снимаем ссылку, оставляем текст (не 404).
        .replace(/\[([^\]]+)\]\([^)]*\.md\)/g, '$1');
}
