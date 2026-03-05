# TMS — Конвенции и стандарты кодирования

## Структура файлов

### Backend модуль (`apps/api/src/modules/<module>/`)
```
routes.ts      — Fastify route definitions
service.ts     — бизнес-логика
types.ts       — типы специфичные для модуля (если не в shared)
validators.ts  — дополнительная валидация (если не хватает Zod из shared)
```

### Frontend страница (`apps/web/src/app/<page>/`)
```
page.tsx        — серверный/клиентский компонент страницы
components/     — компоненты страницы (только для этой страницы)
hooks/          — хуки страницы
```

## Именование

| Что | Формат | Пример |
|-----|--------|--------|
| Таблицы БД | snake_case, множественное | `repair_requests` |
| Колонки БД | snake_case | `created_at` |
| TypeScript файлы | kebab-case | `trip-service.ts` |
| React компоненты | PascalCase файл | `TripCard.tsx` |
| API пути | kebab-case | `/api/fleet/vehicles` |
| Enum значения | snake_case | `in_transit` |
| Event types | dot.notation | `trip.status_changed` |

## API Response Format

Все ответы — единый формат:
```typescript
// Успех
{ success: true, data: T }
{ success: true, data: T[], total: number, page: number, limit: number }

// Ошибка
{ success: false, error: string, details?: Record<string, string> }
```

## Пагинация

Query params: `?page=1&limit=20&sort=createdAt&order=desc`

## События

Каждая бизнес-операция → `recordEvent()`:
```typescript
import { recordEvent } from '../../events/journal.js';

await recordEvent({
  authorId: user.userId,
  authorRole: user.roles[0],
  eventType: 'order.created',
  entityType: 'order',
  entityId: order.id,
  data: { number: order.number, status: order.status },
});
```

## RBAC

Каждый route handler — через preHandler:
```typescript
app.get('/api/orders', {
  preHandler: [app.authenticate, requireAbility('read', 'Order')],
}, handler);
```

## Imports

- Shared: `import { OrderStatus, OrderCreateSchema } from '@tms/shared';`
- DB: `import { db } from '../../db/connection.js';`
- Schema: `import { orders } from '../../db/schema.js';`
- Events: `import { recordEvent } from '../../events/journal.js';`
- RBAC: `import { requireAbility } from '../../auth/rbac.js';`

## Git

- НЕ коммитим `.env`, `node_modules`, `dist`, `drizzle/` (миграции)
- Коммит-сообщения: `[Agent N] краткое описание`
