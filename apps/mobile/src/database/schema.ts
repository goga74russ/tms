import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
    version: 1,
    tables: [
        tableSchema({
            name: 'trips',
            columns: [
                { name: 'trip_id', type: 'string', isIndexed: true },
                { name: 'route', type: 'string' }, // JSONified route/stops
                { name: 'status', type: 'string', isIndexed: true },
                { name: 'driver_id', type: 'string', isIndexed: true },
                { name: 'vehicle_id', type: 'string' },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
            ],
        }),
        tableSchema({
            name: 'route_points',
            columns: [
                { name: 'route_point_id', type: 'string', isIndexed: true },
                { name: 'trip_id', type: 'string', isIndexed: true },
                { name: 'address', type: 'string' },
                { name: 'type', type: 'string' },
                { name: 'status', type: 'string' },
                { name: 'window_start', type: 'number', isOptional: true },
                { name: 'window_end', type: 'number', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
            ],
        }),
        tableSchema({
            name: 'events',
            columns: [
                { name: 'event_id', type: 'string', isIndexed: true },
                { name: 'type', type: 'string', isIndexed: true },
                { name: 'entity_id', type: 'string', isIndexed: true },
                { name: 'entity_type', type: 'string' },
                { name: 'payload', type: 'string' }, // JSON payload
                { name: 'timestamp', type: 'number' },
                { name: 'synced', type: 'boolean', isIndexed: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
            ],
        }),
    ],
});
