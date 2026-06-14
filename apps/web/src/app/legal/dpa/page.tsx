// P1-3 — индекс DPA-каталога (docs/legal/dpa/README.md), ссылки → роуты.
import { LegalPageShell } from '../components/LegalPageShell';
import { MarkdownView } from '@/components/MarkdownView';
import { extractToc } from '@/components/markdown-parser';
import { loadLegalDoc, rewriteLegalLinks } from '@/lib/legal-docs';

export const metadata = {
    title: 'Каталог соглашений об обработке данных (DPA) — ТрансПульт',
    description: 'Соглашения об обработке персональных данных с провайдерами интеграций.',
};

function stripH1(source: string): string {
    return source.split(/\r?\n/).filter((l, i) => !(i === 0 && l.startsWith('# '))).join('\n');
}

export default function DpaCatalogIndexPage() {
    const raw = loadLegalDoc('dpa', 'README');
    const body = rewriteLegalLinks('dpa', stripH1(raw));
    const toc = extractToc(raw);
    return (
        <LegalPageShell title="Каталог DPA (соглашения об обработке данных)" draft={false} toc={toc}>
            <MarkdownView source={body} headingIds />
        </LegalPageShell>
    );
}
