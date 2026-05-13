/**
 * Mock for @nozbe/watermelondb/sync.
 *
 * Tests can:
 *   - inspect __lastCall to see what args sync was invoked with
 *   - call __setPullResponse / __setPushError to control behaviour
 *
 * The mock invokes pullChanges + pushChanges with realistic args so the
 * caller's transformation code runs end-to-end.
 */
let pullResponse: { changes: any; timestamp: number } | null = { changes: {}, timestamp: Date.now() };
let pushError: Error | null = null;
let lastCall: any = null;

export async function synchronize(opts: any): Promise<void> {
    lastCall = opts;

    const pulled = await opts.pullChanges({
        lastPulledAt: 0,
        schemaVersion: 1,
        migration: null,
    });

    if (!pulled || !pulled.timestamp) {
        // Allow tests to assert that pull errors bubble up
        throw new Error('pull returned no timestamp');
    }

    await opts.pushChanges({
        changes: pulled.changes ?? {},
        lastPulledAt: pulled.timestamp,
    });

    if (pushError) throw pushError;
}

export function __setPullResponse(r: { changes: any; timestamp: number } | null): void {
    pullResponse = r;
}

export function __setPushError(e: Error | null): void {
    pushError = e;
}

export function __getLastCall(): any {
    return lastCall;
}

export function __reset(): void {
    pullResponse = { changes: {}, timestamp: Date.now() };
    pushError = null;
    lastCall = null;
}

// Expose for any code that imports `pullResponse` indirectly
export { pullResponse };
