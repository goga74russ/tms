import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from './schema';
import Trip from './models/Trip';
import RoutePoint from './models/RoutePoint';
import AppEvent from './models/AppEvent';

const adapter = new SQLiteAdapter({
    schema,
    jsi: false,
    onSetUpError: () => {},
});

export const database = new Database({
    adapter,
    modelClasses: [
        Trip,
        RoutePoint,
        AppEvent,
    ],
});
