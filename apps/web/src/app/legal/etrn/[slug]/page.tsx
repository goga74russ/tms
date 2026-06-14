// P1-3 — отдельный документ юр-пакета ЭТрН (docs/legal/etrn/<slug>.md).
import { notFound } from 'next/navigation';
import { LegalPageShell } from '../../components/LegalPageShell';
import { MarkdownView } from '@/components/MarkdownView';
import { extractToc } from '@/components/markdown-parser';
import { loadLegalDoc, listLegalSlugs, rewriteLegalLinks } from '@/lib/legal-docs';

export function generateStaticParams() {
    return listLegalSlugs('etrn').map((slug) => ({ slug }));
}

function title(source: string): string {
    const m = source.match(/^#\s+(.+)$/m);
    return m ? m[1]!.trim() : 'Документ';
}
function stripH1(source: string): string {
    return source.split(/\r?\n/).filter((l) => !l.startsWith('# ')).join('\n');
}

export default async function EtrnDocPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    let raw: string;
    try {
        raw = loadLegalDoc('etrn', slug);
    } catch {
        notFound();
    }
    const body = rewriteLegalLinks('etrn', stripH1(raw));
    const toc = extractToc(raw);
    return (
        <LegalPageShell title={title(raw)} draft={false} toc={toc}>
            <MarkdownView source={body} headingIds />
        </LegalPageShell>
    );
}
