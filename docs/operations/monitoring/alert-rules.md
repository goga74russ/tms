# Alert rules — meaning, tuning, on-call mapping

Companion to [`prometheus-rules.yml`](./prometheus-rules.yml). Every rule below is a **template** — most metrics still need to be wired. See "Wiring checklist" at the bottom.

---

## Rule reference

### 1. `HighRequestErrorRate` — SEV-2

- **Meaning.** More than 5% of HTTP responses from `api` or `web` returned 5xx, sustained for 5 minutes.
- **Why this threshold.** Healthy steady state is < 0.5% 5xx (mostly 502 during deploys). 5% is well past noise and below the panic level (>20% usually means full outage = SEV-1 via `DatabaseDown` / `RedisDown`).
- **Tuning.** If you see flapping during deploys, switch `for: 5m` → `for: 10m` and exclude deploys with a `deploy_in_progress=1` recording rule.
- **On-call.** SEV-2 — ack within 30 min, fix within 4h. Escalate to SEV-1 if combined with `DatabaseDown` or `HighRequestLatency`.

### 2. `HighRequestLatency` — SEV-2

- **Meaning.** p99 of `api` HTTP request duration > 2 seconds for 5 minutes.
- **Why this threshold.** TMS dispatcher cockpit polls every 2–5s; latency > 2s makes the UI feel broken. p99 is conservative — p95 > 1s is the leading indicator.
- **Tuning.** Add a per-route version once `route` label is on the histogram (`/api/trips`, `/api/temperature/*`, `/api/admin/*`). Different routes deserve different SLOs.
- **On-call.** SEV-2. Most common root cause: slow query without index, or BullMQ worker hogging the event loop.

### 3. `DatabaseDown` — SEV-1

- **Meaning.** `postgres_exporter` reports `pg_up=0` for 1 minute.
- **Why this threshold.** Anything > 60s of Postgres downtime is customer-visible. Below that, Drizzle's connection retry usually masks it.
- **Tuning.** None — wake on-call. If genuine, runbook **INC-1**.
- **On-call.** SEV-1, page immediately.

### 4. `RedisDown` — SEV-1

- **Meaning.** `redis_exporter` reports `redis_up=0` for 1 minute.
- **Why this threshold.** BullMQ workers will retry forever, but no new jobs can be enqueued — Telematics ingestion (Wialon), ФССП fines sync, and notification fanout stall.
- **Tuning.** None.
- **On-call.** SEV-1. Runbook **INC-2**.

### 5. `QueueBacklog` — SEV-2

- **Meaning.** Any of the BullMQ queues (`wialon`, `fines`, `notification`, `billing`, `edi`) has > 100 waiting jobs for 10 minutes.
- **Why this threshold.** Normal steady-state is < 20 waiting per queue. 100+ for 10 min means a worker crashed or a job is blocking concurrency.
- **Tuning.** Per-queue overrides — `notification` can spike to 500 during a mass dispatch and self-drain in 2 min, so consider `for: 15m` for that queue specifically.
- **On-call.** SEV-2. Runbook **INC-2**.

### 6. `DiskFull` — SEV-2

- **Meaning.** Root filesystem > 85% used for 5 minutes.
- **Why this threshold.** Postgres goes read-only at ~95%; 85% gives ~2 hours of headroom on a typical 100GB disk.
- **Tuning.** Add per-mountpoint rules if MinIO data is on a separate volume — that needs a tighter threshold (75%) because S3-style storage fills faster.
- **On-call.** SEV-2 during business hours, SEV-1 if `pg_*` writes are already failing. Runbook **INC-5**.

### 7. `HighMemoryUsage` — SEV-2

- **Meaning.** Any tracked container's RSS exceeded 80% of its compose `mem_limit` for 5 minutes.
- **Why this threshold.** OOM-killer triggers at 100%; 80% gives a 5-minute warning window. Compose limits per `docker-compose.prod.yml`: postgres 2G, redis 384M, minio 512M, api 1G, web 1G, nginx 128M.
- **Tuning.** Per-container thresholds — Postgres typically idles at 60% (shared_buffers + work_mem), so 80% for 5 min is fine. Node services (api/web) should idle < 40%; 80% there is a leak signal.
- **On-call.** SEV-2. For Postgres → runbook **INC-1**. For api → check for unbounded array accumulation in handlers.

### 8. `CertExpiringSoon` — SEV-3

- **Meaning.** Earliest cert in chain expires in < 14 days.
- **Why this threshold.** Let's Encrypt renewal runs daily; 14 days = 14 retry windows before customer-visible breakage. Tighter (7d) risks paging on long weekends; looser (30d) is noise.
- **Tuning.** None.
- **On-call.** SEV-3 next business day. Runbook **INC-3**.

---

## Severity → on-call mapping

| Severity | Wake on-call?         | Ack SLA     | Fix SLA           |
|----------|------------------------|-------------|-------------------|
| SEV-1    | Yes, immediately       | 5 min       | 1 hour (or rollback) |
| SEV-2    | Business hours only    | 30 min      | 4 hours            |
| SEV-3    | No                     | Next BD     | Next release       |
| SEV-4    | No                     | Next sprint | Backlog            |

Routing: Alertmanager → Telegram bot `@tms_ops_bot` (SEV-1, SEV-2) → email `ops@tms.example` (all). PagerDuty/Opsgenie planned post-pilot.

---

## Wiring checklist

| Exporter / source       | Provides                                          | Status |
|-------------------------|---------------------------------------------------|--------|
| `node_exporter`         | `node_filesystem_*`, `node_memory_*`, load avg   | TODO   |
| `cadvisor`              | `container_memory_rss`, `container_spec_*`        | TODO   |
| `postgres_exporter`     | `pg_up`, `pg_stat_*`, connection counts           | TODO   |
| `redis_exporter`        | `redis_up`, `redis_commands_processed_total`      | TODO   |
| `blackbox_exporter`     | `probe_ssl_earliest_cert_expiry`, HTTP probes     | TODO   |
| `fastify-metrics`       | `http_requests_total`, `http_request_duration_*`  | TODO — add to `apps/api/src/server.ts` |
| Custom BullMQ exporter  | `bullmq_jobs_waiting`, `bullmq_jobs_active`       | TODO — sketch in `apps/api/src/admin/metrics.ts` |

### Setup steps (self-hosted)

```bash
# 1. Add exporters as sidecars in docker-compose.observability.yml
#    (separate compose file so production stack stays clean)
docker compose -f docker-compose.observability.yml up -d

# 2. Configure prometheus.yml scrape jobs:
#    - job_name: 'tms-api'
#      static_configs: [{ targets: ['api:9090'] }]
#    - job_name: 'node'
#      static_configs: [{ targets: ['node-exporter:9100'] }]
#    - job_name: 'cadvisor'
#      static_configs: [{ targets: ['cadvisor:8080'] }]
#    - job_name: 'postgres'
#      static_configs: [{ targets: ['postgres-exporter:9187'] }]
#    - job_name: 'redis'
#      static_configs: [{ targets: ['redis-exporter:9121'] }]
#    - job_name: 'blackbox-https'
#      metrics_path: /probe
#      params: { module: [http_2xx] }
#      static_configs: [{ targets: ['https://tms.example'] }]
#      relabel_configs:
#        - source_labels: [__address__]
#          target_label: __param_target
#        - target_label: __address__
#          replacement: blackbox-exporter:9115

# 3. Hook alertmanager → Telegram (alertmanager.yml):
#    receivers:
#      - name: telegram-sev1
#        telegram_configs:
#          - bot_token_file: /etc/alertmanager/telegram_token
#            chat_id: -1001234567890
#            send_resolved: true
```

### Picking a hosted alternative

If self-hosting Prometheus+Grafana+Alertmanager is overkill for the pilot:
- **Yandex Cloud Monitoring** — native fit for the Yandex-hosted region, ~₽2k/month for the pilot footprint. Limited PromQL.
- **Grafana Cloud free tier** — 10k series, 14-day retention, Alerting included. Best dev-ex, requires outbound HTTPS.
- **Better Stack** — simpler, prettier, more expensive (~$25/mo at our scale), bundles uptime + incident.

Recommended for pilot: **Grafana Cloud free tier** with all exporters running on the VM. Migrate to self-hosted at ~10 customers.
