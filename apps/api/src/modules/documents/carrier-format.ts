// ③ — чистая (без БД) часть резолва реквизитов исполнителя: тип, маппинг в
// формат PDF-генераторов и гейт. Вынесено из org-requisites.ts, чтобы юнит-тесты
// (print.test) не тянули db/connection (которое требует DATABASE_URL при импорте).
// БД-резолв (resolveOrgRequisites) остаётся в org-requisites.ts.

export type CarrierRequisites = {
    name: string | null;
    inn: string | null;
    kpp: string | null;
    ogrn: string | null;
    address: string | null;
    bankBik: string | null;
    bankAccount: string | null;
    bankName: string | null;
    corrAccount: string | null;
};

// Серверным PDF-генераторам нужен плоский объект в формате прежнего pdf-base
// CARRIER (name/inn/kpp/address/bank/bik/account/corr/phone). Мапим реквизиты
// организации в этот формат; незаполненные поля → 'НЕ УСТАНОВЛЕНО', чтобы
// мисконфиг был виден, а не печатались чужие/пустые реквизиты.
export const NOT_SET = 'НЕ УСТАНОВЛЕНО';
export type PdfCarrier = {
    name: string; inn: string; kpp: string; ogrn: string; address: string;
    bank: string; bik: string; account: string; corr: string; phone: string;
};
export function carrierForPdf(req: CarrierRequisites | null): PdfCarrier {
    return {
        name: req?.name?.trim() || NOT_SET,
        inn: req?.inn?.trim() || NOT_SET,
        kpp: req?.kpp?.trim() || '', // ИП — без КПП
        ogrn: req?.ogrn?.trim() || NOT_SET, // ⑥ Приказ №390 — ОГРН/ОГРНИП владельца ТС
        address: req?.address?.trim() || NOT_SET,
        bank: req?.bankName?.trim() || NOT_SET,
        bik: req?.bankBik?.trim() || NOT_SET,
        account: req?.bankAccount?.trim() || NOT_SET,
        corr: req?.corrAccount?.trim() || NOT_SET,
        phone: '', // телефон в орг-модели не хранится
    };
}

// Гейт server-PDF: при незаполненных реквизитах организации — НЕ отдавать
// документ (вернётся ошибка в роуте), а не печатать хардкод/пустоту.
// requireBank=true — для счёта на оплату (нужен расчётный счёт).
export class CarrierNotConfiguredError extends Error {
    statusCode = 422;
    constructor(message: string) { super(message); this.name = 'CarrierNotConfiguredError'; }
}
export function assertCarrierConfigured(req: CarrierRequisites | null, opts: { requireBank?: boolean } = {}): void {
    const c = carrierForPdf(req);
    if (c.name === NOT_SET || c.inn === NOT_SET) {
        throw new CarrierNotConfiguredError('Реквизиты исполнителя (наименование/ИНН) не заполнены в профиле организации');
    }
    if (opts.requireBank && c.account === NOT_SET) {
        throw new CarrierNotConfiguredError('Банковские реквизиты (расчётный счёт) не заполнены в профиле организации');
    }
}
