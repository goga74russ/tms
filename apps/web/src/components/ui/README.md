# UI Primitives

Shared building blocks for the web app. All primitives are TypeScript-strict, use Tailwind only, and follow the project's neutral/brand/success/warning/danger tone palette (see `tailwind.config.js`).

## Conventions

- Import via `@/components/ui/<name>`.
- Default to neutral palette; pass `tone` / `variant` to escalate.
- Russian copy for user-facing strings.
- Every interactive primitive ships with proper ARIA (`aria-busy`, `aria-invalid`, `role`).

## Inventory

### Button (`button.tsx`)
```tsx
<Button variant="brand" isLoading={saving} leftIcon={<Save />}>Сохранить</Button>
<Button variant="outline" size="sm">Отмена</Button>
```
Variants: `default | brand | outline | ghost | destructive | secondary | link`. Sizes: `default | sm | lg | icon`. Props: `isLoading`, `leftIcon`, `rightIcon`, `fullWidth`.

### Input (`input.tsx`)
```tsx
<Input
  label="Email"
  type="email"
  required
  leftAddon={<Mail className="h-4 w-4" />}
  error={errors.email}
  helperText="Используется для входа"
/>
```
Props: `label`, `hideLabel`, `error`, `helperText`, `leftAddon`, `rightAddon`. When `error` is set, the field gets a red border + inline message and `aria-invalid`.

### Toast (`toast.tsx`)
Mount `<ToastProvider>` once at the root. Then:
```tsx
const { toast } = useToast();
toast({ variant: 'success', title: 'Сохранено', description: 'Все изменения применены.' });
```
Variants: `default | success | error | warning | info`. Auto-dismisses after 5s (override via `duration`, `0` = sticky). Supports `action: { label, onClick }`.

### Skeleton (`skeleton.tsx`)
```tsx
<Skeleton className="h-4 w-32" />
<SkeletonTable rows={5} columns={4} />
```
Animated shimmer placeholder. Use to replace "Загрузка..." text.

### EmptyState (`empty-state.tsx`)
```tsx
<EmptyState
  icon={Truck}
  title="Нет активных рейсов"
  description="Создайте новый рейс, чтобы он появился здесь."
  action={<Button variant="brand">Создать рейс</Button>}
  tone="brand"
/>
```
Tones: `neutral | brand | success | warning | danger`.

### Stat (`stat.tsx`)
```tsx
<Stat
  label="Активные рейсы"
  value={42}
  trend="+5"
  trendType="up"
  icon={Truck}
  tone="brand"
/>
```
Use in 2/4-column responsive grids at the top of dashboard pages.

### DataTable (`data-table.tsx`)
Composable, vanilla (no `@tanstack/react-table`) table primitive with:
- Sticky header, sticky left column option, density modes (`compact|comfortable|dense`)
- Sortable columns (per-column opt-in), column visibility menu (persisted via `tableId` + localStorage key `dt-cols-<tableId>`)
- Built-in search input (controlled via `searchPlaceholder` + `searchKeys` / `searchPredicate`)
- Filter dropdowns (controlled — parent owns state via `value` / `onChange`)
- Bulk-select column + bulk-actions toolbar that replaces the search row when rows are selected
- Hover row actions menu (3-dot) via `rowActions={(row) => [...]}`
- Optional `onRowClick` makes rows keyboard-focusable (Enter/Space)
- Client-side pagination footer (`pageSize`; pass `0` to disable e.g. when server-paginated)
- Keyboard: `/` focuses search; `Esc` clears search or selection
- Skeleton rows during `loading`; empty state slot via `emptyState`

```tsx
import { DataTable, type Column, Pill } from '@/components/ui/data-table';

const columns: Column<User>[] = [
  { id: 'fullName', header: 'ФИО', accessor: r => r.fullName, sortable: true, sticky: 'left' },
  { id: 'isActive', header: 'Статус', cell: r => <Pill tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Активен' : 'Архив'}</Pill> },
];

<DataTable<User>
  tableId="admin-users"
  data={users}
  columns={columns}
  keyField="id"
  loading={loading}
  searchPlaceholder="Поиск..."
  searchKeys={['fullName', 'email']}
  filters={[{ id: 'role', label: 'Роль', value: roleFilter, onChange: setRoleFilter, options: roleOpts }]}
  bulkActions={(rows, clear) => <Button onClick={() => deactivate(rows)}>Деактивировать ({rows.length})</Button>}
  rowActions={(row) => [{ id: 'edit', label: 'Редактировать', icon: <Edit2 />, onClick: () => edit(row) }]}
  onRowClick={(row) => edit(row)}
  pageSize={50}
/>
```

The exported `Pill` helper provides consistent status badges with tones: `neutral | brand | success | warning | danger | info`.

### SideDrawer (`side-drawer.tsx`)
Right-side slide-in drawer with backdrop, body scroll lock, focus restore, and Esc-to-close.

```tsx
<SideDrawer
  open={!!detail}
  onClose={() => setDetail(null)}
  title={detail?.title}
  subtitle={detail?.subtitle}
  width="md"          // sm=400, md=520, lg=720, xl=920
  footer={<Button onClick={save}>Сохранить</Button>}
>
  {/* detail content */}
</SideDrawer>
```

### PeriodSelector (`period-selector.tsx`)
```tsx
import { PeriodSelector, computeRange, type PeriodRange } from '@/components/ui/period-selector';

const [period, setPeriod] = useState<PeriodRange>(computeRange('mtd'));

<PeriodSelector
  value={period}
  onChange={setPeriod}
  presets={['1w', '4w', 'mtd', 'qtd', 'ytd', 'all']}  // optional, defaults to all 6
/>
```
Horizontal chip row + "Свой период" button revealing native `<input type="date">` pickers. Active chip uses brand-50 bg + brand-700 text + brand-200 border. Russian labels: «Неделя / 4 недели / Месяц / Квартал / Год / Всё». `PeriodRange = { from: Date; to: Date; label: string; preset: Period }`. `computeRange(preset)` is exported for initialising state.

### Sparkline (`sparkline.tsx`)
```tsx
<Sparkline data={[1,3,2,5,4,6,8]} tone="brand" height={32} showArea />
```
Pure-visual mini chart (no axis, no tooltip, no grid). Built on `recharts` (`AreaChart`/`LineChart` already in deps). Tones: `brand | success | danger | neutral | warning`. Returns empty placeholder when `data` is empty.

### MetricCard (`metric-card.tsx`)
```tsx
<MetricCard
  label="Выручка"
  value="78 300 ₽"
  change={{ value: 14, direction: 'up' }}
  changeGood={true}            // false = inverse metric (e.g., overdue debt: up is bad)
  hint="vs прошлый период"
  sparkline={[1,3,2,5,4,6,8]}
  sparklineTone="brand"
  icon={DollarSign}
  tone="success"               // affects icon-circle bg
  href="/finance"              // optional — makes whole card a Link
/>
```
Layout: tiny uppercase label + tone-tinted icon circle on top; large 3xl `tabular-nums` value; bottom row has change badge (▲/▼ with green/red driven by `changeGood`) + hint on left, sparkline on right.

### DashboardHeader (`dashboard-header.tsx`)
```tsx
<DashboardHeader
  title="Финансы и Бухгалтерия"
  subtitle="Управление счетами"
  icon={Wallet}
  iconTone="brand"
  period={period}
  onPeriodChange={setPeriod}
  showPeriodSelector            // default true
  onRefresh={loadData}
  refreshing={loading}
  actions={<Button leftIcon={<Plus />}>Новый счёт</Button>}
/>
```
Title block + iconified tone-tinted square (40×40, rounded-xl). PeriodSelector renders inline at md+ and on its own row below at <md. Refresh icon-button + custom `actions` align right.

### ErrorBoundary (`error-boundary.tsx`)
```tsx
<ErrorBoundary scope="cold-chain-widget">
  <ColdChainWidget />
</ErrorBoundary>
```
Wraps widgets to isolate render failures. Renders friendly Russian fallback with "Повторить" + "Перезагрузить страницу".

## Theme tokens (Tailwind)

Semantic color scales: `brand-{50..950}`, `success-{50,500,600,700}`, `warning-*`, `danger-*`, `info-*`, `neutral-*` (slate-aliased).
Custom: `rounded-xl: 0.875rem`, `shadow-soft`.

CSS vars in `globals.css` expose the same palette for ad-hoc styles + status badges.
