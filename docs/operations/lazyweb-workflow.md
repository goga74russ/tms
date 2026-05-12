# Lazyweb-driven design workflow

How we use the [`lazyweb`](https://github.com/lazyweb-dev/lazyweb-mcp) MCP server to inject curated UI references into Claude Code design passes. Used for Cockpit v2, Mobile v2, DataTable Phase 1, and the landing-page redesign.

## What lazyweb is

`lazyweb` is an MCP server that exposes a curated, taggable library of UI screenshots (product names, categories, page types) over the MCP protocol. Tools include:

- `lazyweb_search` — keyword + category search across the library.
- `lazyweb_list_categories` / `lazyweb_list_collections` — browse the taxonomy.
- `lazyweb_find_similar` — given a screenshot, return visually-similar entries.
- `lazyweb_compare_image` — diff against a user-supplied image.
- `lazyweb_health` — server status.

Image URLs in results are **signed and expire after ~1 hour**. Cost: zero — runs locally as an MCP. No API key required.

## The 5-step workflow

We followed this pattern for every lazyweb-driven redesign:

1. **Search** — define the design intent in 2–3 keywords + a category. E.g. `lazyweb_search(query="dispatcher fleet ops live map", category="dashboards")`. Pull top 10–20 hits.
2. **Analyze** — review the returned screenshots in this Claude Code session. Filter for actually-relevant references (same problem class, similar density, similar role).
3. **Synthesize** — pick top 3 references, write a "what to take" note для каждого: layout pattern (3-pane, bottom sheet, etc.), specific elements (sticky header, pill row, color usage), what NOT to copy (e.g. domain-specific iconography).
4. **Dispatch agent** — spawn an implementation agent with: (a) the synthesis, (b) the existing source file path, (c) explicit do/don't constraints (preserve API contracts, keep i18n strings RU, etc.). Image URLs go into the agent prompt — they're 1-hour signed so the agent must act on them while warm.
5. **Apply + verify** — agent returns a diff. Reviewer runs typecheck/tests/screenshot diff. Iterate если drift есть.

## Three real examples

### Example 1 — Dispatcher Cockpit v2 (commit `4001702`)

**Goal:** заменить 1295-line vertical sprawl на true fleet-ops cockpit.

**Queries:**
- `lazyweb_search(query="flight radar live tracking dense", category="dashboards")` → Flightradar24 ref (dense left rail + dominant map + LIVE pills).
- `lazyweb_search(query="route planner driver list sidebar")` → Zeo Route Planner.
- `lazyweb_search(query="transit disruption management")` → Optibus disruption UI.

**References picked (top 3):**
1. **Flightradar24** — for left rail density, color-pill summary at top, map-dominant layout.
2. **Zeo Route Planner** — for the driver/vehicle list pattern в right panel.
3. **Optibus** — for the blocker/risk/ok severity grouping pattern в left rail.

**Outcome:** 3-pane layout `TopBar + LeftRail (320px) + Map (flex-1) + RightPanel (360px)`. New components `CockpitTopBar / CockpitLeftRail / CockpitRightPanel` в `apps/web/src/app/dispatcher/components/`. Soft-launch dark-mode toggle. Responsive collapses под 1280/1024 breakpoints. B-22 i18n bug surfaced + fixed as part of pass.

### Example 2 — Mobile driver app v2 (commit `b966aa2`)

**Goal:** заменить bland card-list aesthetic на modern driver UX comparable to Uber Driver / DoorDash / Zeo.

**Queries:**
- `lazyweb_search(query="uber driver dark sheet map")` → Uber Driver navigation screen.
- `lazyweb_search(query="proof of service photo signature wizard")` → Zeo POS wizard.
- `lazyweb_search(query="order complete success summary")` → DoorDash Order Complete.

**References picked:**
1. **Uber Driver** — dark bottom sheet over map для TripDetailsScreen.
2. **Zeo Proof-of-Service** — 3-step wizard (Photo → Signature → Details) для DeliveryConfirmationScreen.
3. **DoorDash Order Complete** — top map + bottom sheet + icon timeline для TripCompletionScreen.

**Outcome:** `apps/mobile/src/theme/tokens.ts` + 8 UI components + полный redesign 10 экранов. Zero new npm packages, all animations via bare Animated API.

### Example 3 — DataTable Phase 1 (commit `97686f5`)

**Goal:** заменить 5 разнородных listing-страниц на единый dense data table primitive.

**Queries:**
- `lazyweb_search(query="Linear issues list dense", category="data-tables")` → Linear.
- `lazyweb_search(query="admin user management ultra dense")` → MLB-b admin.
- `lazyweb_search(query="Stripe customers list search pills")` → Stripe customers.

**References picked:**
1. **Linear** — dense rows + sticky header + hover row actions.
2. **MLB-b admin** — ultra-density (28px row) и sticky-left column treatment.
3. **Stripe customers** — search-first toolbar + pill status + 3-dot row menu.

**Outcome:** `data-table.tsx` primitive с sticky header, sticky-left column, sort, search с `/` shortcut, filter dropdowns, bulk-select, 3-dot row actions, 3 density modes, pagination, column visibility menu, localStorage persistence. Applied to contractors / admin/users / drivers / trips / waybills.

## When to use lazyweb

**Good fit:**
- Greenfield design where у вас нет mental model шаблона (e.g. fleet-ops cockpit).
- Redesign-полный exercise где нужно радикально сменить aesthetic.
- Pattern validation — есть идея, хочется проверить что best-in-class делает так же.
- Density inspiration — какой row height приемлем для $TARGET_ROLE.

**Bad fit:**
- РФ-specific UI (ИНН, ОГРН, ЭДО, ETrN) — lazyweb library западная, references вводят в заблуждение.
- Backend / API design — это другой domain.
- Bug fixing — lazyweb не покажет почему ваш `flex` ломается.
- Iteration на existing strong design — overhead больше gain.
- Когда у customer'а есть свой brand guide — там lazyweb лишний.

## Practical gotchas

- **Signed URL TTL ~1 hour.** Если делаете review через несколько часов после search — URLs expired. Mitigation: snapshot top 3 references to `/tmp` через bash `curl` before the review starts. Embed locally в notes.
- **No semantic understanding.** lazyweb matches keywords + tags. Если ваш query слишком abstract ("clean modern", "professional"), get noise. Лучше: "list view dense sticky 3-dot menu pills".
- **No РФ-specific subset.** Library не знает про Госключ, Контур.Диадок, ОФД UI patterns. Используйте только для chrome/layout/density, не для domain widgets.
- **Compare image is fuzzy.** `lazyweb_compare_image` returns visual similarity, not "this is the same pattern". Useful для ruling things in, не для ruling things out.

## Recommended addition: snapshot top 3 to /tmp

Before dispatching an implementation agent, drop:

```bash
for url in "${TOP_3_URLS[@]}"; do
  curl -sS "$url" -o "/tmp/lazyweb-ref-$(date +%s)-$(printf "%02d" $i).png"
  ((i++))
done
```

into the agent's pre-flight. Even если signed URLs expire mid-pass, agent has local copies. Saves a re-search cycle when iterating.

## Cost note

Lazyweb runs as a local MCP server. Zero per-query cost, zero rate limits beyond local disk + memory. The only cost is your model's token budget for reviewing the returned screenshots — typically ~500–2000 tokens per pass.
