// ============================================================
// C9 (security): серверный DPA-гейт (152-ФЗ ст. 9).
//
// Раньше согласие на DPA проверялось ТОЛЬКО в UI (admin/integrations), причём
// fail-open: на 404/сетевой ошибке клиент всё равно открывал CredentialModal.
// Сервер же при сохранении кредов согласие не проверял вовсе → DPA-гейт можно
// было обойти, отправив POST /credentials напрямую. Здесь — авторитетная
// серверная проверка, вызывается из credential-save.
// ============================================================
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { dpaAcceptances } from '../../db/schema.js';
import { getDpa } from './loader.js';

export class DpaNotAcceptedError extends Error {
    readonly code = 'DPA_NOT_ACCEPTED';
    constructor(public readonly providerId: string, public readonly version: string) {
        super(`Требуется согласие на DPA провайдера «${providerId}» (версия ${version})`);
        this.name = 'DpaNotAcceptedError';
    }
}

/**
 * Бросает DpaNotAcceptedError, если провайдер требует DPA-согласие, а текущий
 * user×org его не дал для актуальной версии. Провайдеры без DPA-файла или с
 * requiresAcceptance=false (vendor-infra) проходят без блокировки.
 */
export async function assertDpaAccepted(
    providerId: string,
    user: { userId: string; organizationId?: string | null },
): Promise<void> {
    const dpa = await getDpa(providerId);
    // Нет DPA-файла (пилот: не у всех провайдеров он есть) либо согласие
    // юридически не требуется (vendor-infra) → не блокируем.
    if (!dpa || !dpa.frontmatter.requiresAcceptance) {
        return;
    }
    if (!user.organizationId) {
        throw new DpaNotAcceptedError(providerId, dpa.frontmatter.version);
    }

    const [row] = await db
        .select({ version: dpaAcceptances.version })
        .from(dpaAcceptances)
        .where(and(
            eq(dpaAcceptances.userId, user.userId),
            eq(dpaAcceptances.organizationId, user.organizationId),
            eq(dpaAcceptances.providerId, providerId),
            eq(dpaAcceptances.version, dpa.frontmatter.version),
        ))
        .limit(1);

    if (!row) {
        throw new DpaNotAcceptedError(providerId, dpa.frontmatter.version);
    }
}
