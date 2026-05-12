# Design System

Inventory of UI primitives and theme tokens shared across web back-office, mobile driver app, and dispatcher cockpit. Updated 2026-05-12, post Round 4 + Cockpit v2 + Mobile v2 + DataTable Phase 1+2.

## Theme tokens

### Web (`apps/web/tailwind.config.js` + `globals.css`)

| Token | Value |
|---|---|
| `brand-{50..950}` | Indigo scale, primary brand |
| `success-{50,500,600,700}` | Green |
| `warning-{50,500,600,700}` | Amber |
| `danger-{50,500,600,700}` | Rose |
| `info-{50,500,600,700}` | Sky |
| `neutral-*` | Slate-aliased |
| `rounded-xl` | 0.875rem |
| `shadow-soft` / `soft-md` / `soft-lg` | Custom shadows |
| Keyframes | `slide-in-right`, `fade-in`, `shimmer` |

CSS vars exposed для ad-hoc styles + status badges в globals.css.

### Mobile (`apps/mobile/src/theme/tokens.ts`)

```ts
colors: {
  brand: '#6366f1',           // indigo-500 violet
  success / warning / danger,
  neutral.50..900,
  surface.{primary, secondary, tertiary, inverse},
  scrim.{light, medium, heavy}
}
spacing: 4, 8, 12, 16, 20, 24, 32
radius: { sm: 6, md: 10, lg: 14, xl: 20, pill: 9999 }
typography: { display, title, headline, body, caption, micro }
shadow: { sm, md, lg } // 3 tiers
touchTarget: { compact: 44, default: 56, hero: 64 }
```

### Light + dark mode

Web — dark-mode toggle на dispatcher cockpit top bar добавляет `dark` класс на `<html>`. Cockpit chrome uses neutral tokens that invert reasonably. Leaflet + existing children keep light styling. <10 lines of conditional code, soft-launch.

Mobile — surface tokens prepared for dark mode но active toggle ещё не wired в Settings.

---

## Web primitives (`apps/web/src/components/ui/`)

### Button (`button.tsx`)

```tsx
<Button variant="brand" isLoading={saving} leftIcon={<Save />}>Сохранить</Button>
<Button variant="outline" size="sm">Отмена</Button>
```

Variants: `default | brand | outline | ghost | destructive | secondary | link`. Sizes: `default | sm | lg | icon`. Props: `isLoading` (spinner + aria-busy), `leftIcon`, `rightIcon`, `fullWidth`. Default `type='button'`.

### Input (`input.tsx`)

```tsx
<Input label="Email" type="email" required leftAddon={<Mail />} error={err} helperText="..." />
```

Props: `label`, `hideLabel`, `error`, `helperText`, `leftAddon`, `rightAddon`. `aria-invalid` + `aria-describedby` auto-wired когда `error`.

### Toast (`toast.tsx`)

Mount `<ToastProvider>` at root. `useToast()` hook returns `{ toast }`.

```tsx
toast({ variant: 'success', title: 'Сохранено', description: '...' });
```

Variants: `default | success | error | warning | info`. Portal top-right, ARIA `role=status`, auto-dismiss 5s (override `duration`, `0` = sticky), `action: { label, onClick }`.

### Skeleton (`skeleton.tsx`)

```tsx
<Skeleton className="h-4 w-32" />
<SkeletonRow columns={4} />
<SkeletonTable rows={5} columns={4} />
```

Animated shimmer placeholder. Use вместо `Загрузка...` text.

### EmptyState (`empty-state.tsx`)

```tsx
<EmptyState icon={Truck} title="..." description="..." action={<Button>...</Button>} tone="brand" />
```

Tones: `neutral | brand | success | warning | danger`.

### Stat (`stat.tsx`)

```tsx
<Stat label="Активные рейсы" value={42} trend="+5" trendType="up" icon={Truck} tone="brand" />
```

Use в 2/4-column responsive grids at the top of dashboard pages.

### DataTable (`data-table.tsx`)

Composable, vanilla (no `@tanstack/react-table`) table with:

- Sticky header + sticky-left column с shadow на h-scroll.
- Per-column sort (chevron asc → desc → off).
- Built-in search input + `/` focus shortcut + `Esc` clear.
- Filter dropdowns (controlled).
- Bulk-select column + bulk-actions strip (replaces search row when selected).
- 3-dot hover row-actions menu.
- `onRowClick` makes rows keyboard-focusable.
- Density modes `compact 32 / comfortable 40 / dense 28`.
- SkeletonRow × pageSize during `loading`.
- Client-side pagination + jump-to-page + page-size select.
- Column visibility menu (persists to `localStorage[dt-cols-<tableId>]`).

```tsx
<DataTable<User>
  tableId="admin-users"
  data={users}
  columns={columns}
  keyField="id"
  loading={loading}
  searchKeys={['fullName', 'email']}
  filters={[{ id: 'role', label: 'Роль', value, onChange, options }]}
  bulkActions={(rows, clear) => <Button>Деактивировать ({rows.length})</Button>}
  rowActions={(row) => [{ id: 'edit', label: 'Изменить', icon: <Edit />, onClick }]}
  onRowClick={(row) => edit(row)}
  pageSize={50}
/>
```

Exports `Pill` helper с 6 tones: `neutral | brand | success | warning | danger | info`.

Applied to: contractors, admin/users, drivers, trips, waybills (Phase 1) + claims, incidents, tariffs, admin/checklists, fleet/VehiclesTable (Phase 2). 10 pages total.

### SideDrawer (`side-drawer.tsx`)

Right-side slide-in с backdrop, body scroll lock, focus restore, Esc-close.

```tsx
<SideDrawer open={!!detail} onClose={...} title={...} subtitle={...} width="md" footer={...}>
  {/* content */}
</SideDrawer>
```

Widths: `sm=400 / md=520 / lg=720 / xl=920` px.

### ErrorBoundary (`error-boundary.tsx`)

```tsx
<ErrorBoundary scope="cold-chain-widget">
  <ColdChainWidget />
</ErrorBoundary>
```

Class boundary, friendly RU fallback + "Повторить" + "Перезагрузить страницу".

### Other UI files

- **dialog.tsx / card.tsx / badge.tsx / select.tsx / table.tsx / tabs.tsx / Combobox.tsx** — shadcn-style primitives, baseline use.
- **data-table-toolbar.tsx** — extracted search/filter/bulk-action strip.

---

## Domain-specific reusables

| Component | Path | Purpose |
|---|---|---|
| `Paywall.tsx` | `apps/web/src/components/Paywall.tsx` | Plan-gating modal (Round 2) |
| `CopilotChat.tsx` | `apps/web/src/components/CopilotChat.tsx` | AI co-pilot dock panel, SSE streaming, tool-call blocks |
| `CopilotFab.tsx` | `apps/web/src/components/CopilotFab.tsx` | Floating 56px gradient FAB bottom-right (Cockpit v2) |
| `OnboardingTour.tsx` | `apps/web/src/components/OnboardingTour.tsx` | SVG-mask spotlight tour, viewport-clamped tooltip, 6 steps + `data-tour` markers, localStorage persist |
| `StickyHeader.tsx` | `apps/web/src/app/landing/components/StickyHeader.tsx` | Landing header с scroll-triggered transition + mobile menu |
| `LegalPageShell.tsx` | `apps/web/src/app/legal/components/LegalPageShell.tsx` | Sticky right TOC + IntersectionObserver active-section |
| `TemperaturePanel.tsx` | `apps/web/src/components/TemperaturePanel.tsx` | recharts LineChart с SLA reference lines, breach dots |
| `DispatcherMap.tsx` | `apps/web/src/app/dispatcher/components/DispatcherMap.tsx` | Leaflet map с vehicle markers, heading rotation, trip routes |

---

## Dispatcher Cockpit (`apps/web/src/app/dispatcher/components/`)

Lazyweb-driven redesign (Cockpit v2, commit `4001702`). См. [lazyweb-workflow.md](lazyweb-workflow.md).

| Component | Role |
|---|---|
| `CockpitTopBar.tsx` | Title + 3 color pills (blocker/risk/ok counts) + search с `/` shortcut + Live/Offline + refresh + dark-mode toggle |
| `CockpitLeftRail.tsx` | 3 collapsible sections (Блокеры N / Риски N / OK N) + Live trips sorted by status priority. Dense rows, severity-toned icon + title + tripNumber + message. Accepts optional `localizeMessage` prop |
| `CockpitRightPanel.tsx` | AssignmentPanel + Vehicles list (search + status filter) + Cold chain alerts. All collapsible |
| `AssignmentPanel.tsx` | Inline assignment form: vehicle + driver + windows + ADR warning panel (warn-only) |
| `DispatcherMap.tsx` | Leaflet map с live 🚛 markers, heading rotation, plate/speed/last-update tooltip. `useWialonPositions` hook (15 s polling) |
| `TripRouteLayer.tsx` | Polyline + waypoint markers for selected trip |
| `VehicleTimeline.tsx` | Per-vehicle timeline strip |

### Responsive

- ≥1280px: both rails open.
- 1024–1279px: right panel auto-collapses, reopen button on map.
- <1024px: both collapse, map fills.

---

## Mobile UI kit (`apps/mobile/src/components/ui/`)

Mobile v2 (commit `b966aa2`, lazyweb-driven). Все 10 экранов redesigned.

| Component | Props |
|---|---|
| `Button` | `variant: primary / secondary / success / danger / warning / ghost`, `size: sm / md / lg`, `isLoading`, `leftIcon`, `rightIcon`, `fullWidth` |
| `Card` | `tone: default / muted / accent`, `elevation: none / sm / md` |
| `Pill` | `tone: success / warning / danger / brand / neutral / info` |
| `ProgressSteps` | Segmented bar (5-seg trip, 3-seg wizards) с current/total |
| `IconTimeline` | DoorDash-style circles + connecting line. Steps `{ label, state: done / active / pending }` |
| `BottomSheet` | Bare `Animated` + `PanResponder` drag (no `react-native-reanimated` dep) |
| `EmptyState` | Icon + title + description + action |
| `KeyValueRow` | Label/value pair, bordered variant |

Все exported из `apps/mobile/src/components/ui/index.ts`. Zero new npm packages.

### Screen → component mapping

| Screen | Key components used |
|---|---|
| LoginScreen | Card, Button, brand-gradient overlay |
| TripListScreen | Card (per-trip), Pill (status), ProgressSteps (5-segment), EmptyState |
| TripDetailsScreen | Card, ProgressSteps, Pill, "next-point" hero card |
| CheckpointScreen | Button (big toned), animated GPS pulse |
| DeliveryConfirmationScreen | ProgressSteps (3-segment wizard), Card (condition radios) |
| MechanicInspectionScreen | Card (per-item), Button (OK/Не ОК), EmptyState, ProgressSteps |
| TripCompletionScreen | IconTimeline (DoorDash), Card (success), KeyValueRow, Pill |
| MyWaybillScreen | Card, KeyValueRow, Pill (status + допуски) |
| TemperatureLogScreen | Card (header + manual + auto), Pill (breach) |
| MyHoursScreen | Card (48px stat + mini fill bars), Pill (breach) |

---

## Do / don't visual rules

1. **Do** use Stat cards for 2–7 KPIs at the top of dashboard pages, not for inline metrics. **Don't** mix Stat with other card heights в одной row — alignment breaks.
2. **Do** use Pill tones consistently: success (green) для positive states, warning (amber) для attention-required, danger (rose) для blocking, brand (indigo) для product highlights, info (sky) для neutral metadata, neutral для inactive/archived. **Don't** invent new tone names.
3. **Do** wrap every async list view in `SkeletonRow × pageSize` (or `SkeletonTable`) during load, и `EmptyState` for empty. **Don't** show plain "Загрузка..." or "Нет данных" text.
4. **Do** put destructive actions behind row 3-dot menus or confirm dialogs. **Don't** put a red "Удалить" button next to a brand "Сохранить" — fat-finger risk.
5. **Do** localize все user-facing strings to Russian. **Don't** leave English engine-emitted error strings visible (см. B-4/B-5/B-15/B-17/B-22/B-27/B-30/B-31/B-32/B-33 в bug-tracker.md — все были этим инцидентом).
