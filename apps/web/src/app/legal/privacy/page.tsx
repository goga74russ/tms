// Server Component — читает privacy-policy.md на этапе static generation,
// извлекает TOC из h2-заголовков, рендерит через клиентский MarkdownView.
// Single source of truth: docs/legal/privacy-policy.md (под Jurist'ом).
import fs from 'node:fs';
import path from 'node:path';
import { LegalPageShell } from '../components/LegalPageShell';
import { MarkdownView } from '@/components/MarkdownView';
import { extractToc } from '@/components/markdown-parser';

export const metadata = {
    title: 'Политика конфиденциальности — ТрансПульт',
    description: 'Политика обработки персональных данных в соответствии с 152-ФЗ.',
};

// docs/ копируется в build context (см. apps/web/Dockerfile).
// Резолвим относительно process.cwd() = /app в контейнере или
// /apps/web в dev. Парим оба варианта.
function loadPolicy(): string {
    const candidates = [
        path.resolve(process.cwd(), 'docs/legal/privacy-policy.md'),
        path.resolve(process.cwd(), '../../docs/legal/privacy-policy.md'),
    ];
    for (const p of candidates) {
        try {
            return fs.readFileSync(p, 'utf-8');
        } catch {
            // try next
        }
    }
    throw new Error('privacy-policy.md not found in any expected location');
}

// Извлекаем dateline из первой строки с "**Дата вступления в силу:**".
function extractDateline(source: string): string | undefined {
    const m = source.match(/\*\*Дата вступления в силу:\*\*\s+([^\n]+)/);
    return m ? `Дата вступления в силу: ${m[1]!.trim()}` : undefined;
}

// Удаляем H1 (заголовок страницы рендерится в Shell) и dateline-блок,
// чтобы не дублировать.
function stripHeaderBlock(source: string): string {
    const lines = source.split(/\r?\n/);
    const out: string[] = [];
    let inHeader = true;
    for (const line of lines) {
        if (inHeader) {
            // Skip H1 line + version/dateline lines + blank lines until first H2.
            if (line.startsWith('# ')) continue;
            if (line.startsWith('**')) continue;
            if (line.trim() === '') continue;
            if (line.startsWith('## ')) {
                inHeader = false;
                out.push(line);
                continue;
            }
            // Paragraph text in header zone: also a banner intro line — keep it
            // (rare, but Jurist may have one).
            inHeader = false;
        }
        out.push(line);
    }
    return out.join('\n');
}

export default function PrivacyPolicyPage() {
    const source = loadPolicy();
    const dateline = extractDateline(source);
    const body = stripHeaderBlock(source);
    const toc = extractToc(source);

    return (
        <LegalPageShell
            title="Политика конфиденциальности"
            dateline={dateline}
            draft={false}
            toc={toc}
        >
            <MarkdownView source={body} headingIds />
        </LegalPageShell>
    );
}
