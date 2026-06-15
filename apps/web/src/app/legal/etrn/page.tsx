// Витрина-каталог юр-пакета ЭПД/ЭТрН (legal-pages-cleanup-spec T-LEGAL-3/3b).
// Список документов строится ПРОГРАММНО из docs/legal/etrn/*.md (slug + H1),
// README (технический dev-документ) на публичную страницу НЕ рендерится.
import { LegalPageShell } from '../components/LegalPageShell';
import { MarkdownView } from '@/components/MarkdownView';
import { extractToc } from '@/components/markdown-parser';
import { listLegalDocs } from '@/lib/legal-docs';

export const metadata = {
    title: 'Юридический пакет ЭТрН — ТрансПульт',
    description: 'Документы для перехода на электронные перевозочные документы (ЭПД/ЭТрН) к 01.09.2026.',
};

// Краткое назначение каждого документа пакета (1 строка) — для каталога.
const ETRN_PURPOSE: Record<string, string> = {
    '01-order-transition-to-epd': 'Распорядительный акт руководителя о переходе организации на ЭПД.',
    '02-epd-regulation': 'Внутренний регламент работы с ЭПД и сроков подписания титулов ЭТрН.',
    '03-amendment-carriage-contract': 'Допсоглашение к договору перевозки о переходе на электронный обмен.',
    '04-amendment-forwarding-contract': 'Допсоглашение к договору транспортной экспедиции о переходе на ЭПД.',
    '05-employee-kep-consent': 'Согласие сотрудника на использование квалифицированной ЭП (КЭП).',
    '06-driver-gosklyuch-consent': 'Согласие водителя на использование Госключа (УНЭП) для подписания ЭТрН.',
    '07-pep-internal-agreement': 'Соглашение об использовании простой ЭП (ПЭП) во внутренних документах.',
    '08-electronic-signature-policy': 'Положение об электронной подписи в организации.',
    '99-dpa-client-tms': 'Договор обработки персональных данных (DPA) между Клиентом и TMS.',
};

function buildCatalog(): string {
    const docs = listLegalDocs('etrn');
    const items = docs
        .map((d, i) => {
            const purpose = ETRN_PURPOSE[d.slug];
            return `${i + 1}. **[${d.title}](/legal/etrn/${d.slug})**${purpose ? ` — ${purpose}` : ''}`;
        })
        .join('\n');
    return [
        'Пакет типовых документов для перехода вашей организации на электронные перевозочные '
        + 'документы (ЭПД/ЭТрН) к 1 сентября 2026 года. Документы оформлены как шаблоны: поля для '
        + 'реквизитов помечены метками вида `[Наименование организации]` и заполняются под конкретную организацию.',
        '',
        '## Состав пакета',
        '',
        items,
        '',
        '## Как получить заполняемые шаблоны',
        '',
        'Шаблоны с автоматической подстановкой реквизитов вашей организации доступны в личном '
        + 'кабинете после регистрации организации.',
        '',
        '**[Перейти к настройке организации →](/onboarding)**',
    ].join('\n');
}

export default function EtrnPackageIndexPage() {
    const body = buildCatalog();
    const toc = extractToc(body);
    return (
        <LegalPageShell title="Юридический пакет для перехода на ЭПД (к 01.09.2026)" draft={false} toc={toc}>
            <MarkdownView source={body} headingIds />
        </LegalPageShell>
    );
}
