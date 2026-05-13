# ADR-0008: Next.js 15 App Router for the web frontend

- **Status:** Accepted
- **Date:** 2026-03-15
- **Deciders:** TMS core team

## Context

The web app serves three audience profiles in one bundle:

- **Public** — landing page, legal pages (terms, personal-data policy), pricing. Heavy on static content, light on interactivity.
- **Operator console** — dispatcher cockpit, driver self-service, admin tools. Highly interactive, role-gated routes.
- **Embedded auth** — JWT verification on every authenticated request, ideally at the edge so we don't pay a round-trip to the API for routing decisions.

The folder layout naturally follows roles: `/dispatcher`, `/driver`, `/admin/*`, `/landing`, `/legal`. We want the routing to mirror that, not fight it.

Alternatives considered:

- **Next.js 14 Pages Router** — Stable but legacy; data-loading idioms (`getServerSideProps`, `getStaticProps`) feel old, and middleware-based JWT verification is more awkward than in App Router.
- **Pure SPA + REST (Vite + React Router)** — Lighter conceptually. Loses SSR for landing/legal (SEO matters), and we'd hand-roll JWT-guarded routing in React.
- **Remix** — Strong primitives for nested layouts and form-driven flows. Smaller ecosystem in the regions where our customers' devs hire; mixing two frameworks across the org isn't worth it.

## Decision

Use **Next.js 15 with the App Router**, deployed as `next start` inside a Docker image (not Vercel). The `src/app/` tree is the routing hierarchy; layouts colocate with routes; middleware at `src/middleware.ts` performs JWT verification at the edge.

Mechanism:

- Server components for static-leaning pages (landing, legal).
- Client components (`'use client'`) for interactive consoles.
- `middleware.ts` rejects requests with no / expired / wrong-issuer JWT before they reach the route handler. This is the surface that originally produced bug B-3 (issuer mismatch between API mint and web verify) — having it in one place made the fix one file.

## Consequences

**Positive**
- One framework covers SPA, SSR, and SSG — no second routing library.
- Automatic per-route code-splitting; landing pages don't ship the dispatcher bundle.
- Middleware-level auth gives a single chokepoint for JWT verification.
- File-based routing matches the role-based mental model 1:1.

**Negative**
- We use `'use client'` on the vast majority of pages today — server-component opportunity is mostly unused. Tracked as P2 in `docs/operations/audit-2026-05-12-deep.md` ("most pages are client components"). Practical effect: client bundles are larger than they need to be for routes that could be server-rendered.
- App Router has a real learning curve; some routes had early-life hydration mismatches that took time to diagnose.
- We don't run on Vercel — many of Next 15's deployment optimizations are wasted on `next start` behind nginx in a Docker image.

**Neutral**
- Edge runtime in middleware constrains what crypto and Node APIs are available — JWT verification uses `jose` rather than `jsonwebtoken` for compatibility.
- Migration from Pages Router was never needed because we started on App Router; we don't carry that debt.

## References

- Code: `apps/web/src/app/`, `apps/web/src/middleware.ts`
- Audit: `docs/operations/audit-2026-05-12-deep.md` (P2 — server-component opportunity)
- Related ADRs: ADR-0004 (JWT 24h no-refresh — middleware is where the verification runs)
