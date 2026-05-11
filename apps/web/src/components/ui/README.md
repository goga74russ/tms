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
