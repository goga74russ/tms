# Changelog — Агент 4: Мобилка водителя

## 04 Марта 2026
**Инициализация мобильного приложения водителя**
- **Создан проект**: Expo React Native приложение в `apps/mobile/`. Добавлен в workspaces `package.json`.
- **Зависимости**: Интегрированы `expo-camera`, `react-native-signature-canvas`, `@react-navigation/native`, WatermelonDB и др.
- **Оффлайн БД (WatermelonDB)**:
  - Создана локальная схема `apps/mobile/src/database/schema.ts` с таблицами `trips`, `route_points`, `events`.
  - Реализована append-only синхронизация: функция `syncDatabase` (сохраняет каждое действие как `AppEvent` и пушит на сервер пачкой при появлении сети).
- **Авторизация**: Реализован JWT логин с локальным сохранением токена (SecureStore) и контекстом `AuthContext`.
- **Экраны приложения**:
  - `LoginScreen`: Экран аутентификации.
  - `TripListScreen`: Вывод списка назначенных рейсов (фильтрация из WatermelonDB).
  - `TripDetailsScreen`: Маршрут, навигация (deep links) и точки погрузки/выгрузки.
  - `CheckpointScreen`: Экран подтверждения на точке - возможность сделать фото, оставить подпись (камера и signature canvas) и заметки. Формирует событие `trip.checkpoint_completed`.
  - `TripCompletionScreen`: Закрытие рейса с вводом показаний одометра и остатков топлива. Формирует событие `trip.completed`.

Все новые события пушатся в эндпоинт `/api/sync/events` (append-only), обеспечивая строгую синхронизацию оффлайн-сценариев.

## 04 Марта 2026 (Аудит 2.5 — Фиксы)
**Исправления по результатам аудита Agent 7**
- **H-21 UUID**: Заменён `Math.random().toString(36)` на `uuidv4()` (пакет `uuid`) в `CheckpointScreen.tsx` и `TripCompletionScreen.tsx`.
- **H-22 Загрузка фото**: Создан `src/api/upload.ts` — multipart/form-data загрузка на `POST /api/uploads`. `CheckpointScreen` теперь загружает фото на сервер перед сохранением события, с fallback на локальный URI при отсутствии связи.
- **H-20 API URL**: Заменён hardcoded `http://localhost:4000` на `process.env.EXPO_PUBLIC_API_URL` в `auth.ts`, `sync.ts`, `upload.ts`. Создан `.env` файл.
- **M-20 Ошибки синхронизации**: `console.error` заменён на `Alert.alert` с понятным сообщением для водителя в `sync.ts`.
