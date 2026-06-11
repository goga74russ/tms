import { db } from '../../db/connection.js';
import { organizations, trips } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { CarrierRequisites } from './carrier-format.js';

// CFG-1 / OBS-1 (demo-readiness 2026-06-11): реквизиты исполнителя для печатных
// форм (ЭТрН / ПЛ / акты / счёт / УПД) раньше брались из build-env
// NEXT_PUBLIC_CARRIER_* (фрагментно) либо из хардкода ИП Бардина в шаблоне УПД.
// Это ломалось при незаданном env (пустой документ/гейт) и было mono-tenant
// (один перевозчик на весь build). Единый источник — данные организации, к
// которой принадлежит документ. Под super (org=null у пользователя) реквизиты
// берутся по организации САМОГО документа, а не по null-орг читателя.
//
// Чистая часть (тип, carrierForPdf, гейт) — в ./carrier-format.js (без db, чтобы
// юнит-тесты не требовали DATABASE_URL). Реэкспортим для обратной совместимости.
export type { CarrierRequisites, PdfCarrier } from './carrier-format.js';
export { NOT_SET, carrierForPdf, CarrierNotConfiguredError, assertCarrierConfigured } from './carrier-format.js';

export async function resolveOrgRequisites(
    organizationId: string | null | undefined,
): Promise<CarrierRequisites | null> {
    if (!organizationId) return null;
    const [org] = await db
        .select({
            name: organizations.name,
            inn: organizations.inn,
            kpp: organizations.kpp,
            ogrn: organizations.ogrn,
            legalAddress: organizations.legalAddress,
            bankBik: organizations.bankBik,
            bankAccount: organizations.bankAccount,
            bankName: organizations.bankName,
            corrAccount: organizations.corrAccount,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
    if (!org) return null;
    return {
        name: org.name ?? null,
        inn: org.inn ?? null,
        kpp: org.kpp ?? null,
        ogrn: org.ogrn ?? null,
        address: org.legalAddress ?? null,
        bankBik: org.bankBik ?? null,
        bankAccount: org.bankAccount ?? null,
        bankName: org.bankName ?? null,
        corrAccount: org.corrAccount ?? null,
    };
}

// Путевой лист / ЭТрН живут на waybill, у которого нет прямой org-колонки —
// резолвим орг через рейс (waybill.tripId → trips.organizationId).
export async function resolveOrgRequisitesByTrip(
    tripId: string | null | undefined,
): Promise<CarrierRequisites | null> {
    if (!tripId) return null;
    const [trip] = await db
        .select({ organizationId: trips.organizationId })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);
    return resolveOrgRequisites(trip?.organizationId ?? null);
}
