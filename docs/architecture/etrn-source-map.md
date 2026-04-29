# ETRN source map

Updated: 2026-04-29

Authoritative local source: `D:\Ai\TMS\docs\etrn`.

The folder contains the FNS format package for electronic transport documents, including ETRN exchange files from Order No. ED-7-26/1065@. Treat these files as the source of truth for the ETRN implementation in `TMS-prod`; product docs and code labels must be derived from this folder, not from memory.

## Local source files

| File | Meaning in product terms | Current implementation mapping |
|---|---|---|
| `pril1.md` | Main ETRN format description: required/optional exchange files, file naming, tables, XML rules, signer roles, MChD/power-of-attorney fields | Must drive ETRN workflow docs and validation backlog |
| `pril1_1065.docx` | Original appendix 1 source for ETRN | Reference/source archive |
| `pril2_1065.docx` | Appendix 2 source | Reference/source archive |
| `pril3_1065.docx` | Appendix 3 source | Reference/source archive |
| `ON_TRNACLGROT_1_973_01_05_01_02.xsd` | Title 01: shipper information / ETRN initiation | `EtrnTitleType.TITLE_01` |
| `ON_TRNACLPPRIN_1_973_02_05_01_01.xsd` | Title 02: carrier acceptance of cargo for transportation | `EtrnTitleType.TITLE_02` |
| `ON_TRNPEREADR_1_973_03_05_01_01.xsd` | Title 03: readdressing / consignee or delivery point change | `EtrnTitleType.TITLE_03` |
| `ON_TRNZAMEN_1_973_04_05_01_01.xsd` | Title 04: vehicle and/or driver replacement | `EtrnTitleType.TITLE_04` |
| `ON_TRNACLGRPO_1_973_05_05_01_01.xsd` | Title 05: consignee acceptance of cargo | `EtrnTitleType.TITLE_05` |
| `ON_TRNACLPVYN_1_973_06_05_01_01.xsd` | Title 06: carrier delivery / cargo handover to consignee | `EtrnTitleType.TITLE_06` |
| `ON_TRNPUDPER_1_973_07_05_01_03.xsd` | Title 07: carrier primary accounting document / service result and freight charge | `EtrnTitleType.TITLE_07`; use `01_03` as current local baseline |
| `ON_TRNPUDPER_1_973_07_05_01_02.xsd` | Older Title 07 version | Keep only for version-diff checks |
| `ON_TRNPUDGO_1_973_08_05_01_01.xsd` | Title 08: shipper confirmation of the primary accounting document | `EtrnTitleType.TITLE_08` |
| `ON_SOPVEDPER_1_974_01_05_01_01.xsd` | Accompanying statement, carrier information | Not modeled as first-class document yet |
| `ON_SOPVEDGO_1_974_02_05_01_01.xsd` | Accompanying statement, shipper information | Not modeled as first-class document yet |
| `ON_SOPVEDGP_1_974_03_05_01_01.xsd` | Accompanying statement, consignee information | Not modeled as first-class document yet |
| `ON_ZAKAZNAR_1_975_01_05_01_01.xsd` | Electronic order/job request base document | Not modeled as first-class document yet |
| `ON_ZAKAZNARSOG_1_975_02_05_01_01.xsd` | Order/job request approval/agreement | Not modeled as first-class document yet |
| `ON_ZAKAZNARPOD_1_975_03_05_01_01.xsd` | Order/job request confirmation | Not modeled as first-class document yet |
| `ON_ZAKAZNARVOZ_1_975_04_05_01_01.xsd` | Carrier response/transportation order part | Not modeled as first-class document yet |

## Mandatory ETRN lifecycle

The main ETRN flow has four mandatory exchange files:

1. Title 01: shipper initiates the ETRN with parties, contract terms, vehicle/driver, cargo, accompanying documents, and loading facts.
2. Title 02: carrier accepts cargo for transportation and records acceptance/loading facts.
3. Title 05: consignee accepts cargo from the carrier and records actual accepted cargo and acceptance circumstances.
4. Title 06: carrier records cargo delivery/handover to the consignee.

Optional exchange files become mandatory when the corresponding business event happens:

- Title 03 for readdressing.
- Title 04 for vehicle/driver replacement.
- Title 07 and Title 08 when ETRN is used as a primary accounting document for the performed transportation service.
- Accompanying statements and order/job request documents when the business process requires them.

## Implementation notes

- `apps/api/src/modules/trips/transport-documents.ts` already models `TITLE_01` through `TITLE_08`, but the next code pass must rename labels/descriptions to match this source map.
- Current `TransportDocumentType` only has `waybill`, `delivery_confirmation`, and `document_return`. Real ETRN files are currently projected as workflow titles, not as persisted per-title XML artifacts.
- `transport_documents` persistence exists now, but it stores the transport document bundle projection. A complete ETRN implementation needs per-title artifact rows with `artifactKind`/`documentType`/`titleType` tied to the XSD source file and version.
- XML generation/validation must use the local XSD package, especially `ON_TRNPUDPER_1_973_07_05_01_03.xsd` for Title 07.
- MChD/power-of-attorney, signer role, refusal/rejection, callback receipt, retry, and archive rules must be implemented against `pril1.md` and the specific XSD constraints.

## Product debt created from the source package

| Debt | Why it matters |
|---|---|
| Add first-class ETRN title artifacts | Operators and providers exchange title XML files, not just a generic dossier status. |
| Add XSD validation gate | Without schema validation, we can generate legally invalid XML. |
| Add signer/MChD model | ETRN titles are signed by different parties and sometimes by representatives. |
| Add optional title triggers | Readdressing, replacement, PUD, accompanying statements, and order/job request files must appear only when the business event requires them. |
| Add provider callback idempotency per title | Provider receipts/rejections must update the exact title artifact, not only the trip-level bundle. |
| Add immutable archive metadata | Legal document retention needs original XML, signature metadata, provider IDs, timestamps, and status history. |
