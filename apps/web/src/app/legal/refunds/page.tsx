// Server Component — публикация refund-policy.md (P1-6, H9).
// Single source of truth: docs/legal/refund-policy.md (под Jurist'ом).
import fs from 'node:fs';
import path from 'node:path';
import { LegalPageShell } from '../components/LegalPageShell';
import { MarkdownView } from '@/components/MarkdownView';
import { extractToc } from '@/components/markdown-parser';

export const metadata = {
    title: 'Политика возврата средств — ТрансПульт',
    description: 'Условия возврата денежных средств за услуги ТрансПульт.',
};

function loadDoc(): string {
    const candidates = [
        path.resolve(process.cwd(), 'docs/legal/refund-policy.md'),
        path.resolve(process.cwd(), '../../docs/legal/refund-policy.md'),
    ];
    for (const p of candidates) {
        try {
            return fs.readFileSync(p, 'utf-8');
        } catch {
            // try next
        }
    }
    throw new Error('refund-policy.md not found in any expected location');
}

function extractDateline(source: string): string | undefined {
    const m = source.match(/\*\*Дата вступления в силу:\*\*\s+([^\n]+)/);
    return m ? `Дата вступления в силу: ${m[1]!.trim()}` : undefined;
}

function stripHeaderBlock(source: string): string {
    const lines = source.split(/\r?\n/);
    const out: string[] = [];
    let inHeader = true;
    for (const line of lines) {
        if (inHeader) {
            if (line.startsWith('# ')) continue;
            if (line.startsWith('**')) continue;
            if (line.trim() === '') continue;
            if (line.startsWith('## ')) {
                inHeader = false;
                out.push(line);
                continue;
            }
            inHeader = false;
        }
        out.push(line);
    }
    return out.join('\n');
}

export default function RefundPolicyPage() {
    const source = loadDoc();
    const dateline = extractDateline(source);
    const body = stripHeaderBlock(source);
    const toc = extractToc(source);

    return (
        <LegalPageShell
            title="Политика возврата средств"
            dateline={dateline}
            draft={false}
            toc={toc}
        >
            <MarkdownView source={body} headingIds />
        </LegalPageShell>
    );
}
