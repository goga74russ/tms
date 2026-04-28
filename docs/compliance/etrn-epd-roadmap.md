# ETRN / EPD Roadmap

Updated: 2026-04-28

## Current Foundation

TMS v2 already has:

- ETRN XML/export foundation.
- Internal persisted transport documents.
- Document history and lifecycle.
- Provider-style exchange attempts.
- Provider receipts and callback-style events.
- ETRN workflow endpoints.

## Not Yet Complete

The product must not claim legally complete EDO/EPD exchange until these are implemented and tested:

- accredited operator integration
- GIS EPD exchange contour
- KEP/UKEP signing
- MChD and signer authority verification
- certificate lifecycle
- official XSD validation gate
- provider callbacks with idempotency and verification
- provider UAT receipts
- driver QR/offline document access

## Implementation Slices

### Slice 1. Operator Decision

- Pick one operator or sandbox target.
- Freeze payload and API contract.
- Define feature flags and fallback modes.

### Slice 2. Adapter Layer

- Add provider adapter interface.
- Implement sandbox adapter.
- Persist request/response metadata.
- Add idempotency keys.

### Slice 3. Validation

- Add XSD validation for generated fixtures.
- Add CI validation for supported document titles.
- Add user-facing validation errors before sending.

### Slice 4. Signing

- Define signing model.
- Add KEP/MChD/certificate threat model.
- Decide whether signing is local, operator-hosted, or delegated.

### Slice 5. Mobile Driver Flow

- Show active documents.
- Store QR/offline access where legally allowed.
- Support driver confirmations and document status updates.

### Slice 6. Production UAT

- Send title.
- Receive acceptance/rejection.
- Retry failed exchange.
- Reconcile final status.
- Capture release evidence.

