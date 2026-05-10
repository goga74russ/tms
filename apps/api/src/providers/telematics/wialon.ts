// ============================================================
// Wialon telematics — REAL skeleton.
// Docs: https://sdk.wialon.com/wiki/en/sidebar/remoteapi/apiref/apiref
// Auth: token-based — POST /wialon/ajax.html?svc=token/login&params={"token":"..."}
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    TelematicsCredentials, TelematicsPosition, TelematicsProvider, TelematicsVehicle,
} from './interface.js';

export const WIALON_API_URL = 'https://hst-api.wialon.com';

export interface WialonCredentials extends TelematicsCredentials {
    token: string;
    apiUrl?: string;
}

export class WialonTelematicsProvider implements TelematicsProvider {
    readonly name = 'wialon';
    readonly providerType = 'telematics' as const;
    readonly mode = 'production' as const;

    private sessionId?: string;

    constructor(private readonly creds: WialonCredentials) { }

    private get apiUrl(): string {
        return this.creds.apiUrl ?? WIALON_API_URL;
    }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.token),
            mode: 'production',
            detail: 'wialon token present',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> {
        return { ok: true };
    }

    /** Wialon login → returns eid (session id). */
    private async ensureSession(): Promise<string> {
        if (this.sessionId) return this.sessionId;
        // Request:
        //   GET {apiUrl}/wialon/ajax.html?svc=token/login&params={"token":"<token>"}
        // Response: { eid: string, user: {...} } or { error: number }
        // TODO(real-impl): wire fetch.
        // const url = `${this.apiUrl}/wialon/ajax.html?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token: this.creds.token }))}`;
        // const res = await fetch(url);
        // if (!res.ok) throw new Error(`Wialon login HTTP ${res.status}`);
        // const data = await res.json() as { eid?: string; error?: number };
        // if (!data.eid) throw new Error(`Wialon login error: ${data.error}`);
        // this.sessionId = data.eid;
        throw new Error('Wialon login() not yet implemented — awaiting credentials.');
    }

    async listVehicles(_creds: TelematicsCredentials): Promise<TelematicsVehicle[]> {
        // GET {apiUrl}/wialon/ajax.html?svc=core/search_items&params={
        //   spec:{itemsType:"avl_unit", propName:"sys_name", propValueMask:"*", sortType:"sys_name"},
        //   force:1, flags:1, from:0, to:0
        // }&sid=<eid>
        // Response: { items: Array<{ id, nm, ph, … }> }
        // TODO(real-impl): wire fetch with this.ensureSession().
        await this.ensureSession();
        return [];
    }

    async getPositions(_vehicleIds: string[], _since: Date): Promise<TelematicsPosition[]> {
        // GET {apiUrl}/wialon/ajax.html?svc=core/search_items&... with flags=0x00000001|0x00000002
        // (units' last position is in `lmsg` of the item).
        // For history: svc=messages/load_interval, params { itemId, timeFrom, timeTo, flags, flagsMask, loadCount }
        // TODO(real-impl).
        await this.ensureSession();
        return [];
    }

    async startTracking(_vehicleId: string): Promise<void> {
        // For Wialon we typically subscribe via the same login session and
        // poll messages/load_interval. No explicit start endpoint.
    }

    async stopTracking(_vehicleId: string): Promise<void> {
        // Symmetric — could call core/logout when the last vehicle is removed.
    }
}
