// ============================================================
// P0-C2 — единый гейт ЭТрН для наёмных рейсов.
// Субподряд-блок (execution_mode='subcontract') раньше стоял только в
// generateWaybill + sign-endpoint. Мутации ЭТрН минуют его через
// recordTransportDocumentSignature и sendDocumentToEdi. Этот helper —
// единая точка: вызывать во ВСЕХ путях оформления/подписи/отправки ЭТрН.
// См. docs/legal/subcontract-legal-analysis.md §2.
// ============================================================
import { db } from '../../db/connection.js';
import { trips } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export class EtrnNotAllowedError extends Error {
    constructor(
        public code: string,
        message: string,
        public statusCode: number = 422,
    ) {
        super(message);
        this.name = 'EtrnNotAllowedError';
    }
}

const SUBCONTRACT_MESSAGE =
    'Оформление ЭТрН при наёмном транспорте требует ручной настройки ролей '
    + '(перевозчик/экспедитор) — обратитесь к ответственному за ЭПД. '
    + 'См. docs/legal/subcontract-legal-analysis.md §2.';

/**
 * Бросает EtrnNotAllowedError(SUBCONTRACT_ETRN_BLOCKED), если рейс — наёмный.
 * Для own-парка ничего не делает.
 */
export async function assertEtrnAllowed(tripId: string | null | undefined): Promise<void> {
    if (!tripId) return;
    const [trip] = await db.select({ executionMode: trips.executionMode })
        .from(trips).where(eq(trips.id, tripId)).limit(1);
    if (trip?.executionMode === 'subcontract') {
        throw new EtrnNotAllowedError('SUBCONTRACT_ETRN_BLOCKED', SUBCONTRACT_MESSAGE);
    }
}
