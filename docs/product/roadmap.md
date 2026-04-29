# Roadmap

Updated: 2026-04-29

## Active Free Hardening Batch - 2026-04-29

- ETRN mock/provider layer plus XSD/fixture gate for local validation without paid operator access.
- High-traffic UI copy and encoding cleanup, especially finance, tariffs, claims, print forms, and admin tariff screens.
- UI copy cleanup started: priority finance/tariffs/claims/print/admin tariff screens audited, with obvious mojibake fixes applied where safe.
- Document queue / close-gate improvements and printable exception forms for refusal or cancellation-after-arrival.
- Mobile pilot evidence runbook for Android/emulator LAN testing with repeatable screenshots/checklist.
- Batch 2: free remaining-edge hardening for shipment/multistop UI, tariff rule evidence, repair/return/close-flow links, and mobile conflict/retake/correction UX.
- Integration owner: keep Docker localhost current and rerun web/API/mobile smoke after merging agent work.

## P0. Make v2 A Clean Working Base

- Keep `D:\Ai\TMS-prod` as the active workspace.
- Keep `D:\Ai\TMS` as archive/reference only.
- Remove or quarantine production-risk scripts.
- Fix visible mojibake in user-facing strings.
- Recreate a minimal test and smoke evidence pack.
- Document env vars, deploy, rollback, and release gates.
- Add free P0 automation: GitHub Actions, local P0 runner, multi-tenant smoke, and backup/restore drill.

## P1. Bring Mobile Into v2

- Copy the archived Expo app from `D:\Ai\TMS\apps\mobile`.
- Align package versions with v2 workspace policy.
- Verify auth against `/api/auth/mobile/login`.
- Verify trip list, trip detail, checkpoints, delivery confirmation, mechanic inspection, uploads, mobile trip blockers, and offline queue replay for checkpoint/completion.
- **Mandatory before pilot/release:** run the app on a real Android device or emulator against a LAN API URL and save UI evidence for login, trip list, checkpoint, and completion.
- Decide whether mobile is shipped as part of v2 production or kept as pilot-only.

## P2. Compliance-First Track

- Select one EPD/ETRN operator integration target.
- Add provider adapter interface.
- Add sandbox adapter behind feature flags.
- Add XSD validation for generated ETRN fixtures.
- Design KEP/MChD/certificate storage and threat model.
- Add provider callback verification and idempotency.
- Add QR/offline document availability for drivers.

## P3. Operational Process Track

- Implement Operational Core v2 schema and migration: shipment lots, trip lot assignments, shipment facts, document dossier items, and compatibility backfill.

- * Order splitting / partial shipment model: one customer order can become multiple shipment lots, trips, vehicles, actual deliveries, and billing lines.
- * Partial loading/delivery and discrepancy acts: planned vs actual weight/quantity, shortages, damage, photos, signatures, and claim hooks.
- * Vehicle/cargo compatibility matrix: payload, volume, body type, trailer, temperature/special conditions, loading method, and restrictions.
- * Document dossier enforcement: required docs, EPD receipts, paper exceptions, signed scans, return control, and close blockers.
- * Claims and penalties module: delays, no-show, downtime, shortage, damage, rejected documents, responsible party, settlement impact, and finance actions.
- * Operational edge-case backlog: multi-order trips, multi-stop, переадресация, возвраты, простой, dangerous/perishable/oversized cargo, offline driver flow, tachograph/rest risk.

## P4. Operational Fleet Track

- Integrate real GPS/Wialon/GLONASS data.
- Add route plan/fact and deviation events.
- Add fuel norms and richer odometer consistency checks.
- Expand fleet health, KTG, downtime, and maintenance analytics.
- Add repair stock, receipts, write-offs, suppliers, and procurement.

## P5. Market Readiness

- * UX polish by role: dispatcher cockpit and finance/ETRN actions are partly done; continue clear next actions, empty/error states, Russian copy, and browser screenshot evidence.
- Create demo environment and demo data.
- Add customer-facing product docs.
- Add integration guides for 1C, SAP, WMS, GPS, and EDO.
- Add observability, alerting, CI/CD release enforcement, and backup monitoring.
- Prepare Russian software registry and sales/support packaging if needed.
