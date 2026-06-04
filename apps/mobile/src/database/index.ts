import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from './schema';
import migrations from './migrations';
import Trip from './models/Trip';
import RoutePoint from './models/RoutePoint';
import AppEvent from './models/AppEvent';

const adapter = new SQLiteAdapter({
    schema,
    migrations,
    jsi: false,
    // C9: раньше ошибка инициализации БД глушилась молча (`() => {}`) —
    // приложение продолжало работать на сломанной БД без единого следа
    // (коррупция / провал миграции / несовпадение схемы). Логируем с контекстом,
    // чтобы сбой был диагностируем в логах устройства.
    onSetUpError: (error: unknown) => {
        console.error('[database] WatermelonDB setup failed — локальная БД в нерабочем состоянии:', error);
    },
});

export const database = new Database({
    adapter,
    modelClasses: [
        Trip,
        RoutePoint,
        AppEvent,
    ],
});
