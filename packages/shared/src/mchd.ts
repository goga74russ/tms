// ============================================================
// МЧД — Машиночитаемые Доверенности (ЭТрН-подписание с 01.09.2026)
// ------------------------------------------------------------
// Реестр МЧД клиента, по которому подбирается полномочие физлица
// для подписи ЭТрН/ПУД от имени юр-лица. XML МЧД клиент получает
// сам через ФНС/УЦ — мы только храним.
// ============================================================

export type MchdStatus = 'active' | 'revoked' | 'expired';

/**
 * Запись реестра МЧД. НЕ включает `certificateXml` — он большой
 * (полный XML от ФНС) и отдаётся отдельным getter-эндпоинтом по id.
 */
export interface Mchd {
    id: string;
    organizationId: string;
    mchdNumber: string;
    granterInn: string;
    granterName: string;
    granterOgrn?: string | null;
    granteeFullName: string;
    granteeInn: string;
    granteePassport?: string | null;
    scope: string;
    /** ISO-8601 */
    issuedAt: string;
    /** ISO-8601 */
    expiresAt: string;
    status: MchdStatus;
    revokedAt?: string | null;
    revocationReason?: string | null;
    certificateXmlHash: string;
    uploadedByUserId?: string | null;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
}

/**
 * Расширенная форма с полным XML — для детального GET по id.
 */
export interface MchdWithXml extends Mchd {
    certificateXml: string;
}

/**
 * Payload для загрузки новой МЧД в реестр. XML должен быть валидным
 * документом от ФНС; минимальная проверка — должен начинаться с `<?xml`.
 */
export interface MchdCreate {
    mchdNumber: string;
    granterInn: string;
    granterName: string;
    granterOgrn?: string;
    granteeFullName: string;
    granteeInn: string;
    granteePassport?: string;
    scope: string;
    /** ISO-8601 */
    issuedAt: string;
    /** ISO-8601 */
    expiresAt: string;
    /** Полный XML МЧД от ФНС. */
    certificateXml: string;
    notes?: string;
}

export interface MchdRevoke {
    revocationReason: string;
}
