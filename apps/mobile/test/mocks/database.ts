/**
 * Mocked WatermelonDB `database` singleton.
 *
 * Provides a `collections.get(name)` that returns an in-memory bag with:
 *   - query(...).fetch() → resolves to seeded rows
 *   - query(...).observe().subscribe(cb) → fires once, returns unsubscribe stub
 *
 * Tests seed via __setRows(collection, rows). __reset clears between tests.
 */

const fixtures: Map<string, any[]> = new Map();

function mkQuery(rows: any[]) {
    return {
        fetch: async () => rows,
        observe: () => ({
            subscribe: (cb: (v: any) => void) => {
                // Fire once asynchronously to mimic real observable.
                Promise.resolve().then(() => cb(rows));
                return { unsubscribe: () => undefined };
            },
        }),
    };
}

function mkCollection(name: string) {
    return {
        query: (..._args: any[]) => mkQuery(fixtures.get(name) ?? []),
        find: async (id: string) => (fixtures.get(name) ?? []).find((r: any) => r.id === id),
    };
}

export const database: any = {
    collections: {
        get: <T = any,>(_name: string) => mkCollection(_name) as any,
    },
    write: async (fn: () => Promise<any>) => fn(),
    unsafeResetDatabase: async () => undefined,
};

export const __setRows = (collection: string, rows: any[]): void => {
    fixtures.set(collection, rows);
};

export const __reset = (): void => {
    fixtures.clear();
};

export default database;
