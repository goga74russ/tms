# Operational TODO — Pilot Phase

Документ для трекинга задач которые отложили во время первичного пилот-деплоя.

## Сделано (2026-05-13/14)

- ✅ Production deploy на Selectel VPS (135.106.152.23, transpult.ru)
- ✅ HTTPS Let's Encrypt с автообновлением (cron 03:17/15:17)
- ✅ Daily Postgres backups → MinIO (cron 06:00 МСК, retention 14d)
- ✅ UFW + fail2ban
- ✅ Rename TMS → ТрансПульт (UI, email subjects, billing descriptions)
- ✅ Footer с реальными реквизитами ИП Бардин Г.Д.
- ✅ `/about` и `/status` страницы лендинга
- ✅ SMTP через Selectel Mail Service (порт 1126 STARTTLS)
  - Yandex 360 как приёмник, MX → mx.yandex.net.
  - DKIM (selcloud + mail), SPF (combined), DMARC (p=none)

## Высокий приоритет

### Реальная DaData интеграция
**Боль:** Сейчас `/onboarding` шаг 1 («Найдите вашу компанию» по ИНН) возвращает mock-данные (ОАО «ГрузоПеревозки», Иванов И.И., Казань). Это `apps/api/src/integrations/mocks/dadata.mock.ts`.
**Решение:**
- Зарегистрироваться на https://dadata.ru (бесплатно до 10 000 запросов/день)
- Получить API token + secret
- Сохранить в `/admin/integrations` (тип `dadata`) или захардкодить env vars
- Заменить mock-вызов на реальный fetch к suggestions.dadata.ru
**Срочность:** до первого реального пользователя который пойдёт регистрироваться через `/signup` → onboarding.

### Selectel ticket — закрыть
**Контекст:** Открывали тикет про разблокировку outbound 465/587. Selectel предложил их Mail Service, мы перешли на него.
**Действие:** ответить в тикет «Перешли на ваш Mail Service, тикет можно закрыть».

### Yandex 360 — keep or drop?
**Контекст:** Подключали для отправки, в итоге отправка через Selectel. Yandex остался как приёмник входящих (mailbox `noreply@transpult.ru`, MX → mx.yandex.net.). Стоит ~249₽/мес.
**Решение нужно:**
- Если входящие на @transpult.ru нужны (например, кто-то напишет на `support@transpult.ru`) — оставить
- Если нет → отписаться от Yandex 360, удалить MX-запись, переключить SPF на `v=spf1 include:spf.mail.selcloud.ru ~all`

### Telegram-мониторинг
**Цель:** alert в Telegram (@BardinGD) если `https://transpult.ru/api/health` не отвечает 200 за 3 проверки подряд.
**Решение:**
- Cron на сервере: каждую минуту curl `/api/health`, при failure → tg-send через @BotFather бота
- ИЛИ внешний uptime monitor (UptimeRobot бесплатно 50 мониторов, 5-min checks)
- ИЛИ uptime-kuma в отдельном контейнере (overkill для пилота, но даёт полный history + status page)
**Срочность:** до пилота с реальным клиентом — желательно. Пока живём «по ощущениям».

## Средний приоритет

### Подкорректировать /about — параграф про основателя
**Контекст:** Сейчас в карточке основателя стоит заглушка («Программист и предприниматель из Челябинской области. Несколько лет проработал в IT…»). Нужен реальный текст про Г.Д. Бардина.

### DMARC — ужесточить через 2 недели
**Контекст:** Сейчас `_dmarc.transpult.ru → v=DMARC1; p=none; rua=mailto:postmaster@transpult.ru` (только мониторинг).
**Действие через ~14 дней:** если за это время не будет жалоб что письма от @transpult.ru попадают в спам у получателей → менять `p=none` на `p=quarantine`, через ещё месяц — на `p=reject`.

### Создать реальных пользователей под команду
**Контекст:** Сейчас есть только `admin@tms.local` (seed-аккаунт).
**Действие:** в `/admin/users` создать аккаунты под реальные должности когда появится команда.

### Сменить пароль админа `admin@tms.local`
**Контекст:** Сейчас сгенерированный пароль `_hk0RUuswtmemFcJ` (из SEED_PASSWORD в `.env`). Лежит в `.env` хоста и в менеджере паролей пользователя.
**Действие:** залогиниться → профиль → сменить пароль на свой.

## Низкий приоритет / отложено

### ЮKassa webhook + биллинг
Когда появятся платные клиенты — настроить ЮKassa, прописать `YOOKASSA_WEBHOOK_SECRET` (уже в .env как пустой), webhook URL `https://transpult.ru/api/billing/webhook`.

### Интеграции (ЭДО, GPS-телематика, ОФД)
- ЭДО (Контур.Диадок / СБИС) — по запросу клиента
- Wialon/Omnicomm/Glonasssoft — когда подключим первый автопарк
- ОФД 54-ФЗ — когда понадобятся фискальные чеки для оплаты

### Снос Timeweb VPS
Уже сделано (2026-05-14 утром).

### Restore drill
Не делали полноценный DR drill (CREATE DATABASE tms_drill → restore → diff → DROP) — классификатор не пропустил CREATE/DROP на prod postgres. Сделать в отдельной сессии с явным разрешением.
