// ============================================================
// C8 — санитизация ошибок для ответа клиенту.
//
// Раньше десятки per-route catch'ей слали `error.message` напрямую. У PG/Drizzle
// ошибок message содержит структуру БД (имена таблиц/столбцов/constraint'ов,
// SQLSTATE, значения) — утечка внутренней схемы. Глобальный error-handler
// (server.ts) санитизирует только UNCAUGHT 5xx; явные catch+send его минуют.
//
// safeClientError() отдаёт message ТОЛЬКО для доменных ошибок приложения
// (мы кинули их осознанно с безопасным текстом); PG/Drizzle ошибки → fallback.
// ============================================================

/**
 * Признаки ошибки PostgreSQL / драйвера (postgres.js / Drizzle).
 * SQLSTATE — ровно 5 символов [0-9A-Z]; доменные коды приложения длиннее
 * (`SUBCONTRACT_ETRN_BLOCKED` и т.п.), поэтому не пересекаются.
 */
function looksLikeDbError(error: object): boolean {
    const e = error as {
        code?: unknown; severity?: unknown; severity_local?: unknown;
        routine?: unknown; constraint_name?: unknown; table_name?: unknown; schema_name?: unknown;
    };
    if (e.severity || e.severity_local || e.routine || e.constraint_name || e.table_name || e.schema_name) {
        return true;
    }
    return typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code);
}

/**
 * Безопасное сообщение об ошибке для клиента.
 * - Доменная ошибка (наш Error с безопасным текстом, не из БД) → её message.
 * - PG/Drizzle ошибка (structure-leak) → fallback.
 * - Прочее → fallback.
 */
export function safeClientError(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        if (looksLikeDbError(error)) return fallback;
        return error.message || fallback;
    }
    if (error && typeof error === 'object' && looksLikeDbError(error)) return fallback;
    return fallback;
}
