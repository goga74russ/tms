# Frontend Engineer (Next.js 15 / React 19) — аудит TMS 2026-10-15

**Персона/взгляд:** фронтенд-инженер, отвечающий за `apps/web`: корректность React-кода (эффекты, гонки, утечки, stale state), работа с API и auth на клиенте и в middleware, безопасность клиента (XSS, CSP, хранение данных), SSR/CSR, производительность, доступность (a11y), консистентность дизайн-системы, типизация и тесты.

**Охват:** `apps/web` целиком (≈54.7k LOC TS/TSX, 68 страниц). Построчно прочитаны: `src/lib/*` (api, user-context, routing, format, download; в аудите 2026-06-14 этот сегмент остался без проверенных находок), `src/middleware.ts`, `src/hooks/*`, `next.config.mjs`, `Dockerfile`, `package.json`, `app/layout.tsx`, `app/page.tsx`, `components/layout-shell.tsx`, `components/sidebar.tsx`, `components/MarkdownView.tsx`, `components/notifications-bell.tsx`, `components/Paywall.tsx`, `components/ui/{data-table,kanban,side-drawer,dialog,toast}.tsx`, `app/print/layout.tsx`, `app/print/invoice/[id]`. Выборочно, по рискам: login, finance (+ InvoiceWorkflowActions), client, orders (+ OrderDetailDrawer), trips (досье, список, ETA), dispatcher (+ DispatcherMap, TripRouteLayer), logist (+ CreateOrderModal), medic, mechanic, admin/layout, admin/audit-log, admin/integrations, fleet. Для сверки контрактов: `apps/api/src/modules/finance/routes.ts`, `invoice-workflow.service.ts`, `docker-compose.prod.yml`, `nginx/*.conf`, `.github/workflows/p0-gate.yml`.

**Метод:** чтение кода + grep-аудит паттернов (dangerouslySetInnerHTML, localStorage, key={index}, raw `fetch`, `limit=`, onClick на не-интерактивных элементах, неподписанные поля форм, контраст токенов); статический прогон на HEAD `4598a71`: `tsc --noEmit` (TS 5.9.3 из workspace) — 0 ошибок; `next lint` — 0 ошибок, 376 предупреждений (324 `no-explicit-any`, 18 `react-hooks/exhaustive-deps`, 28 unused-vars); `vitest run` — **1 упавший тест из 205** (43 файла). Каждая находка перепроверена повторным чтением кода (adversarial self-check); то, что зависит от runtime-тайминга, помечено PLAUSIBLE.

## Вердикт

Фронтенд в целом сделан аккуратно: токен лежит в httpOnly-cookie, `dangerouslySetInnerHTML` нет нигде, HTML для Leaflet экранируется, в Markdown-рендерере ссылки фильтруются по белому списку схем, JWT проверяется на edge, есть оповещение вкладок о выходе через BroadcastChannel, у таблиц и диалогов из дизайн-системы есть базовая a11y, `tsc` проходит без ошибок. Главные проблемы находятся не в отдельных компонентах, а в устройстве всей системы. **Слоя загрузки данных нет**: 279 `useEffect` с ручным `fetch` без отмены запросов, без пагинации и часто без состояния ошибки. Отсюда гонки ответов, молча обрезанные выборки и неверные финансовые агрегаты: страница финансов показывает KPI только по 50 последним счетам, а портал клиента завышает сумму «К оплате». `ApiClient` выбрасывает голый `Error` без кода и статуса, поэтому часть экранов обходит его через сырой `fetch`, и обработка 401 у них разная. Выход из сессии не снимает с экрана уже загруженные данные. По доступности не хватает подписей у полей форм, есть сценарии только для мыши и низкий контраст вспомогательного текста. CSP в проде фактически не защищает от XSS (`'unsafe-inline' 'unsafe-eval'`) и вдобавок блокирует собственный шрифт приложения. Оценка зрелости области: **6/10**.

## Сильные стороны

- Сессия хранится в httpOnly-cookie `tms_token`, токенов в `localStorage` нет; WS-токен короткоживущий, его выдаёт отдельный эндпоинт (`/auth/ws-token`).
- `dangerouslySetInnerHTML` в коде отсутствует; HTML-подсказки Leaflet экранируются через `escapeHtml` (`DispatcherMap.tsx`, `TripRouteLayer.tsx`); `MarkdownView` пропускает в ссылках только http/https/mailto/tel и относительные пути.
- Middleware проверяет JWT через `jose`, включая `exp`, и сверяет роли с маршрутами; `JWT_SECRET` в `docker-compose.prod.yml` обязателен (`:?`).
- 401 приводит к выходу во всех вкладках (BroadcastChannel); для `/auth/*` есть исключения, чтобы формы входа и сброса пароля показывали ошибку на месте.
- `translateApiError` переводит коды и ошибки Zod (`fieldErrors`) на русский; `downloadFromApi` разбирает ошибку сервера вместо «сайт недоступен».
- В шести из семи CSV-экспортов есть защита от formula-injection (`B4.4`).
- В дизайн-системе `DataTable` строки доступны с клавиатуры (role/tabIndex/Enter), у `SideDrawer` есть Esc и управление фокусом, у `Toast` есть `aria-live`; `Dialog` используется в 38 местах, локальных модалок почти не осталось.
- Leaflet подгружается через `dynamic(..., { ssr:false })`, на фоновых вкладках часть поллинга ставится на паузу (A-P1-15), `useSearchParams` обёрнут в `Suspense`.
- Закрытые в прошлом аудите web-находки (sparkline «К оплате», «Обновить» в аналитике, блок допуска медика, guard в админ-биллинге) на месте.

## Находки

### [P1] WEB-01 — Финансы: список счетов и KPI считаются по первым 50 счетам, без пагинации и предупреждения
- **Где:** `apps/web/src/app/finance/page.tsx:185` (`api.get('/finance/invoices')` без `limit/page`), агрегаты `:260-270`, sparkline `:272+`; API: `apps/api/src/modules/finance/routes.ts:186` (`limit` по умолчанию `'50'`, `total` в ответе нет).
- **Что:** страница финансов загружает одну страницу из 50 последних счетов (дефолт API) и по ней фильтрует период и считает «К оплате», «Частично оплачено», «Оплачено», а также строит sparkline и таблицу. Пагинации, `total` и баннера об усечении нет. В портале клиента (`client/page.tsx:186-190`) такой баннер есть, в главном бухгалтерском экране нет.
- **Сценарий:** в организации 120 счетов за квартал. Бухгалтер выбирает период «Квартал» и видит сумму к оплате только по 50 последним счетам. Старые неоплаченные счета (то есть просроченная дебиторка) из таблицы и KPI исчезают без предупреждения, и управленческое решение принимается по неверной цифре.
- **Исправление:** передавать `page/limit`, вернуть с API `total` и серверные агрегаты (`/finance/invoices/summary?from&to`) вместо подсчёта на клиенте; в таблице сделать серверную пагинацию; пока этого нет, показывать баннер об усечении, как в `client/page.tsx`.
- **Статус:** CONFIRMED

### [P1] WEB-02 — Портал клиента: «К оплате» суммирует полный `total` частично оплаченных счетов
- **Где:** `apps/web/src/app/client/page.tsx:152-155` (`unpaidTotal`), `:180` (sparkline), вывод `:213-221`.
- **Что:** для счетов `paid_partial` в «К оплате» складывается `totalAmount ?? total`, а не остаток `total − paidAmount`. В `finance/page.tsx` этот дефект исправили (`39f83b6`, «К оплате» = остаток), а на клиентском экране — нет.
- **Сценарий:** счёт на 100 000 ₽, клиент заплатил 70 000 ₽. В портале клиента карточка «К оплате, сумма неоплаченных» показывает 100 000 ₽ красным. Клиент оплачивает 100 000 ₽ повторно, возникает переплата 70 000 ₽, затем возврат и спор.
- **Исправление:** `sum + Math.max(Number(total) - Number(paidAmount ?? 0), 0)` в обоих местах; вынести расчёт в общий `lib/finance.ts` и использовать его и в finance, и в client; добавить unit-тест.
- **Статус:** CONFIRMED (повтор класса дефекта из аудита 2026-06-14 web/finance, исправлен только в одном месте)

### [P1] WEB-03 — «Выйти» не уводит со страницы: загруженные данные остаются на экране (и в других вкладках)
- **Где:** `apps/web/src/lib/user-context.tsx:75-82` (`logout` только `setUser(null)`), `:92-95` (слушатель других вкладок), `apps/web/src/components/sidebar.tsx:175,204` (`onClick={logout}`).
- **Что:** после выхода навигации нет. Перенаправляют на `/` только страницы с собственным guard по `useUser()` (medic, mechanic, trips, repair, client, admin). На finance, dispatcher, logist, orders, waybills, fleet, drivers, kpi, analytics, claims, contractors, incidents уже загруженные данные остаются на экране: суммы, ФИО и телефоны водителей, адреса, карта. В других вкладках происходит то же самое.
- **Сценарий:** диспетчер на общем ПК нажимает «Выйти» и уходит. Следующий человек видит открытую диспетчерскую с ФИО водителей и маршрутами, а в соседней вкладке — финансы. Это ПДн на экране после выхода (152-ФЗ, ст. 19).
- **Исправление:** в `logout()` и в обработчике BroadcastChannel делать `window.location.replace('/login')`: полная перезагрузка сбрасывает и React-state, и Router Cache. Дополнительно сделать общий `<RequireAuth>` в layout вместо guard'ов на каждой странице.
- **Статус:** CONFIRMED

### [P2] WEB-04 — Гонки запросов: ответы на фильтры и выбор записи не отменяются, старый ответ перезаписывает новый
- **Где:** `apps/web/src/app/orders/page.tsx:176-200` (`fetchOrders` по `statusFilter/tripFilter`); `apps/web/src/app/trips/page.tsx:2434-2436` + `:2562-2577` (`loadTrips` по `debouncedSearch/statusFilter`); `apps/web/src/app/trips/page.tsx:2584-2605` (`openDossier`); в целом отмена есть лишь в 15 файлах из 279 `useEffect`.
- **Что:** фильтр меняется, запросы уходят параллельно, кто ответил последним, тот и записывает `setRows/setTrips`. `AbortController` и проверки «запрос устарел» нет. Для досье рейса `closeDossier` не отменяет загрузку, и данные рейса A могут лечь в модалку, открытую для рейса B. При этом действия внутри досье используют `dossierTripId`, то есть B.
- **Сценарий:** логист переключает статус «Черновик» → «Подтверждена». Медленный ответ на «Черновик» приходит вторым, и под выбранным фильтром «Подтверждена» отображаются черновики. В досье: открыть A, закрыть, сразу открыть B — показаны точки A, а «Завершить точку» отправляет `PUT /trips/B/points/<pointId из A>`.
- **Исправление:** ввести единый слой данных. `@tanstack/react-query` уже есть в зависимостях, но не используется (WEB-24): ключи запросов дают отмену и дедупликацию. Минимальный вариант — `AbortController` или счётчик `requestId` в каждом эффекте с фильтрами.
- **Статус:** CONFIRMED (паттерн в коде); последствия для досье — PLAUSIBLE (зависит от тайминга)

### [P2] WEB-05 — Списки молча обрезаются жёсткими `limit=` при поиске и фильтрации только на клиенте
- **Где:** 50 вызовов `limit=100/200/500` в `app/**`: `logist/page.tsx:111` (`/orders?limit=100` — весь канбан), `dispatcher/page.tsx:311-313` (`/orders?status=confirmed&limit=50`, `/trips?limit=100`, `/fleet/vehicles?limit=100`), `trips/page.tsx:2565`, `orders/page.tsx:186` (`limit=100`, `total` игнорируется, поиск DataTable только по загруженным строкам).
- **Что:** предупреждение об усечении есть только для справочников ТС и прицепов на `/trips` и в портале клиента. В канбане логиста, у диспетчера (неназначенные заявки) и в реестре заявок записи сверх лимита просто не видны, а поиск по ним ничего не находит.
- **Сценарий:** у перевозчика 130 активных заявок. Тридцать старейших «Подтверждённых» не попадают в канбан, диспетчер их не видит в «неназначенных», и заявка срывается по SLA.
- **Исправление:** серверная пагинация и серверный поиск (`search=`) в реестрах; для канбана грузить по статусам (`status=draft|confirmed|…` раздельно); везде, где `total > data.length`, показывать баннер.
- **Статус:** CONFIRMED

### [P2] WEB-06 — Нет состояния ошибки: сбой API выглядит как «данных нет»
- **Где:** `apps/web/src/app/trips/page.tsx:2570-2572` (`console.error` при ошибке, пустой список), `apps/web/src/app/dispatcher/page.tsx:317-339` (4 датасета, при `rejected` только `console.error`), `apps/web/src/app/client/page.tsx:118-120`, `useVehiclePositions.ts:65`, `notifications-bell.tsx:44-46`.
- **Что:** при 5xx или обрыве сети пользователь видит пустую таблицу или «Нет рейсов» вместо ошибки с кнопкой «Повторить».
- **Сценарий:** API перезапускается, диспетчер видит пустую доску и решает, что рейсов нет. Клиент видит «0 заявок» и пишет в поддержку.
- **Исправление:** в каждом загрузчике заводить `error` и выводить общий `<EmptyState variant="error" onRetry>`; при частичных отказах (`allSettled`) показывать предупреждение о неполных данных.
- **Статус:** CONFIRMED

### [P2] WEB-07 — `ApiClient` теряет `status`, `code` и `details` ошибки, из-за чего экраны обходят его сырым `fetch`
- **Где:** `apps/web/src/lib/api.ts:124-125` (`throw new Error(translateApiError(...))`), `:131-135` (дженерик по умолчанию `T = any`); обходы: `app/finance/InvoiceWorkflowActions.tsx:179-192` (ему нужен `code === 'SF_OVERDUE_WARNING'`), `app/finance/page.tsx:542`, `app/import/page.tsx:121`, 12 печатных форм `app/print/**` (`fetch(...).then(r => r.json())` без `r.ok`), `components/Paywall.tsx` (нигде не монтируется, хотя `api.ts:13-16` обещает ветвление по `PLAN_FEATURE_LOCKED`).
- **Что:** у вызывающего кода нет типизированной ошибки (`ApiError {status, code, details}`), поэтому каждый экран, которому нужен код, пишет свой `fetch`. В этих местах нет обработки 401 и BroadcastChannel, а сообщения не переводятся. Пейволл на `PLAN_FEATURE_LOCKED` (403) не срабатывает нигде.
- **Сценарий:** сессия истекла, бухгалтер нажимает «Выпустить счёт» и получает тост «Ошибка выпуска: Unauthorized» вместо перехода на вход. Тариф free: попытка платной функции даёт только текстовый тост, пейволл не показывается.
- **Исправление:** `class ApiError extends Error { status; code; details }` в `request()`; перевести обходы на `api.*`; подключить `Paywall` к `code === 'PLAN_FEATURE_LOCKED'|'PLAN_LIMIT_EXCEEDED'`; убрать `T = any`.
- **Статус:** CONFIRMED

### [P2] WEB-08 — Обработка 401: фоновый поллинг делает жёсткий редирект, обратного URL нет, refresh-токена нет
- **Где:** `apps/web/src/lib/api.ts:105-122`; поллеры `components/notifications-bell.tsx:61-71` (каждые 30 с), `app/logist/page.tsx:125-129`, `app/dispatcher/page.tsx:346-353`; `apps/web/src/middleware.ts:110-118` (`/login` без `?next=`); `apps/api/src/auth/auth.ts:56-57` (JWT на 24 ч, refresh нет — «TODO»).
- **Что:** любой 401, в том числе от фонового поллинга колокольчика, делает `window.location.href = '/login'`. Открытые формы и модалки теряются, а после входа пользователь попадает на дашборд роли, а не туда, где был. Страница входа параметр `next` тоже не читает.
- **Сценарий:** медик заполняет осмотр (давление, пульс, ПЭП), токен истекает, через 30 с колокольчик получает 401, страница перезагружается и введённые данные пропадают. С двенадцатичасовыми сменами это происходит регулярно.
- **Исправление:** вести на `/login?next=<path>` (в login проверять, что путь относительный) и в middleware тоже передавать `next`. На 401 от фоновых запросов показывать «Сессия истекла» с повторным входом в модалке, без жёсткой навигации. Вместе с бэкендом: access+refresh или скользящее продление cookie.
- **Статус:** CONFIRMED

### [P2] WEB-09 — Временный сбой `/auth/me` выкидывает авторизованного пользователя на лендинг
- **Где:** `apps/web/src/lib/user-context.tsx:59-73` (`catch` → `setUser(null)` при любой ошибке, включая 5xx и сеть); guard'ы `app/medic/page.tsx:158`, `app/mechanic`, `app/trips`, `app/client/page.tsx:89-93`, `app/admin/layout.tsx:51-55` → `router.push('/')` → `app/page.tsx:35` → `/landing`.
- **Что:** клиент не отличает «не авторизован» (401) от «API недоступен» (5xx, сеть). Поле `error` контекста нигде не выводится.
- **Сценарий:** API рестартует во время деплоя, медик обновляет страницу и попадает на маркетинговый лендинг, хотя cookie валидна и middleware его пропустил. Сайдбар показывает «Войти».
- **Исправление:** обнулять `user` только при 401 (нужен `ApiError.status`, см. WEB-07); при 5xx и ошибке сети держать `loading`/`error` и показывать баннер «Нет связи с сервером» с повтором.
- **Статус:** CONFIRMED

### [P2] WEB-10 — CSP в проде не защищает от XSS и не ограничивает исходящие запросы
- **Где:** `apps/web/next.config.mjs:8-21`.
- **Что:** `script-src 'self' 'unsafe-inline' 'unsafe-eval'` (eval в проде не нужен, а inline-скрипты Next 15 можно разрешить через nonce в middleware), `connect-src 'self' http: https: ws: wss:` разрешает отправку данных на любой хост. Для compliance-first продукта с ПДн водителей и медданными CSP — главная защита на случай XSS, а сейчас она номинальная.
- **Сценарий:** любая будущая XSS (например, через серверный HTML в подсказке Leaflet, где `point.type`/`point.status` подставляются без escape, `TripRouteLayer.tsx:173-181`) свободно выполняет inline-код и отправляет данные на внешний хост. CSP этому не мешает.
- **Исправление:** nonce-based CSP через middleware (`'nonce-…' 'strict-dynamic'`), убрать `'unsafe-eval'`, сузить `connect-src` до `'self'` (WS идёт same-origin через nginx), включить `report-to`.
- **Статус:** CONFIRMED

### [P2] WEB-11 — Google Fonts через `@import`: в проде блокируется собственной CSP, в dev запрос уходит к иностранному сервису
- **Где:** `apps/web/src/app/globals.css:5` (`@import url('https://fonts.googleapis.com/...Inter...')`); `next.config.mjs:13,16` (`style-src 'self' 'unsafe-inline'`, `font-src 'self' data:`).
- **Что:** в продакшене CSP запрещает и stylesheet с `fonts.googleapis.com`, и шрифты с `fonts.gstatic.com`. Inter не загружается, интерфейс тихо падает на `system-ui`, а в консоли копятся CSP-ошибки. Там, где CSP нет (dev, стенды с `NODE_ENV≠production`), браузер каждого пользователя отправляет IP в Google — это вопрос для юриста по 152-ФЗ (трансграничная передача, локализация).
- **Сценарий:** макеты и скриншоты сделаны с Inter, у пользователей в проде другой шрифт и метрики: обрезается текст в узких колонках и бейджах.
- **Исправление:** `next/font/local` (self-host Inter) или `next/font/google`, который на этапе сборки скачивает шрифт и отдаёт с `'self'`; убрать `@import`.
- **Статус:** CONFIRMED

### [P2] WEB-12 — Печатные формы (УПД, СФ, ЭТрН, путевой лист, акты) рендерят второй `<html>` внутри `<body>`
- **Где:** `apps/web/src/app/print/layout.tsx:2-8` (вложенный layout возвращает `<html><head>…<body>`), корневой `apps/web/src/app/layout.tsx:26-36` (уже рендерит `<html><body>` + `UserProvider` + `CookieConsent`); обход в `components/layout-shell.tsx:11-15`.
- **Что:** в App Router у `/print/*` нет собственного root layout. `print/layout.tsx` вкладывается внутрь корневого, получается невалидный DOM (`<html>` внутри `<body>`). React 19 сообщает об ошибке гидрации и перерисовывает дерево на клиенте. Корневые `globals.css` (Tailwind preflight), `body.bg-neutral-50` и `CookieConsent` тоже попадают на печатную страницу. Комментарий «BUG-1» в `layout-shell` исправил лишь симптом.
- **Сценарий:** на каждой печатной форме в консоли ошибка гидрации, вёрстка A4 зависит от того, как браузер схлопнет вложенный `<html>`, а `<title>` и стили `<head>` из print-layout в документ корректно не попадают. Риск для юридически значимых печатных форм.
- **Исправление:** route groups с двумя root layout: `app/(app)/layout.tsx` (оболочка) и `app/(print)/layout.tsx` (свой `<html>`), исключение `/print` из `LayoutShell` убрать.
- **Статус:** CONFIRMED (структура), проявление ошибки гидрации — по документированному поведению React 19

### [P2] WEB-13 — Диспетчерская: холодовая цепь опрашивается N+1 каждые 30 с вместо 60 с
- **Где:** `apps/web/src/app/dispatcher/page.tsx:305-353` (`loadData` каждые 30 с → `setTrips(new array)`), `:356-399` (`loadColdChainBreaches` с зависимостью `[trips]`), `:401-410` (эффект с `[loadColdChainBreaches]`).
- **Что:** каждый `loadData` записывает новый массив `trips`. Из-за этого пересоздаётся `loadColdChainBreaches`, эффект перезапускается, сразу делает до 30 запросов `/trips/:id/temperature-summary` и сбрасывает 60-секундный интервал. Фактически получается до 30 запросов каждые 30 с на каждого открытого диспетчера, а заявленный интервал 60 с не работает.
- **Сценарий:** 5 диспетчеров и 30 активных рефрижераторных рейсов дают около 300 запросов в минуту только на сводки температуры; nginx `limit_req zone=api` может начать резать запросы, и соседние вызовы получат 503.
- **Исправление:** батч-эндпоинт `GET /trips/temperature-summary?ids=…` или флаг нарушения прямо в `GET /trips` (как уже сделано для `/trips`, C9); эффект завязать на стабильный ключ (`activeTripIds.join()`), а не на массив.
- **Статус:** CONFIRMED

### [P2] WEB-14 — `useVehiclePositions`: утечка WebSocket при размонтировании во время запроса токена
- **Где:** `apps/web/src/hooks/useVehiclePositions.ts:74-95` (`await fetch('/auth/ws-token')`, затем `new WebSocket` без проверки `mountedRef`), `:97-99`, `:118-119` (обработчики выходят по `!mounted`, сокет не закрывают); используется в `app/dispatcher/page.tsx:260`.
- **Что:** если компонент размонтировался, пока шёл запрос токена (уход со страницы диспетчера, а в dev — StrictMode), `connect()` всё равно открывает сокет и записывает его в `wsRef`. Cleanup уже отработал, `onclose` и `onopen` выходят по `!mounted`, и сокет остаётся висеть. При StrictMode второй `connect()` перетирает `wsRef`, первый сокет остаётся с активным `onmessage`. Кроме того, после неудачи `ws-token` хук навсегда переходит на REST-поллинг без повторной попытки WS.
- **Сценарий:** диспетчер несколько раз быстро переходит на `/dispatcher` и обратно — на сервере копятся «осиротевшие» WS-подписки с потоком позиций, растёт нагрузка и память.
- **Исправление:** после каждого `await` проверять `if (!mountedRef.current) return;`; перед созданием закрывать предыдущий `wsRef.current`; отмена через `AbortController`.
- **Статус:** CONFIRMED

### [P2] WEB-15 — a11y: около 130 полей форм без программной подписи, ошибки не связаны с полями
- **Где:** больше всего в `apps/web/src/app/logist/components/CreateOrderModal.tsx:530-590` (24 поля: `<label>` стоит соседом, без `htmlFor`/`id`), `fleet/components/TrailersTable.tsx` (9), `medic/page.tsx` (8, включая поле ПЭП `:664-670` только с placeholder), `fleet/components/AddVehicleModal.tsx` (8), `fleet/components/ContractorsTable.tsx` (8), `admin/mchd` (6), `trips/page.tsx` (6), `claims` (6). Всего 130 из 229 нативных `input/select/textarea` в `app/**` без `id`/`aria-label`/обёртки `<label>`.
- **Что:** скринридер озвучивает такие поля как «поле редактирования» без названия. Ошибки (`errors.cargoDescription`) не привязаны через `aria-describedby`/`aria-invalid`. При этом в `components/ui/input.tsx` и `form-field.tsx` всё нужное есть — его просто не используют.
- **Сценарий:** незрячий логист или пользователь с голосовым управлением («нажми Вес») не может заполнить заявку. Это несоответствие ГОСТ Р 52872-2019 / WCAG 2.1 SC 1.3.1, 3.3.2, 4.1.2, что важно для госзаказчиков.
- **Исправление:** заменить нативные поля на `Input`/`Select`/`FormField` с `label`; добавить в CI `eslint-plugin-jsx-a11y` (`label-has-associated-control`).
- **Статус:** CONFIRMED

### [P2] WEB-16 — a11y: ключевые очереди медика и механика и карточки канбана управляются только мышью
- **Где:** `apps/web/src/app/mechanic/page.tsx:681-684`, `apps/web/src/app/medic/page.tsx:829-832` (`<div onClick={selectVehicle/selectDriver}>` без `role`/`tabIndex`/`onKeyDown`); `apps/web/src/components/ui/kanban.tsx:287-291` (карточка: `div` + HTML5 DnD + onClick, клавиатурной альтернативы перемещения нет).
- **Что:** основной сценарий осмотра (выбрать водителя или ТС из очереди) с клавиатуры недоступен; сменить статус в канбане можно только перетаскиванием (у логиста есть кнопка-дубль лишь для одного перехода, `logist/page.tsx:427`).
- **Сценарий:** медик на терминале с клавиатурой и без мыши (часто в медкабинетах) не может открыть осмотр.
- **Исправление:** `<button>` или `role="button" tabIndex={0}` с обработкой Enter/Space (как в `DataTable`); в канбане меню «Переместить в…» на карточке.
- **Статус:** CONFIRMED

### [P2] WEB-17 — a11y: вспомогательный текст `text-neutral-400` (#94a3b8) на белом — контраст 2.56:1
- **Где:** `apps/web/tailwind.config.js:104` (`neutral.400 = #94a3b8`); около 120 мест, где `text-neutral-400` применён к тексту `text-xs/sm` (подсказки, даты, ID, подписи метрик), например `login/page.tsx:248`, `sidebar.tsx`, `medic`, `mechanic`.
- **Что:** WCAG AA требует 4.5:1 для обычного текста, а мелкий 11–12px серый на белом сложно прочитать и на ярком мониторе в диспетчерской, и на планшете механика на улице.
- **Исправление:** для текста использовать минимум `neutral-500` (#64748b, 4.76:1); `neutral-400` оставить для иконок и бордеров; добавить lint-правило или документ дизайн-системы.
- **Статус:** CONFIRMED

### [P2] WEB-18 — CSV-экспорт журнала аудита без защиты от formula-injection; семь копий `csvCell`
- **Где:** `apps/web/src/app/admin/audit-log/page.tsx:54-59` (`csvEscape` без префикса `'` для `= + - @ \t \r`); копии в `trips/page.tsx:223`, `contractors/page.tsx:27`, `claims/page.tsx:21`, `drivers/page.tsx:52`, `fleet/components/VehiclesTable.tsx:108`, `orders/page.tsx:125-131` (без `\t\r`).
- **Что:** в журнал попадают значения, которые вводят пользователи (ФИО, payload событий). Администратор экспортирует CSV и открывает в Excel, и ячейка вида `=HYPERLINK(...)` или DDE исполняется.
- **Сценарий:** водитель или клиент сохраняет ФИО `=cmd|' /C calc'!A0`, это событие попадает в журнал, админ открывает экспорт — formula-injection срабатывает на машине администратора.
- **Исправление:** один `lib/csv.ts` с guard'ом и тестом, все экспорты перевести на него.
- **Статус:** CONFIRMED

### [P2] WEB-19 — Unit-тест web падает на HEAD: веб-гейт CI красный
- **Где:** `apps/web/src/app/fleet/page.test.tsx:16-22` ожидает вкладку «Водители»; её удалили в `apps/web/src/app/fleet/page.tsx:24-28` (коммит `d400e71`). В `.github/workflows/p0-gate.yml:94` запускается `pnpm --filter @tms/web test`.
- **Что:** `vitest run` даёт 1 failed / 204 passed. Гейт либо красный, либо его игнорируют, и тогда регрессии web проходят незамеченными.
- **Исправление:** обновить тест (убрать «Водители» и проверить, что вкладки нет); сделать web-тесты обязательным статусом для merge.
- **Статус:** CONFIRMED (воспроизведено локально)

### [P2] WEB-20 — ESLint фактически не работает как гейт
- **Где:** `apps/web/package.json` (`"lint": "next lint --quiet || true; tsc --noEmit"`), `apps/web/next.config.mjs` (`eslint.ignoreDuringBuilds: true`), `apps/web/.eslintrc.json` (`no-explicit-any`, `exhaustive-deps` переведены в `warn`).
- **Что:** `|| true` проглатывает любые ошибки линта, ключевые правила понижены до предупреждений, `jsx-a11y` не подключён. Текущий фон: 324 `any`, 18 `exhaustive-deps` (часть с `eslint-disable`), 28 неиспользуемых переменных. Гонки и stale closures (WEB-04, WEB-13, WEB-25) — типичные срабатывания `exhaustive-deps`.
- **Исправление:** убрать `|| true`, поставить `--max-warnings` на текущий уровень и снижать его (ratchet); `exhaustive-deps` → `error` для новых файлов; подключить `plugin:jsx-a11y/recommended`. `next lint` объявлен устаревшим — перейти на ESLint CLI.
- **Статус:** CONFIRMED

### [P2] WEB-21 — Публичные `/about`, `/contacts`, `/status` рендерятся внутри оболочки приложения с сайдбаром
- **Где:** `apps/web/src/components/layout-shell.tsx:15` (`PUBLIC_PATH_PREFIXES` без `/about`, `/contacts`, `/status`) при том, что `apps/web/src/middleware.ts:22` считает их публичными; `app/about/page.tsx` и `app/contacts/page.tsx` сами рисуют `StickyHeader`/`Footer` лендинга.
- **Что:** анонимный посетитель видит на «О нас» и «Связаться» слева сайдбар TMS (пункт «Главная» и кнопку «Войти в систему»), а справа шапку и футер лендинга в контейнере `h-screen overflow-auto p-6 max-w-[1600px]`.
- **Сценарий:** переход с лендинга на «Связаться» (лид-форма) выглядит как сломанная вёрстка, что сказывается на конверсии.
- **Исправление:** добавить пути в `PUBLIC_PATH_PREFIXES`, а лучше вынести маркетинговые страницы в route group `(marketing)` со своим layout.
- **Статус:** CONFIRMED

### [P2] WEB-22 — Корневой `/` — клиентская страница, которая рендерит `null`; лендинг открывается только после JS и запроса `/auth/me`
- **Где:** `apps/web/src/app/page.tsx:18-39`; `apps/web/src/app/layout.tsx` (`UserProvider` на всех страницах, включая лендинг и юр-страницы).
- **Что:** поисковик и пользователь на `/` получают пустой HTML. Редирект на `/landing` происходит только после гидрации и ответа 401 от `/auth/me`. Каждый анонимный визит на любую публичную страницу создаёт лишний запрос к API.
- **Сценарий:** главный домен в выдаче Яндекса без сниппета, LCP лендинга с `/` увеличен на время загрузки JS и `/auth/me`.
- **Исправление:** делать редирект `/` в middleware: JWT там уже проверен, роль известна, анонима сразу отправлять на `/landing` (или рендерить лендинг прямо на `/`); `UserProvider` подключать только в app-группе.
- **Статус:** CONFIRMED

### [P2] WEB-23 — Регистрация оплаты без даты платежа: UI отправляет «сейчас», сервер поле игнорирует
- **Где:** `apps/web/src/app/finance/InvoiceWorkflowActions.tsx:214` (`paymentDate: new Date().toISOString()`, поля даты в форме нет); `apps/api/src/modules/finance/invoice-workflow.service.ts:696` (`paymentDate` принимается, но нигде не используется; `paidAt = new Date()`).
- **Что:** дата оплаты по выписке банка не фиксируется: бухгалтер разносит вчерашнюю выписку, а `paidAt` ставится по времени клика.
- **Сценарий:** оплата 30.09 разнесена 01.10 и попадает в октябрь, отчёт по ДЗ и акт сверки за сентябрь неверны.
- **Исправление:** поле «Дата платежа» (по умолчанию сегодня в TZ организации, `YYYY-MM-DD`, без UTC-сдвига) и сохранение на бэкенде (см. открытый вопрос к Backend/Finance).
- **Статус:** CONFIRMED

### [P3] WEB-24 — Неиспользуемые зависимости, в том числе `xlsx@0.18.5` с известными CVE
- **Где:** `apps/web/package.json`. В `src/` нет ни одного импорта `xlsx`, `@tanstack/react-query`, `@tanstack/react-table`, `zustand`, `react-leaflet`, `leaflet-routing-machine`, `@radix-ui/react-select`, `@radix-ui/react-tabs`, `@radix-ui/react-checkbox`.
- **Что:** лишняя поверхность для supply-chain атак; `xlsx` 0.18.5 из npm уязвим (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS) и больше не обновляется в npm. Попутно: react-query установлен, но не используется — а это готовое решение для WEB-04, WEB-05 и WEB-06.
- **Исправление:** удалить неиспользуемые пакеты; если Excel нужен на клиенте, брать SheetJS с CDN-дистрибутива (0.20.x+) или парсить на сервере (сейчас так и сделано).
- **Статус:** CONFIRMED

### [P3] WEB-25 — Stale state на карте: «мёртвые» GPS-маркеры и устаревшее замыкание клика
- **Где:** `apps/web/src/hooks/useWialonPositions.ts:59-66` (`setMarkers(prev => ({...prev, …}))` только добавляет; очищает лишь при `subscriptions.length === 0`); `apps/web/src/app/dispatcher/components/DispatcherMap.tsx:218` (`marker.on('click', …selectedVehicle…)` при создании маркера, без перепривязки).
- **Что:** рейс завершён, ТС пропало из подписок, а его последний маркер «🛰» остаётся на карте до перезагрузки. Клик по живому маркеру использует `selectedVehicle` на момент создания, и повторный клик не снимает выделение.
- **Исправление:** фильтровать `markers` по текущему `subsKey`; в карте хранить `selectedVehicle` в ref или перепривязывать обработчик.
- **Статус:** CONFIRMED

### [P3] WEB-26 — Дрейф дизайн-системы и дубли логики
- **Где:** `apps/web/src/app/orders/components/OrderDetailDrawer.tsx:110-131` (своя реализация drawer без `aria-modal`, фокус-трапа и возврата фокуса, при наличии `components/ui/side-drawer.tsx`; при смене `orderId` в заголовке остаётся номер прошлой заявки); `apps/web/src/components/Paywall.tsx:52-58` (без Esc и управления фокусом, к тому же нигде не используется); локальные тосты в `trips/[id]/documents/page.tsx:91`, `repair/components/RepairKanban.tsx:1141`, `dispatcher/components/AssignmentPanel.tsx:61`; `apps/web/src/app/page.tsx:25-32` повторяет `pickRouteForRoles` с другим фолбэком (`'/logist'` вместо `'/'`); видимость `/tariffs` для роли `logist` расходится: `sidebar.tsx:40` против `middleware.ts:39`.
- **Исправление:** заменить на `SideDrawer`/`Dialog`/`useToast`; в `app/page.tsx` использовать `pickRouteForRoles`; матрицу «маршрут → роли» держать в одном `lib/routes.ts`, общем для middleware и sidebar.
- **Статус:** CONFIRMED

### [P3] WEB-27 — Черновик заявки в `localStorage` не привязан к пользователю и организации
- **Где:** `apps/web/src/app/logist/components/CreateOrderModal.tsx:16` (`'transpult.draft.createOrder.v1'`), `:160-185`; при logout не очищается (`user-context.tsx:75-82`).
- **Что:** на общем ПК логист другой организации открывает «Новая заявка» и получает предложение восстановить черновик чужой организации: адреса, груз, `contractorId`, срок хранения 24 ч.
- **Исправление:** ключ `draft.createOrder.<orgId>.<userId>`; при выходе очищать `transpult.*`.
- **Статус:** CONFIRMED

### [P3] WEB-28 — Монолитные клиентские страницы и отсутствие слоя данных
- **Где:** `app/trips/page.tsx` (3597 строк, один компонент с десятками `useState`), `waybills/page.tsx` (1607), `RepairKanban.tsx` (1393), `medic/page.tsx` (1115), `finance/page.tsx` (1039), `dispatcher/page.tsx` (1038); 97 файлов с `'use client'` на 68 страниц, Server Components для данных не используются.
- **Что:** любое изменение состояния перерисовывает всю страницу; код тяжело ревьюить и тестировать, и именно в таких файлах находятся WEB-04/05/06. `recharts` попадает в бандл каждой страницы с `MetricCard` ради одного sparkline (`components/ui/metric-card.tsx:9`).
- **Исправление:** декомпозировать по фичам (`trips/components/*`, хуки `useTrips`, `useDossier`); общий слой запросов; sparkline на лёгком SVG или через `dynamic()`.
- **Статус:** CONFIRMED

### [P3] WEB-29 — Пробелы в тестах: middleware, user-context и ключевые рабочие места без тестов
- **Где:** нет тестов на `src/middleware.ts` (`hasAccess`, публичные маршруты, правило «путь с расширением = статика» `:96`), `src/lib/user-context.tsx`, `app/medic`, `app/mechanic`, `app/client`, `app/logist`, `app/orders`, печатные формы; e2e — 4 спеки (happy-path и три ролевые).
- **Исправление:** unit-тест матрицы ролей (сверка с sidebar), тесты агрегатов финансов и клиента (WEB-01/02), e2e «выход → данные не видны» (WEB-03).
- **Статус:** CONFIRMED

### [P3] WEB-30 — `key={index}` в редактируемых списках со stateful-детьми
- **Где:** `apps/web/src/app/repair/components/RepairKanban.tsx:757-758` (`CatalogPicker` со своим состоянием в строке запчасти, есть удаление строки), `apps/web/src/app/onboarding/components/StepTeam.tsx:103-105` (`FormField` с внутренним touched/error), `admin/checklists/page.tsx:183`, `finance/InvoiceWorkflowActions.tsx:275`.
- **Что:** после удаления строки N внутреннее состояние дочерних компонентов (открытый пикер, текст поиска, ошибка валидации) сдвигается на соседнюю строку. Значения полей контролируемые и не страдают.
- **Исправление:** локальный `uid` (`crypto.randomUUID()`) при добавлении строки.
- **Статус:** PLAUSIBLE

### [P3] WEB-31 — PDF-акты осмотров по прямой ссылке; `downloadFromApi` показывает сырой код ошибки
- **Где:** `apps/web/src/app/mechanic/page.tsx:842`, `apps/web/src/app/medic/page.tsx:990` (`<a href="/api/inspections/.../pdf" target="_blank">`); `apps/web/src/lib/download.ts:64-66` (`message = String(data.error)` без `translateApiError`).
- **Что:** при 4xx/5xx акт осмотра открывается вкладкой с сырым JSON — это та проблема, ради которой писали `downloadFromApi`. Сама `downloadFromApi` показывает коды вида `ETRN_DATA_INCOMPLETE` без перевода.
- **Исправление:** использовать `downloadFromApi` с тостом; экспортировать `translateApiError` из `api.ts` и применять его в `download.ts`.
- **Статус:** CONFIRMED

### [P3] WEB-32 — Поллинг без паузы на скрытой вкладке
- **Где:** `apps/web/src/components/notifications-bell.tsx:61-71` (каждые 30 с, на каждой странице приложения), `apps/web/src/app/logist/page.tsx:125-129`.
- **Что:** в отличие от dispatcher и wialon (A-P1-15), эти поллеры работают и в фоне. У пользователя с десятком вкладок это десятки запросов в минуту, а вместе с WEB-08 — разлогин из фоновой вкладки.
- **Исправление:** общий хук `usePolling(fn, ms, { pauseHidden: true })`.
- **Статус:** CONFIRMED

## Рекомендации / Next Actions

1. **До пилота (P1):** исправить формулу «К оплате» в портале клиента и вынести её в `lib/finance.ts` с тестом (WEB-02); финансы — серверные агрегаты, пагинация и баннер усечения (WEB-01); `logout` → `location.replace('/login')`, то же в BroadcastChannel (WEB-03).
2. Ввести `ApiError {status, code, details}` в `lib/api.ts` и перевести на него обходы через сырой `fetch`, а также user-context (обнулять user только при 401) и Paywall (WEB-07, WEB-09).
3. Подключить уже установленный `@tanstack/react-query` как единый слой данных: отмена запросов, дедупликация, `isError`, поллинг с паузой на скрытой вкладке. Первыми перевести orders, trips, dispatcher, logist, finance (WEB-04, WEB-05, WEB-06, WEB-13, WEB-32).
4. 401: `/login?next=`, модалка «Сессия истекла» для фоновых запросов; согласовать с бэкендом refresh или скользящую сессию (WEB-08).
5. Починить красный тест fleet и сделать web-тесты и ESLint (без `|| true`, с ratchet `--max-warnings`, с `jsx-a11y`) обязательными для merge (WEB-19, WEB-20).
6. Route groups: `(app)`, `(marketing)`, `(print)` со своими root layout — это закрывает WEB-12, WEB-21, WEB-22 и убирает `UserProvider` с публичных страниц.
7. CSP на nonce без `unsafe-eval`, узкий `connect-src`; Inter через `next/font` (self-host) (WEB-10, WEB-11).
8. a11y-спринт: формы на `FormField`/`Input` с label, клавиатурный выбор в очередях медика и механика, «Переместить в…» в канбане, контраст `neutral-500+` для текста (WEB-15, WEB-16, WEB-17).
9. Общий `lib/csv.ts` с formula-guard (WEB-18); удалить неиспользуемые зависимости, в первую очередь `xlsx` (WEB-24).
10. Мелочи: утечка WS (WEB-14), маркеры карты (WEB-25), drawer/toast/routes на дизайн-систему (WEB-26), ключ черновика (WEB-27), PDF через `downloadFromApi` (WEB-31), тесты middleware (WEB-29).

## Открытые вопросы к другим ролям

- **Backend/Finance:** `paymentDate` в `register-payment` принимается и игнорируется (`invoice-workflow.service.ts:696`), `paidAt = now()`. Нужна дата платежа по выписке (WEB-23). Кроме того, `GET /finance/invoices` не возвращает `total` и серверных агрегатов (WEB-01).
- **Backend/Security:** JWT на 24 ч без refresh и отзыва (`auth.ts:56`). Когда планируется access+refresh? От этого зависит UX 401 (WEB-08). Middleware проверяет только подпись и `exp` и не учитывает отзыв (например, смену ролей или блокировку) — допустимо ли это для гейтинга UI?
- **DevOps/SRE:** nginx отдаёт `X-Frame-Options: DENY`, а Next — `SAMEORIGIN`: в ответе два конфликтующих заголовка. Нужен единый источник security-заголовков и CSP. Клиентских ошибок в мониторинге нет (`app/error.tsx` пишет только в `console.error`) — нужен ли Sentry или аналог, размещённый в РФ?
- **Legal (152-ФЗ):** загрузка Google Fonts с клиента (передача IP в Google) там, где CSP её не блокирует (WEB-11); ПДн на экране после выхода (WEB-03); черновики заявок без привязки к пользователю в `localStorage` (WEB-27).
- **Design:** токен `neutral-400` для текста не проходит WCAG AA. Нужна правка гайда дизайн-системы (WEB-17).
