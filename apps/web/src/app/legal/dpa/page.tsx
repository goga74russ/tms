// Каталог соглашений об обработке данных (DPA) — legal-pages-cleanup-spec T-LEGAL-3b.
// Список строится ПРОГРАММНО из docs/legal/dpa/*.md (slug + H1); технический
// README (с TODO/CI-инструкциями для команды) на публичную страницу НЕ рендерится.
import { LegalPageShell } from '../components/LegalPageShell';
import { MarkdownView } from '@/components/MarkdownView';
import { extractToc } from '@/components/markdown-parser';
import { listLegalDocs } from '@/lib/legal-docs';

export const metadata = {
    title: 'Каталог соглашений об обработке данных (DPA) — ТрансПульт',
    description: 'Соглашения об обработке персональных данных с провайдерами интеграций.',
};

// Краткое назначение каждого DPA (1 строка) — для каталога.
const DPA_PURPOSE: Record<string, string> = {
    'anthropic-ai': 'AI-копилот — обработка обращений оператора.',
    'diadoc': 'Оператор ЭДО — обмен электронными перевозочными документами.',
    'gosklyuch': 'Подписание ЭТрН водителем через Госуслуги (УНЭП).',
    'kontur-sign': 'Выпуск и применение усиленной электронной подписи.',
    'mailru-smtp': 'Доставка e-mail-уведомлений.',
    'wialon': 'Телематика и GPS-мониторинг транспорта.',
    'yookassa': 'Приём платежей за услуги ТрансПульт.',
};

function buildCatalog(): string {
    const docs = listLegalDocs('dpa');
    const items = docs
        .map((d) => {
            const purpose = DPA_PURPOSE[d.slug];
            return `- **[${d.title}](/legal/dpa/${d.slug})**${purpose ? ` — ${purpose}` : ''}`;
        })
        .join('\n');
    return [
        'Соглашения и уведомления об обработке персональных данных провайдерами интеграций, '
        + 'которых ТрансПульт привлекает для оказания услуг. Каждый документ описывает, какие '
        + 'данные передаются провайдеру, с какой целью и на каком основании.',
        '',
        '## Провайдеры',
        '',
        items,
    ].join('\n');
}

export default function DpaCatalogIndexPage() {
    const body = buildCatalog();
    const toc = extractToc(body);
    return (
        <LegalPageShell title="Каталог DPA (соглашения об обработке данных)" draft={false} toc={toc}>
            <MarkdownView source={body} headingIds />
        </LegalPageShell>
    );
}
