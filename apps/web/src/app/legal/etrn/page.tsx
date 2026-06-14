// P1-3 — индекс юр-пакета ЭТрН (docs/legal/etrn/README.md), ссылки → роуты.
import { LegalPageShell } from '../components/LegalPageShell';
import { MarkdownView } from '@/components/MarkdownView';
import { extractToc } from '@/components/markdown-parser';
import { loadLegalDoc, rewriteLegalLinks } from '@/lib/legal-docs';

export const metadata = {
    title: 'Юридический пакет ЭТрН — ТрансПульт',
    description: 'Документы для перехода на электронные перевозочные документы (ЭПД/ЭТрН).',
};

function stripH1(source: string): string {
    return source.split(/\r?\n/).filter((l, i) => !(i === 0 && l.startsWith('# '))).join('\n');
}

export default function EtrnPackageIndexPage() {
    const raw = loadLegalDoc('etrn', 'README');
    const body = rewriteLegalLinks('etrn', stripH1(raw));
    const toc = extractToc(raw);
    return (
        <LegalPageShell title="Юридический пакет ЭТрН" draft={false} toc={toc}>
            <MarkdownView source={body} headingIds />
        </LegalPageShell>
    );
}
