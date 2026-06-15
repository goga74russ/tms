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

// ============================================================
// Санитизация markdown перед публикацией (legal-pages-cleanup-spec §1-3).
// Публичные юр-страницы рендерят markdown «как есть» — без очистки на них
// протекают служебные секции: YAML-frontmatter, внутренние блоки
// «(не печатать)» и сырые плейсхолдеры {{...}} типовых форм.
// ============================================================

/** T-LEGAL-1: срезать YAML-frontmatter (блок между первыми `---` в начале файла). */
export function stripFrontmatter(md: string): string {
    if (!md.startsWith('---')) return md;
    const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    return m ? md.slice(m[0].length) : md;
}

/**
 * T-LEGAL-2: срезать внутренний блок «Комментарии для применения (не печатать)»
 * и всё после него до конца файла. Внутренние блоки Jurist'а всегда в конце
 * документа отдельной секцией (§4.4), поэтому slice по первому маркеру безопасен.
 */
export function stripInternal(md: string): string {
    const lines = md.split(/\r?\n/);
    const idx = lines.findIndex((l) =>
        /^#{2,}\s+.*(Комментарии для применения|не печатать)/i.test(l)
        || /^<!--\s*internal\s*-->/i.test(l),
    );
    if (idx === -1) return md;
    return lines.slice(0, idx).join('\n').trimEnd() + '\n';
}

// T-LEGAL-3 (variant A): человекочитаемые метки вместо сырых {{ПЛЕЙСХОЛДЕРОВ}}.
// Реквизиты вендора (TMS) известны и подставляются реальными значениями (§3).
const TMS_VENDOR_VALUES: Record<string, string> = {
    TMS_VENDOR_NAME: 'ИП Бардин Георгий Дмитриевич',
    TMS_VENDOR_INN: '746003023587',
    TMS_VENDOR_OGRN: '326745600039073',
};
const PLACEHOLDER_LABELS: Record<string, string> = {
    ORG_NAME: 'Наименование организации',
    ORG_SHORT_NAME: 'Краткое наименование организации',
    ORG_INN: 'ИНН организации',
    ORG_KPP: 'КПП организации',
    ORG_OGRN: 'ОГРН/ОГРНИП',
    ORG_ADDRESS: 'Юридический адрес',
    CEO_NAME: 'ФИО руководителя',
    CEO_POSITION: 'Должность руководителя',
    CEO_BASIS: 'Основание полномочий: Устав/доверенность',
    DOC_NUMBER: 'Номер документа',
    DOC_DATE: 'Дата',
    EFFECTIVE_DATE: 'Дата вступления в силу',
    EDO_OPERATOR: 'Оператор ЭДО',
    COUNTERPARTY_NAME: 'Наименование контрагента',
    COUNTERPARTY_INN: 'ИНН контрагента',
    CONTRACT_NUMBER: 'Номер договора',
    CONTRACT_DATE: 'Дата договора',
    EMPLOYEE_NAME: 'ФИО сотрудника',
    EMPLOYEE_POSITION: 'Должность сотрудника',
    EMPLOYEE_INN: 'ИНН сотрудника',
    EMPLOYEE_SNILS: 'СНИЛС сотрудника',
    RESPONSIBLE_NAME: 'ФИО ответственного за ЭПД',
    RESPONSIBLE_POSITION: 'Должность ответственного',
    RESPONSIBLE_ORDER: 'Реквизиты приказа о назначении ответственного',
    NAME: 'ФИО',
};

/**
 * Заменяет `{{TOKEN}}` на человекочитаемую метку `[Метка]` (или реальное значение
 * для реквизитов вендора). Любой неучтённый токен → `[token]`-fallback, чтобы на
 * публичной странице гарантированно не осталось ни одной `{{...}}`-конструкции.
 */
export function humanizePlaceholders(md: string): string {
    return md.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_match, raw: string) => {
        const key = raw.toUpperCase();
        if (key in TMS_VENDOR_VALUES) return TMS_VENDOR_VALUES[key]!;
        if (key in PLACEHOLDER_LABELS) return `[${PLACEHOLDER_LABELS[key]}]`;
        return `[${raw.toLowerCase().replace(/_/g, ' ')}]`;
    });
}

/** Полная очистка публикуемого markdown: frontmatter + internal-блок + плейсхолдеры. */
export function sanitizeLegalMarkdown(md: string): string {
    return humanizePlaceholders(stripInternal(stripFrontmatter(md)));
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

/**
 * Очищенный для публикации markdown документа. Срезаны frontmatter и внутренние
 * «(не печатать)»-блоки, плейсхолдеры заменены на человекочитаемые метки
 * (legal-pages-cleanup-spec T-LEGAL-1/2/3). README сюда не отдаём — index-страницы
 * строят каталог программно (T-LEGAL-3b).
 */
export function loadLegalDoc(folder: string, slug: string): string {
    const dir = resolveFolder(folder);
    const file = path.join(dir, `${slug}.md`);
    // Защита от path traversal: slug — только из enumerated списка.
    if (!file.startsWith(dir)) throw new Error('invalid slug');
    return sanitizeLegalMarkdown(fs.readFileSync(file, 'utf-8'));
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
