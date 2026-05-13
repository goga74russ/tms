# ADR-0009: Vitest for API/web/shared, ts-jest for mobile

- **Status:** Accepted
- **Date:** 2026-03-15
- **Deciders:** TMS core team

## Context

Three application surfaces with different runtime constraints:

- **`@tms/api` + `@tms/shared`** — pure Node, ESM, heavy TypeScript types. Fastify route handlers tested via `app.inject`; pure-logic tests for services and utilities.
- **`@tms/web`** — React 19 + jsdom. Component tests via `@testing-library/react`; we pin React 19.2.4 across the monorepo with `pnpm.overrides`.
- **`@tms/mobile`** — React Native + Expo, with native modules (camera, location, secure-store, WatermelonDB). Tests we care about today are pure-logic (offline queue, fetch retry, sync wrapper, role priority) — no native rendering.

The question was whether to unify on one test framework or to pick per app.

Alternatives considered:

- **Vitest everywhere, including mobile** — Vitest works fine with React but has no first-class React Native preset. We'd be writing the native-module mock stack from scratch with no community recipes to crib from.
- **Jest everywhere** — Possible. We'd lose Vite-aligned config and ESM-first behaviour on the api/web side, and ts-jest is meaningfully slower than Vitest's transformer.
- **jest-expo for mobile** — The Expo-blessed option. Currently has peer-dep conflicts with our pinned React 19.2.4 (jest-expo expects a lower React minor). We'd either fight the peer-dep resolver or downgrade React across the monorepo.

## Decision

- **API, shared, web** — Vitest. Configured per package; shared TS config; native ESM.
- **Mobile** — ts-jest with manual mocks under `apps/mobile/test/mocks/`. Tests are pure-logic; no rendering or native bridge interaction.

Mechanism:

- `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`, `packages/shared/vitest.config.ts` — Vitest with package-specific environment (`node` vs `jsdom`).
- `apps/mobile/jest.config.js` — ts-jest with explicit `moduleNameMapper` to point every native import at a hand-written mock.
- Mobile native mocks live in `apps/mobile/test/mocks/{expo-camera,expo-location,expo-notifications,expo-secure-store,async-storage,netinfo,react-native,watermelondb,...}.ts`. Each is small, audited, and version-pinned.

## Consequences

**Positive**
- Uniform test API across api/web/shared — same `describe`/`it`/`expect`/`vi.mock` ergonomics, same watch mode, same coverage reporter.
- No peer-dep fight with jest-expo; we stay on the React version we want.
- Mobile mocks are explicit files — easy to grep, easy to update when a native module's API changes.

**Negative**
- Mobile has a different framework than the rest of the monorepo. Developers switching between web and mobile pay a small mental tax (`vi.mock` vs `jest.mock`, slightly different matcher signatures).
- We don't get jest-expo's pre-built native mocks — if we ever start rendering RN components in tests, we'll have to either write the renderer mocks ourselves or revisit this decision.

**Neutral**
- Mobile unit tests currently run with `continue-on-error: true` in CI (see `.github/workflows/p0-gate.yml`) while the mock stack beds in. That's a CI policy choice, not a framework choice.
- The boundary is package-level, not file-level — no single package mixes the two runners.

## References

- Configs: `apps/api/package.json` (vitest deps + scripts), `apps/web/vitest.config.ts`, `apps/mobile/jest.config.js`
- Mocks: `apps/mobile/test/mocks/`
- CI: `.github/workflows/p0-gate.yml` (mobile job + `continue-on-error`)
- Related: ADR-0006 (Drizzle types flow into shared test fixtures)
