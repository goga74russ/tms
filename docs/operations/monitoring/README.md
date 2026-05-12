# TMS v2 — Monitoring

Index of monitoring artifacts for the pilot launch. All files in this directory are **templates**: metrics need to be wired before the alerts mean anything. Tracking issue: see `bug-tracker.md` → `OBS-*`.

## Files

| File | What it is |
|------|------------|
| [`prometheus-rules.yml`](./prometheus-rules.yml) | 8 alerting rules: error rate, latency, DB/Redis/disk/memory health, queue backlog, cert expiry. Drop into `/etc/prometheus/rules/`. |
| [`grafana-dashboard.json`](./grafana-dashboard.json) | Grafana 11 dashboard with 7 placeholder panels (req rate, error rate, p50/95/99 latency, DB conns, Redis ops, BullMQ depth, container memory). Import via Grafana UI → New → Import. |
| [`alert-rules.md`](./alert-rules.md) | Per-rule explanation: meaning, threshold rationale, tuning advice, SEV mapping, exporter wiring checklist. |

## Related (outside this folder)

- [`../runbook.md`](../runbook.md) — incident response playbook (5 typical incidents + severity ladder).
- [`../pre-launch-checklist.md`](../pre-launch-checklist.md) — go/no-go gate items.
- [`../deployment.md`](../deployment.md) — deploy procedure and rollback.

## Deploying the stack

Three reasonable paths for a pilot-stage TMS:

1. **Yandex Cloud Monitoring** — minimal ops effort if you're already on Yandex VMs. Push metrics via the unified agent; alerts route to Telegram/email out of the box. Weakness: limited PromQL dialect, harder to migrate later.
2. **Grafana Cloud (free tier)** — 10k active series and 14-day retention cover the pilot footprint. Run `node_exporter`, `cadvisor`, `postgres_exporter`, `redis_exporter`, and `blackbox_exporter` on the production VM; ship to Grafana Cloud via the Grafana Agent. Alerting included. **Recommended for pilot launch.**
3. **Self-hosted Prometheus + Grafana + Alertmanager** — full control, no external dependency, ~150MB RAM overhead. Add a `docker-compose.observability.yml` alongside `docker-compose.prod.yml`. Migrate here once we exceed Grafana Cloud's free tier (~10 customers).

Whichever you pick, the rule expressions in `prometheus-rules.yml` and the panel placeholders in `grafana-dashboard.json` are portable — only the datasource UID and scrape configuration change.
