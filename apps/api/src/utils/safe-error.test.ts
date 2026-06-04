import { describe, it, expect } from 'vitest';
import { safeClientError } from './safe-error.js';

// C8 anchor / anti-recidivism invariant:
// PG/Drizzle errors must NEVER leak DB structure (table/column/constraint/SQLSTATE)
// to the client; domain errors we throw deliberately pass through.
describe('safeClientError', () => {
    const FALLBACK = 'Внутренняя ошибка сервера';

    it('suppresses postgres.js error (has severity/routine/constraint_name)', () => {
        const pgErr = Object.assign(new Error('duplicate key value violates unique constraint "contractors_inn_unique"'), {
            severity: 'ERROR',
            code: '23505',
            constraint_name: 'contractors_inn_unique',
            table_name: 'contractors',
            routine: '_bt_check_unique',
        });
        expect(safeClientError(pgErr, FALLBACK)).toBe(FALLBACK);
    });

    it('suppresses any error whose code is a 5-char SQLSTATE', () => {
        const err = Object.assign(new Error('some internal db text'), { code: '23503' });
        expect(safeClientError(err, FALLBACK)).toBe(FALLBACK);
    });

    it('suppresses a plain PG-shaped object (not instanceof Error)', () => {
        const obj = { severity: 'ERROR', code: '42P01', message: 'relation "trips" does not exist' };
        expect(safeClientError(obj, FALLBACK)).toBe(FALLBACK);
    });

    it('passes through a deliberate domain error message', () => {
        const domain = new Error('Рейс уже завершён');
        expect(safeClientError(domain, FALLBACK)).toBe('Рейс уже завершён');
    });

    it('passes through a domain error whose code is a long app code (not 5-char)', () => {
        const domain = Object.assign(new Error('Субподряд: ЭТрН заблокирована'), { code: 'SUBCONTRACT_ETRN_BLOCKED' });
        expect(safeClientError(domain, FALLBACK)).toBe('Субподряд: ЭТрН заблокирована');
    });

    it('returns fallback for non-error values', () => {
        expect(safeClientError(undefined, FALLBACK)).toBe(FALLBACK);
        expect(safeClientError(null, FALLBACK)).toBe(FALLBACK);
        expect(safeClientError('raw string', FALLBACK)).toBe(FALLBACK);
    });

    it('returns fallback for an Error with empty message', () => {
        expect(safeClientError(new Error(''), FALLBACK)).toBe(FALLBACK);
    });
});
