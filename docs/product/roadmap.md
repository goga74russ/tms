# Roadmap

Updated: 2026-04-28

## P0. Make v2 A Clean Working Base

- Keep `D:\Ai\TMS-prod` as the active workspace.
- Keep `D:\Ai\TMS` as archive/reference only.
- Remove or quarantine production-risk scripts.
- Fix visible mojibake in user-facing strings.
- Recreate a minimal test and smoke evidence pack.
- Document env vars, deploy, rollback, and release gates.

## P1. Bring Mobile Into v2

- Copy the archived Expo app from `D:\Ai\TMS\apps\mobile`.
- Align package versions with v2 workspace policy.
- Verify auth against `/api/auth/mobile/login`.
- Verify trip list, trip detail, checkpoints, delivery confirmation, mechanic inspection, uploads, and offline queue.
- Decide whether mobile is shipped as part of v2 production or kept as pilot-only.

## P2. Compliance-First Track

- Select one EPD/ETRN operator integration target.
- Add provider adapter interface.
- Add sandbox adapter behind feature flags.
- Add XSD validation for generated ETRN fixtures.
- Design KEP/MChD/certificate storage and threat model.
- Add provider callback verification and idempotency.
- Add QR/offline document availability for drivers.

## P3. Operational Fleet Track

- Integrate real GPS/Wialon/GLONASS data.
- Add route plan/fact and deviation events.
- Add fuel norms and richer odometer consistency checks.
- Expand fleet health, KTG, downtime, and maintenance analytics.
- Add repair stock, receipts, write-offs, suppliers, and procurement.

## P4. Market Readiness

- Create demo environment and demo data.
- Add customer-facing product docs.
- Add integration guides for 1C, SAP, WMS, GPS, and EDO.
- Add observability, alerting, CI/CD release enforcement, and backup monitoring.
- Prepare Russian software registry and sales/support packaging if needed.

