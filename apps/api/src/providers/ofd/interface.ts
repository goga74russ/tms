// ============================================================
// ОФД provider — 54-ФЗ fiscal-receipt operator.
// Fiscalizes a successful payment: registers it with ФНС through
// an Operator of Fiscal Data, returns the receipt URL the merchant
// must show to the buyer (чек-ссылка).
// ============================================================
//
// Note: ОФД is a separate provider domain from `payment` because the
// same merchant typically uses one ЮKassa + one ОФД (Платформа ОФД,
// OFD.ru, Такском-Касса …). We don't extend the global ProviderType
// union here — the registry exposes ofd adapters directly via
// getDefaultRegistry().ofd.

export type OfdProviderMode = 'mock' | 'sandbox' | 'production';

export interface OfdProviderHealth {
    ok: boolean;
    mode: OfdProviderMode;
    detail?: string;
    checkedAt: string;
}

/** Subset of payment data the OFD needs to print a receipt. */
export interface OfdFiscalizeInput {
    paymentId: string;
    /** Amount in kopecks. */
    amountKopecks: number;
    description: string;
    /** Customer email or phone — required by 54-ФЗ. */
    customerEmail?: string;
    customerPhone?: string;
    /** ИНН of the seller (the platform operator). */
    sellerInn?: string;
    /** Tax type: USN_INCOME / USN_INCOME_EXPENSE / OSN / etc. */
    taxSystem?: 'osn' | 'usn_income' | 'usn_income_outcome' | 'patent' | 'envd' | 'esn';
    /** VAT rate code, default vat_none for USN. */
    vatCode?: 'vat_none' | 'vat0' | 'vat10' | 'vat20' | 'vat110' | 'vat120';
}

export interface OfdReceipt {
    /** ОФД external id of the receipt (fiscal document number, ФД №). */
    externalId: string;
    /** Public URL where the buyer can view the receipt. */
    receiptUrl: string;
    /** ФН — fiscal accumulator serial number, used in audit. */
    fnNumber?: string;
    /** ФП/ФПД — fiscal sign of the document. */
    fiscalSign?: string;
    fiscalizedAt: string;
    raw?: Record<string, unknown>;
}

export interface OfdCredentials {
    /** API key / login pair, depending on provider. */
    apiKey?: string;
    login?: string;
    password?: string;
    /** Operator's INN registered in their cabinet. */
    inn?: string;
    /** Касса group / shift identifier in their personal cabinet. */
    groupCode?: string;
}

export interface OfdProvider {
    readonly name: string;
    readonly mode: OfdProviderMode;
    healthCheck(): Promise<OfdProviderHealth>;
    fiscalize(input: OfdFiscalizeInput): Promise<OfdReceipt>;
    getReceipt(externalId: string): Promise<OfdReceipt | null>;
}
