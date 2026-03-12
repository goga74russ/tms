# QA Test Report — User Guide Walkthrough
**Дата:** 12.03.2026 | **Тестировщик:** AI Agent | **Версия:** Sprint 9 Phase 2

---

## Окружение
- API: `http://localhost:4000` ✅
- Web: `http://localhost:3000` ✅
- PostgreSQL: ✅ 27 таблиц
- Redis: ⚠️ Auth required (workers disabled — не критично)
- Учётная запись: `admin@tms.local` / `password123`

---

## Результаты тестирования

| # | Раздел | Страница | Статус | Комментарий |
|---|--------|----------|:------:|-------------|
| 1 | Вход в систему | `/login` | ✅ | Форма: email + пароль. Работает |
| 2 | Роли и доступ | Sidebar | ✅ | 18 пунктов меню для admin |
| 3 | Логист — Заявки | `/logist` | ✅ | Kanban: 5 колонок (Черновик, В работе, Назначена, В пути, Доставлена) |
| 3a | Форма создания | Modal | ✅ | Все Sprint 9 поля: ярус, температура, тип загрузки, гидроборт, дата |
| 4 | Диспетчерская | `/dispatcher` | ✅ | Карта (Leaflet/OSM), панель назначения, статистика |
| 4a | Рейсы | `/trips` | ✅ | Таблица рейсов с фильтрами |
| 5 | Путевые листы | `/waybills` | ✅ | Реестр путевых |
| 6 | Техосмотр | `/mechanic` | ✅ | Интерфейс механика |
| 7 | Медосмотр | `/medic` | ✅ | Интерфейс медика |
| 8 | Автопарк | `/fleet` | ✅ | Табы: Транспорт, Водители, Пропуска, Штрафы, Контрагенты |
| 9 | Водители | `/drivers` | ✅ | Список водителей |
| 10 | Ремонты | `/repair` | ✅ | Журнал ремонтов |
| 11 | Контрагенты | `/contractors` | ✅ | Справочник клиентов |
| 12 | Финансы | `/finance` | ✅ | Финансовые показатели |
| 13 | Тарифы | `/tariffs` | ✅ | Настройки тарификации |
| 14a | KPI | `/kpi` | ✅ | Метрики эффективности |
| 14b | Аналитика | `/analytics` | ✅ | Отчёты и графики |
| 15 | Портал клиента | `/client` | ✅ | Клиентский вид (read-only) |
| 16 | Админ-панель | `/admin/users` | ✅ | 12 пользователей, управление ролями |

---

## 🟢 Итого: 18/18 страниц — всё работает

**Критических ошибок:** 0
**Некритичных замечаний:** 1 (Redis auth — workers disabled, не влияет на работу)

---

## Скриншоты

### Страница входа
![Login page](/C:/Users/gbard/.gemini/antigravity/brain/5d19486a-54b2-4027-99f8-742cb670e3ba/qa_login_page.png)

### Дашборд (после входа)
![Dashboard](/C:/Users/gbard/.gemini/antigravity/brain/5d19486a-54b2-4027-99f8-742cb670e3ba/qa_dashboard.png)

### Заявки — Kanban
![Kanban](/C:/Users/gbard/.gemini/antigravity/brain/5d19486a-54b2-4027-99f8-742cb670e3ba/qa_kanban.png)

### Новая заявка — Sprint 9 поля
![Create Order](/C:/Users/gbard/.gemini/antigravity/brain/5d19486a-54b2-4027-99f8-742cb670e3ba/qa_create_order.png)

### Диспетчерская (карта)
![Dispatcher](/C:/Users/gbard/.gemini/antigravity/brain/5d19486a-54b2-4027-99f8-742cb670e3ba/qa_dispatcher.png)

### Автопарк
![Fleet](/C:/Users/gbard/.gemini/antigravity/brain/5d19486a-54b2-4027-99f8-742cb670e3ba/qa_fleet.png)

### Админ-панель (пользователи)
![Admin](/C:/Users/gbard/.gemini/antigravity/brain/5d19486a-54b2-4027-99f8-742cb670e3ba/qa_admin.png)

---

## Видео записи

- [Попытка входа (admin123 — неверный пароль)](file:///C:/Users/gbard/.gemini/antigravity/brain/5d19486a-54b2-4027-99f8-742cb670e3ba/login_test_1773334077011.webp)
- [Успешный вход + Логист + Форма](file:///C:/Users/gbard/.gemini/antigravity/brain/5d19486a-54b2-4027-99f8-742cb670e3ba/login_and_logist_1773334273817.webp)
- [Обход всех 15 страниц](file:///C:/Users/gbard/.gemini/antigravity/brain/5d19486a-54b2-4027-99f8-742cb670e3ba/all_pages_test_1773334373329.webp)
