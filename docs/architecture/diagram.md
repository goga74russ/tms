# TMS — System at a Glance

This is the **single-page** architectural picture: who talks to what, how data flows through a typical trip, and what the core entities look like.

For deeper dives, jump to [Where to read more](#where-to-read-more).

---

## 1. High-level component diagram

```mermaid
flowchart LR
    %% --- External users ---
    Dispatcher["Dispatcher<br/>web"]
    Driver["Driver<br/>mobile"]
    Client["Client<br/>web"]
    Admin["Admin<br/>web"]

    %% --- Edge ---
    Nginx["nginx<br/>TLS · rate limit · static"]

    %% --- Apps ---
    Web["Next.js<br/>apps/web"]
    Api["Fastify<br/>apps/api"]
    Mobile["Expo / RN<br/>apps/mobile<br/>offline-first"]

    %% --- Data plane ---
    Postgres[("Postgres 16")]
    Redis[("Redis 7")]
    Minio[("MinIO / S3")]

    %% --- Async ---
    Workers["BullMQ workers<br/>wialon · fines · notif · billing · edi"]

    %% --- External providers ---
    Gosklyuch["Госключ<br/>signature"]
    Diadoc["Diadoc<br/>EDI"]
    Wialon["Wialon<br/>telematics"]
    Crpt["ЦРПТ<br/>marking"]
    Yookassa["ЮKassa<br/>payments"]
    Smtp["SMTP<br/>email"]
    Ofd["ОФД<br/>fiscal"]
    Claude["Anthropic Claude<br/>co-pilot (optional)"]

    %% --- Edges: users → edge → apps ---
    Dispatcher --> Nginx
    Client --> Nginx
    Admin --> Nginx
    Driver -->|HTTPS / WS| Nginx
    Nginx --> Web
    Nginx --> Api
    Web -->|fetch| Api
    Mobile -->|REST + WS| Api

    %% --- Apps → data plane ---
    Api --> Postgres
    Api --> Redis
    Api --> Minio
    Workers --> Postgres
    Workers --> Redis

    %% --- Workers → providers ---
    Api -->|enqueue| Workers
    Workers --> Wialon
    Workers --> Diadoc
    Workers --> Crpt
    Workers --> Yookassa
    Workers --> Smtp
    Workers --> Ofd
    Api --> Gosklyuch
    Api -. optional .-> Claude
```

---

## 2. Core operational flow: order → trip → delivery → close

```mermaid
sequenceDiagram
    autonumber
    actor Disp as Dispatcher
    actor Drv as Driver (mobile)
    participant Api as Fastify API
    participant DB as Postgres
    participant Q as BullMQ
    participant Tel as Wialon

    Disp->>Api: POST /api/orders (cargo, route, client)
    Api->>DB: INSERT order + event
    Disp->>Api: POST /api/trips (assign vehicle + driver)
    Api->>DB: INSERT trip + event
    Api->>Q: enqueue trip telemetry subscribe
    Q->>Tel: subscribe(vehicle_id)

    Disp->>Api: POST /api/waybills (waybill-first)
    Api->>DB: INSERT waybill (status=draft)

    Drv->>Api: POST /api/inspections (pre-trip, photos)
    Api->>DB: INSERT inspection + event<br/>(trigger blocks unsafe release)
    Disp->>Api: POST /api/waybills/:id/release
    Api->>DB: UPDATE waybill status=in_progress + event

    loop While in transit
        Tel-->>Api: position updates (via worker)
        Api->>DB: INSERT vehicle_position
        Api-->>Disp: WS broadcast position
    end

    Drv->>Api: POST /api/trips/:id/delivery (photo, signature)
    Api->>DB: UPDATE trip status=delivered + event
    Drv->>Api: POST /api/inspections (post-trip)
    Disp->>Api: POST /api/waybills/:id/close
    Api->>DB: UPDATE waybill status=closed + event
    Api->>Q: enqueue billing + EDI dispatch
```

---

## 3. Core entities (compact ER)

```mermaid
erDiagram
    organizations ||--o{ users : has
    organizations ||--o{ drivers : employs
    organizations ||--o{ vehicles : owns
    organizations ||--o{ orders : creates
    organizations ||--o{ trips : runs
    organizations ||--o{ waybills : issues
    organizations ||--o{ events : audits

    users ||--o| drivers : "linked via user_id"
    drivers ||--o{ trips : assigned
    vehicles ||--o{ trips : "used in"

    orders ||--o{ trips : "fulfilled by"
    trips ||--|| waybills : "1:1 (waybill-first)"
    trips ||--o{ events : emits
    waybills ||--o{ events : emits

    organizations {
        uuid id PK
        text name
        text inn
        timestamp created_at
    }
    users {
        uuid id PK
        uuid organization_id FK
        text email
        text password_hash
        jsonb roles
    }
    drivers {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        text full_name
        text license_no
    }
    vehicles {
        uuid id PK
        uuid organization_id FK
        text plate
        text vin
    }
    orders {
        uuid id PK
        uuid organization_id FK
        jsonb cargo
        jsonb route
        text status
    }
    trips {
        uuid id PK
        uuid organization_id FK
        uuid order_id FK
        uuid driver_id FK
        uuid vehicle_id FK
        text status
    }
    waybills {
        uuid id PK
        uuid organization_id FK
        uuid trip_id FK
        text number
        text status
    }
    events {
        uuid id PK
        uuid organization_id FK
        text aggregate_type
        uuid aggregate_id
        jsonb payload
        timestamp occurred_at
    }
```

> The `events` table is append-only at the DB level — see [ADR-0003](./adr/0003-append-only-event-journal.md).

---

## Where to read more

- [`docs/operations/wave-summary.md`](../operations/wave-summary.md) — chronological build history (waves 1–6 + rounds 1–3).
- [`docs/architecture/overview.md`](./overview.md) — older system snapshot (kept for context; supersedes by this doc).
- [`docs/architecture/operational-core-v2.md`](./operational-core-v2.md) — deep dive on the order → trip → waybill model.
- [`docs/architecture/adr/`](./adr/) — Architectural Decision Records (numbered, immutable).
- [`docs/api/openapi.md`](../api/openapi.md) — full REST API surface (296 routes).
