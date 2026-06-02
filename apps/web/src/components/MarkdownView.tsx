'use client';

// ============================================================
// Lightweight markdown renderer (shared client component).
//
// Parser-логика вынесена в markdown-parser.ts (server-safe).
// Здесь — только React-рендеринг + inline markup.
//
// Используется в:
//   * /admin/integrations DpaStepModal — DPA-тексты провайдеров
//   * /legal/privacy        — Privacy Policy
//   * /legal/terms          — Terms of Service
// ============================================================
import type React from 'react';
import { parseMarkdownBlocks, slugifyHeading, type Block } from './markdown-parser';

interface MarkdownViewProps {
    source: string;
    /** Опционально добавляет id на h2 для якорной навигации из TOC. */
    headingIds?: boolean;
}

export function MarkdownView({ source, headingIds = false }: MarkdownViewProps) {
    const blocks = parseMarkdownBlocks(source);
    return (
        <div className="prose prose-sm max-w-none text-neutral-800 leading-relaxed space-y-3">
            {blocks.map((b, i) => renderBlock(b, i, headingIds))}
        </div>
    );
}

function renderBlock(b: Block, key: number, headingIds: boolean): React.ReactNode {
    switch (b.kind) {
        case 'h': {
            const id = headingIds && b.level === 2 ? slugifyHeading(b.text) : undefined;
            const content = renderInline(b.text);
            if (b.level === 1) return <h1 key={key} className="text-2xl font-bold text-neutral-900 mt-6 mb-3">{content}</h1>;
            if (b.level === 2) return <h2 key={key} id={id} className="text-xl font-bold text-neutral-900 mt-6 mb-2 scroll-mt-20">{content}</h2>;
            if (b.level === 3) return <h3 key={key} className="text-base font-semibold text-neutral-800 mt-4 mb-1.5">{content}</h3>;
            return <h4 key={key} className="text-sm font-semibold uppercase tracking-wide text-neutral-600 mt-3 mb-1">{content}</h4>;
        }
        case 'p':
            return <p key={key} className="text-sm">{renderInline(b.text)}</p>;
        case 'ul':
            return <ul key={key} className="list-disc list-outside pl-5 text-sm space-y-1">{b.items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}</ul>;
        case 'ol':
            return <ol key={key} className="list-decimal list-outside pl-5 text-sm space-y-1">{b.items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}</ol>;
        case 'blockquote':
            return <blockquote key={key} className="border-l-2 border-amber-300 bg-amber-50/40 pl-3 py-2 text-sm text-amber-900 italic">{renderInline(b.text)}</blockquote>;
        case 'table':
            return (
                <div key={key} className="overflow-x-auto -mx-2 px-2">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr>{b.header.map((h, k) => <th key={k} className="text-left font-semibold text-neutral-900 border-b-2 border-neutral-300 px-2 py-1.5">{renderInline(h)}</th>)}</tr>
                        </thead>
                        <tbody>
                            {b.rows.map((row, r) => (
                                <tr key={r} className="border-b border-neutral-100">
                                    {row.map((cell, c) => <td key={c} className="px-2 py-1.5 align-top">{renderInline(cell)}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'hr':
            return <hr key={key} className="border-neutral-200 my-4" />;
    }
}

/**
 * Inline-разметка: **bold**, `inline code`, [text](url).
 * Простой токенайзер. Регулярки match-as-go, без backtracking.
 */
function renderInline(text: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let rest = text;
    let key = 0;
    while (rest.length > 0) {
        const bold = rest.match(/^\*\*(.+?)\*\*/);
        if (bold) {
            out.push(<strong key={key++} className="font-semibold text-neutral-900">{bold[1]}</strong>);
            rest = rest.slice(bold[0].length);
            continue;
        }
        const code = rest.match(/^`([^`]+)`/);
        if (code) {
            out.push(<code key={key++} className="bg-neutral-100 text-neutral-800 px-1 rounded text-[12px] font-mono">{code[1]}</code>);
            rest = rest.slice(code[0].length);
            continue;
        }
        const link = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
        if (link) {
            // P2-E5: whitelist схем — иначе [text](javascript:...) даёт latent XSS.
            // Разрешаем http/https/mailto/tel + относительные (/, #, ./, ../).
            const url = link[2].trim();
            const safe = /^(https?:|mailto:|tel:)/i.test(url) || /^(\/|#|\.\/|\.\.\/)/.test(url);
            if (safe) {
                out.push(<a key={key++} href={url} className="text-brand-600 hover:text-brand-700 underline" target="_blank" rel="noopener noreferrer">{link[1]}</a>);
            } else {
                // Небезопасная схема → рендерим только текст ссылки, без href.
                out.push(<span key={key++}>{link[1]}</span>);
            }
            rest = rest.slice(link[0].length);
            continue;
        }
        // plain text — find next markup boundary or end
        const next = rest.search(/(\*\*|`|\[)/);
        if (next === -1) {
            out.push(rest);
            break;
        }
        if (next === 0) {
            // Markup token didn't match a complete pair (e.g. unmatched `**`).
            // Consume 1 char so we don't infinite-loop, push as plain text.
            out.push(rest[0]);
            rest = rest.slice(1);
            continue;
        }
        out.push(rest.slice(0, next));
        rest = rest.slice(next);
    }
    return out;
}
