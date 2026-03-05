# Changelog — Agent 10 (QA Engineer)

## Sprint 5 (2026-03-04)

### New Test Files

| File | Tests | Category |
|------|-------|----------|
| `rbac.test.ts` | 46 | RBAC — all 10 roles, requireAbility middleware |
| `security.test.ts` | 20 | JWT cookies, Bearer fallback, rate limit, Zod validation |
| `regression.test.ts` | 15 | Batch/single cost parity, number generators, state machine integrity |

### Infrastructure Fixes

- **`setup.ts`**: Added `@fastify/cookie` mock, moved `JWT_SECRET` before imports
- **`vitest.config.ts`**: Added `@tms/shared` alias
- **`setup.ts`**: Added `orderBy`, `offset`, `execute` mock methods to global DB mock

### Previous Sprint (Test TODOs)

Filled ~65 TODO placeholders across 10 test files:
- `auth.test.ts` (6), `inspections.test.ts` (17), `sync.test.ts` (10), `e2e-flow.test.ts` (16)
- `orders.test.ts` (17), `trips.test.ts` (18), `finance.test.ts` (15)
- `fleet.test.ts` (11), `waybills.test.ts` (8), `repairs.test.ts` (10)

### Summary

- **Total Tests**: 279 (138 prev + 81 new + 60 other agents)
- **Pass Rate**: 100% (279/279)
- **Test Files**: 18
- **Duration**: ~3.4s
