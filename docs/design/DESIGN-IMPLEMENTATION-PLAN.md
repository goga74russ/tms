# Design Implementation Plan — ТрансПульт (для разработчиков)

**От:** Desing (lead designer)
**Кому:** TransPult
**Дата:** 2026-06-12
**Метод:** аудит актуального кода (main) + дизайн‑методология (ui‑ux‑pro‑max, design‑taste, modern‑web)
**Статус:** единый план приведения дизайна в порядок. Связан с [`HOTFIX-modals.md`](./HOTFIX-modals.md), [`HANDOFF-fixes.md`](./HANDOFF-fixes.md).

---

## 0. Сводка приоритетов

| # | Блок | Состояние сейчас | Приоритет | Часов |
|---|---|---|---|---|
| 1 | **Логотип везде** | ✅ ГОТОВО — favicon закоммичен, StickyHeader лого (white↔navy), auth navy | 🔴 P0 | ~2ч |
| 2 | **Цветовая палитра** | ✅ ГОТОВО — brand=navy, accent=teal (применён), 9 семейств → 4 | 🔴 P0 | ~10ч |
| 3 | **Тёмная тема** | 🔄 решение принято — **Вариант B** (доделать), в работе | 🟠 P1 | ~10ч |
| 4 | **Адаптация экранов** | 🟡 4.2 viewport+themeColor ✅; таблицы 4.1 — осталось | 🟠 P1 | ~5ч |
| 5 | **Баннеры/визуал** | 🟡 системные есть, маркетинговых нет | 🟡 P2 | опц. |
| 6 | **Модалки (overlay)** | ✅ ГОТОВО — flex-обёртка применена (HOTFIX-modals) | 🔴 P0 | ~2ч |

**Минимум к показу:** Блоки 1 + 2 + 6 (~14ч). Тема (3) — решение, не обязательна.

> ### 🟢 Статус реализации (TransPult, 2026-06-16)
> **ЭТАП 1 (палитра) закрыт.** Коммиты на `main`: `2dedd3a` (лого/favicon/viewport),
> `bca4a17` (brand→navy + accent→teal), `d01af91` (механич. консолидация),
> `82a56f1` (семантика + judgment, 102 файла), `52636f0` (hardcoded hex),
> `924f77a` (teal-пульс на sidebar/tabs). Палитра: 9 семейств → `brand`(navy) +
> `accent`(teal) + `neutral` + semantic. 0 остатков indigo/gray/slate/teal/emerald/
> amber/red/blue/rose/orange/pink/green. `next build` ✓ 69/69.
> **Осталось:** Блок 3B (тёмная тема, Вариант B) + Блок 4.1 (адаптив таблиц). Не задеплоено.

---

## БЛОК 1 — ЛОГОТИП ВЕЗДЕ 🔴

### Что уже сделано ✅
- `public/logo-mark.svg` + `public/logo-mark-white.svg` на месте
- `components/sidebar.tsx:96` — лого внедрён (`<img src="/logo-mark.svg">`)
- favicon работает 

### Что доделать

#### 1.1 Landing StickyHeader — заменить заглушку
**Файл:** `src/app/landing/components/StickyHeader.tsx:42`
**Сейчас:** `<Truck className="w-5 h-5" />` — иконка lucide вместо лого ❌
**Стало:**
```jsx
// Прозрачная шапка (вверху страницы) — белое лого на тёмном фоне:
<img src="/logo-mark-white.svg" alt="ТрансПульт" className="w-8 h-8 shrink-0" />
// Шапка при скролле (белый фон) — navy лого:
<img src="/logo-mark.svg" alt="ТрансПульт" className="w-8 h-8 shrink-0" />
```
> Шапка меняет фон при скролле (transparent → white) — лого тоже меняй (white ↔ navy) по тому же стейту.

#### 1.2 Auth (login/signup) — проверить
**Файл:** `src/components/auth-split-layout.tsx` — использует logo. Убедиться что это **наш** `/logo-mark.svg`, не старая иконка. На светлой панели auth — navy версия.

#### 1.3 Favicon — ассеты готовы, TransPult: проверить + закоммитить + пересобрать
Favicon ранее **не существовал** (в табе был дефолтный глобус, «ТрансПульт» — это `<title>`, не иконка).

**Ассеты подготовлены Desing** (исходники в `docs/design/brand/favicon.svg`, `apple-icon.svg` — настоящий знак из `logo-mark.svg`, viewBox обрезан под favicon):
- `apps/web/src/app/icon.svg` — favicon в табе (navy знак + teal маршрут + точки)
- `apps/web/src/app/apple-icon.svg` — iOS закладка (белый знак на navy фоне)

**Задача TransPult:**
1. ✅ Файлы уже лежат в `src/app/` (Next.js App Router конвенция — подхватывает автоматически, layout менять не нужно)
2. **Проверить** что попали в git (если untracked — закоммитить)
3. **Пересобрать** (`next build` / dev restart) — favicon появится в табе
4. Hard refresh (Ctrl+Shift+R) — браузеры агрессивно кешируют favicon
5. _(опц.)_ для старых браузеров (IE/old) — `favicon.ico`; SVG icon покрывает все современные

**Acceptance:** в табе браузера — знак ТрансПульт (не глобус); на лендинге — лого (не грузовик‑иконка), меняется white↔navy при скролле; в auth — navy лого; sidebar — ок.

> Ограничение favicon: на 16px тонкий teal‑маршрут частично сольётся (физика 16px). Если мешает — Desing сделает упрощённую favicon‑версию (Т + панель без маршрута) из родных path. Сообщить.

---

## БЛОК 2 — ЦВЕТОВАЯ ПАЛИТРА 🔴 (главная работа)

### Проблема (актуальные числа)

**9 цветовых семейств** живут одновременно:

| Семейство | Кол‑во | Должно быть |
|---|---|---|
| `brand-*` | 371 | ← основа, но токен указывает на indigo! |
| `indigo-*` | 362 | → `brand` |
| `rose-*` | **221** | → `accent`/`danger`/`brand` (medic + др.) |
| `blue-*` | 105 | → `brand`/`info` |
| `orange-*` | 21 | → `brand`/`warning` (mechanic) |
| `gray-*` | 17 | → `neutral` |
| `slate-*` | 5 | → `neutral` |
| `teal-*` | 5 | ← бренд‑акцент, почти не используется! |
| `pink-*` | 3 | → `accent` |

🔴 **Корень №1:** `brand`‑токен в `tailwind.config.js` = **indigo `#6366f1`**, НЕ бренд‑палитра. То есть даже 371 использование `brand-*` рендерит **indigo**, не navy+teal.

### Бренд‑палитра (из логотипа)

```
navy   #111827  primary — текст, шапки, кнопки, тёмные поверхности
blue   #1E40AF  secondary — ссылки, доп. акценты
teal   #14B8A6  accent — CTA, бренд‑пульс, выделение активного
gray   #E5E7EB  divider, disabled
white  #F8FAFC  фон
```

### Шаг 2.1 — Переопределить токены в config (фундамент)

**Файл:** `tailwind.config.js` → `theme.extend.colors`

```js
// brand → navy база (был indigo)
brand: {
  50:  '#f1f5f9',
  100: '#e2e8f0',
  200: '#cbd5e1',
  300: '#94a3b8',
  400: '#475569',
  500: '#1e293b',
  600: '#111827',  // ← primary navy (бренд)
  700: '#0d1320',
  800: '#080c15',
  900: '#04060a',
},
// accent → teal (новый токен, бренд‑пульс)
accent: {
  50:  '#f0fdfa',
  100: '#ccfbf1',
  400: '#2dd4bf',
  500: '#14b8a6',  // ← бренд teal
  600: '#0d9488',
  700: '#0f766e',
},
// secondary → blue (для ссылок/доп.)
// info остаётся blue, success/warning/danger — без изменений (semantic)
```

> ⚠️ После смены токена `brand` — весь UI на `brand-*` (371 место) **автоматически** станет navy. Проверить контраст (navy‑600 на белом = ок).

### Шаг 2.2 — Глобальная консолидация (replace)

После переопределения токена — свести 9 семейств к **brand + accent + neutral + semantic**:

| Найти | Заменить на | Логика |
|---|---|---|
| `indigo-*` | `brand-*` | был дубль indigo |
| `gray-*`, `slate-*` | `neutral-*` | одна серая шкала |
| `blue-*` (UI links) | `brand-*` или оставить `info-*` для статусов | ссылки → brand |
| `orange-*` (mechanic) | `brand-*` / `warning-*` (если статус) | вернуть в семью |
| `rose-*`, `pink-*` (medic) | `brand-*` / `danger-*` (если ошибка) | вернуть в семью |
| `teal-*` | `accent-*` | теперь это бренд‑токен |

> **Внимание (Desing):** не всё подряд `rose→brand`. Разделить:
> - rose как **акцент роли medic** (декоративный) → `brand-*` или `accent-*`
> - rose как **danger/ошибка** (валидация, критич.) → `danger-*` (оставить семантику!)
> mechanic orange аналогично: декор → brand, warning‑статус → `warning-*`.

### Шаг 2.3 — Hardcoded hex → токены

| Где | Хекс | Токен |
|---|---|---|
| OrderCard SLA (#94a3b8/#ef4444/#f59e0b/#22c55e) | статусные | `neutral/danger/warning/success` |
| charts (kpi/page recharts COLORS) | hardcoded | бренд‑токены |
| DeadlineDot | emerald/amber/red | semantic токены |

### Семантика цвета (правило для разработчика)

- **brand (navy)** — primary действия, текст, шапки, основные кнопки
- **accent (teal)** — выделение активного, бренд‑пульс, ключевой CTA (1 на экран)
- **neutral** — фон, границы, вторичный текст
- **success/warning/danger/info** — ТОЛЬКО статусы (не декор)

**Acceptance:** `grep "indigo-\|gray-\|slate-\|orange-\|rose-\|pink-"` в UI → близко к 0 (только обоснованные semantic). Продукт выглядит как ОДИН бренд navy+teal, не 9 цветов.

---

## БЛОК 3 — ТЁМНАЯ ТЕМА 🟠 (нужно решение)

### Состояние: фикция

| Есть | Не работает |
|---|---|
| `darkMode:['class']` в config | **0** `dark:` префиксов в коде |
| `.dark` блок в globals (CSS‑переменные) | компоненты на hardcoded `bg-white` (41×), `text-neutral-900` (19×) |
| toggle Moon/Sun в dispatcher | `bg-background`/`text-foreground` (CSS‑var) — **0** использований |

**Что происходит:** toggle добавляет `.dark` → CSS‑переменные меняются → но компоненты их не используют → **почти ничего не темнеет**. Toggle обещает то, чего нет.

### Решение — выбрать

**Вариант A — убрать toggle (рекомендую сейчас, 0.5ч)**
- Удалить переключатель из `dispatcher/page.tsx` (state `darkMode`, кнопка в CockpitTopBar)
- Тёмной темы нет — нечего предлагать. Не вводим в заблуждение.
- B2B TMS — диспетчер работает днём, тёмная не приоритет.

**Вариант B — доделать (бренд‑фаза, ~10ч)**
- Мигрировать 41× `bg-white` → `bg-card`, 19× `text-neutral-900` → `text-foreground` (CSS‑переменные)
- Глобальный toggle (next-themes), сохранение выбора в localStorage
- Проверить контраст всех компонентов в dark

**Рекомендация Desing:** **Вариант A сейчас.** Доделать в отдельную итерацию если будет спрос. Сейчас toggle = баг.

---

## БЛОК 4 — АДАПТАЦИЯ ПОД ЭКРАНЫ 🟠

### Состояние: базово ок, дыры в таблицах
- Breakpoints используются активно (sm 147, md 106, lg 60, xl 21) ✅
- Next.js даёт дефолтный viewport meta ✅ (но явного export нет)

### Что чинить

#### 4.1 Таблицы с `min-w-[Npx]` → горизонтальный скролл на мобиле
| Файл | min-width |
|---|---|
| `admin/billing/page.tsx` | `min-w-[640px]` |
| `admin/compliance/page.tsx` | `min-w-[480px]` + `min-w-[640px]` |
| `status/page.tsx` | `min-w-[560px]` |
| `dispatcher/components/VehicleTimeline.tsx` | `min-w-[900px]` |
| `logist/components/KanbanBoard.tsx` | `min-w-[280px]` |

**Fix:** обернуть в `<div className="overflow-x-auto -mx-4 px-4 sm:mx-0">`; на `<768px` ключевые таблицы (billing/compliance) → карточный вид. Timeline/Kanban — оставить скролл + хинт «← листай».

#### 4.2 viewport (явный export + themeColor)
**Файл:** `src/app/layout.tsx` — добавить:
```js
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1,
  themeColor: '#111827',  // navy — бренд цвет таб-бара мобильного браузера
};
```

#### 4.3 dvh для модалок/полноэкранных
`min-h-screen` (17×) на мобиле глючит из‑за панели браузера → где критично, `min-h-[100dvh]`.

**Acceptance:** на 375px ни одна страница не рвётся горизонтальным скроллом; viewport явный с бренд‑themeColor.

---

## БЛОК 5 — БАННЕРЫ / ВИЗУАЛ 🟡 (опционально)

### Что есть
- Системные баннеры: `OrganizationSetupBanner`, `TaxRegimeBanner`, demo‑banner (dispatcher), Hero (landing) ✅

### Что можно добавить (по желанию, Recraft)
- **Hero‑иллюстрация** на landing (сейчас вероятно текст/mockup) — вектор в палитре navy+teal
- **Feature‑иконки** лендинга в едином стиле (ЭТрН/мобилка/телематика/ЭДО)
- **Empty‑state иллюстрации** для пустых таблиц/списков (вместо просто текста)
- **OG‑карточка** для шеринга (1200×630, лого + слоган)

> Это **не блокер**. Desing генерит через Recraft в style‑set navy+teal, когда дойдём. Сейчас — фокус на Блоки 1‑2.

---

## БЛОК 6 — МОДАЛКИ (overlay) 🔴

Уже описано детально в [`HOTFIX-modals.md`](./HOTFIX-modals.md) — Dialog регрессия (grid на native dialog ломает). **Применить тот хотфикс.** Корень модальных багов.

---

## Дополнительно (из дизайн‑методологии — что ещё заметил)

| Находка | Где | Приоритет |
|---|---|---|
| Микрошрифты `text-[10px]/[11px]` (нечитаемо) | dispatcher cockpit | 🟡 минимум text-xs |
| Денежные суммы без `tabular-nums` (прыгают) | finance, billing, kpi | 🟡 доверие к финансам |
| Focus ring раскол (brand/blue/indigo) | shared button/input/select | 🟠 единый brand‑400 |
| button h‑9 vs input h‑10 рассинхрон | shared | 🟠 button → h-10 |
| Радиусы/тени хаос | весь проект | 🟡 токены |

→ Детали в [`design-backlog.md`](./design-backlog.md), [`HANDOFF-fixes.md`](./HANDOFF-fixes.md) Блоки 1, C, F.

---

## Порядок работ для TransPult

```
ЭТАП 1 (P0, ~14ч) — к показу:
  1. HOTFIX-modals.md (модалки)             ~2ч
  2. Блок 1 — лого на landing + auth        ~2ч
  3. Блок 2.1 — переопределить brand токен  ~1ч  ← мгновенный эффект: всё navy
  4. Блок 2.2-2.3 — консолидация цвета       ~8ч
  5. Блок 3 — решение по теме (Вариант A)   ~0.5ч

ЭТАП 2 (P1, ~8ч) — полировка:
  6. Блок 4 — адаптация таблиц + viewport
  7. Дополнительно — focus/button/tabular-nums

ЭТАП 3 (P2, опц.) — визуал:
  8. Блок 5 — баннеры/иллюстрации (Recraft, Desing генерит)
```

---

## Что нужно решить (вопросы к владельцу/PM)

1. **Тёмная тема** — Вариант A (убрать toggle) или B (доделать ~10ч)? Desing рекомендует A.
2. **Баннеры/иллюстрации** — нужны на landing сейчас или после запуска? (Recraft, отдельная итерация)
3. **rose/orange разделение** — где medic/mechanic цвета это «фирменный акцент роли» (→ brand) vs «статус ошибки» (→ danger)? Desing предлагает: всё декоративное → brand/accent, только валидация/критич → danger/warning.

---

## Связанные документы

| Документ | Что внутри |
|---|---|
| [`HOTFIX-modals.md`](./HOTFIX-modals.md) | 🔴 Модалки (Dialog регрессия) |
| [`HANDOFF-fixes.md`](./HANDOFF-fixes.md) | Shared компоненты, размеры, адаптация (детали) |
| [`i18n-glossary.md`](./i18n-glossary.md) | Канон RU‑терминов (статусы/роли) |
| [`design-backlog.md`](./design-backlog.md) | Полный backlog (35 групп) |
| [`brand/README.md`](./brand/README.md) | Палитра + логотипы (3 версии) |
| [`visual-bugs.md`](./visual-bugs.md) | Все визуальные баги по зонам |

---

*Единый план. ЭТАП 1 (лого + палитра + модалки + решение по теме) = продукт выглядит как один бренд navy+teal. Вопросы — к Desing.*
