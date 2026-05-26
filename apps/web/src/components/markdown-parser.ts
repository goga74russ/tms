// ============================================================
// Markdown parser — pure logic, server-safe.
// Используется и в client-компоненте MarkdownView, и в server-components
// /legal/privacy + /legal/terms для extractToc() во время SSG.
// ============================================================

export type Block =
    | { kind: 'h'; level: 1 | 2 | 3 | 4; text: string }
    | { kind: 'p'; text: string }
    | { kind: 'ul'; items: string[] }
    | { kind: 'ol'; items: string[] }
    | { kind: 'blockquote'; text: string }
    | { kind: 'table'; header: string[]; rows: string[][] }
    | { kind: 'hr' };

export function parseMarkdownBlocks(src: string): Block[] {
    const lines = src.split(/\r?\n/);
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i] ?? '';
        if (line.trim() === '') { i++; continue; }
        if (line.trim() === '---') { blocks.push({ kind: 'hr' }); i++; continue; }

        // Heading
        const h = line.match(/^(#{1,4})\s+(.+)$/);
        if (h) {
            blocks.push({ kind: 'h', level: h[1]!.length as 1 | 2 | 3 | 4, text: h[2]! });
            i++; continue;
        }

        // Blockquote
        if (line.startsWith('> ') || line.startsWith('>')) {
            const acc: string[] = [];
            while (i < lines.length && (lines[i]!.startsWith('>') || lines[i]!.trim() === '')) {
                if (lines[i]!.trim() === '') break;
                acc.push(lines[i]!.replace(/^>\s?/, ''));
                i++;
            }
            blocks.push({ kind: 'blockquote', text: acc.join(' ') });
            continue;
        }

        // Table: header line + separator
        if (line.includes('|') && i + 1 < lines.length && (lines[i + 1] ?? '').match(/^\s*\|?[\s:-]+\|[\s:-]+/)) {
            const header = splitTableRow(line);
            i += 2;
            const rows: string[][] = [];
            while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
                rows.push(splitTableRow(lines[i]!));
                i++;
            }
            blocks.push({ kind: 'table', header, rows });
            continue;
        }

        // Unordered list
        if (line.match(/^[-*]\s+/)) {
            const items: string[] = [];
            while (i < lines.length && lines[i]!.match(/^[-*]\s+/)) {
                items.push(lines[i]!.replace(/^[-*]\s+/, ''));
                i++;
            }
            blocks.push({ kind: 'ul', items });
            continue;
        }

        // Ordered list
        if (line.match(/^\d+\.\s+/)) {
            const items: string[] = [];
            while (i < lines.length && lines[i]!.match(/^\d+\.\s+/)) {
                items.push(lines[i]!.replace(/^\d+\.\s+/, ''));
                i++;
            }
            blocks.push({ kind: 'ol', items });
            continue;
        }

        // Paragraph
        const para: string[] = [];
        while (i < lines.length && lines[i]!.trim() !== '' && !lines[i]!.match(/^(#{1,4}|[-*]\s|>\s|\d+\.\s|---$)/)) {
            para.push(lines[i]!);
            i++;
        }
        blocks.push({ kind: 'p', text: para.join(' ') });
    }
    return blocks;
}

function splitTableRow(row: string): string[] {
    return row
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((c) => c.trim());
}

export function slugifyHeading(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^а-яa-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Returns TOC entries (h2 headings) — used by server components to feed
 * LegalPageShell's `toc` prop.
 */
export function extractToc(source: string): Array<{ id: string; label: string }> {
    return parseMarkdownBlocks(source)
        .filter((b): b is Extract<Block, { kind: 'h' }> => b.kind === 'h' && b.level === 2)
        .map((b) => ({ id: slugifyHeading(b.text), label: b.text }));
}
