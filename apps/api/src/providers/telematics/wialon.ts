// ============================================================
// Wialon telematics — REAL skeleton.
// Docs: https://sdk.wialon.com/wiki/en/sidebar/remoteapi/apiref/apiref
// Auth: token-based — POST /wialon/ajax.html?svc=token/login&params={"token":"..."}
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import { mapProviderError } from '../_errors.js';
import type {
    TelematicsCredentials, TelematicsPosition, TelematicsProvider, TelematicsVehicle,
} from './interface.js';

export const WIALON_API_URL = 'https://hst-api.wialon.com';

export interface WialonCredentials extends TelematicsCredentials {
    token: string;
    apiUrl?: string;
}

// A-P1-24: Wialon eid (session id) expires after ~5 min idle. We re-login
// transparently before each public call instead of relying on a never-expiring
// in-memory sessionId.
const WIALON_TOKEN_TTL_MS = 5 * 60_000;
const TOKEN_REFRESH_SKEW_MS = 30_000;

export class WialonTelematicsProvider implements TelematicsProvider {
    readonly name = 'wialon';
    readonly providerType = 'telematics' as const;
    readonly mode = 'production' as const;

    private sessionId?: string;
    private tokenExpiresAt: number | null = null;

    constructor(private readonly creds: WialonCredentials) { }

    private get apiUrl(): string {
        return this.creds.apiUrl ?? WIALON_API_URL;
    }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            // PROV-P0-2: skeleton — методы не реализованы (см. mock-одометр).
            ok: false,
            mode: 'production',
            detail: 'wialon adapter not implemented (skeleton) — integration not live',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> {
        return { ok: true };
    }

    /** Wialon login → returns eid (session id). */
    private async ensureSession(): Promise<string> {
        if (this.sessionId && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
            return this.sessionId;
        }
        // Request:
        //   GET {apiUrl}/wialon/ajax.html?svc=token/login&params={"token":"<token>"}
        // Response: { eid: string, user: {...} } or { error: number }
        // Use httpFetch when wiring up: import { httpFetch } from '../_http.js';
        // try {
        //     const url = `${this.apiUrl}/wialon/ajax.html?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token: this.creds.token }))}`;
        //     const res = await httpFetch(url, {}, { timeoutMs: 10000, retries: 2 });
        //     if (!res.ok) throw new Error(`Wialon login HTTP ${res.status}`);
        //     const data = await res.json() as { eid?: string; error?: number };
        //     if (!data.eid) throw new Error(`Wialon login error code ${data.error}`);
        //     this.sessionId = data.eid;
        //     this.tokenExpiresAt = Date.now() + WIALON_TOKEN_TTL_MS;
        //     return this.sessionId;
        // } catch (err) {
        //     // A-P2: surface RU-mapped error to caller; 401 → auth_failed.
        //     const mapped = mapProviderError('telematics', 'wialon', err);
        //     throw Object.assign(new Error(mapped.rusMessage), { providerError: mapped });
        // }
        // Reference mapProviderError so the import is wired even while the
        // live path above is commented out — keeps tsc honest.
        void mapProviderError;
        throw new Error('Wialon login() not yet implemented — awaiting credentials.');
    }

    /** A-P1-24: re-login when eid is near expiry (Wialon: 5 min idle). */
    private async ensureFreshToken(): Promise<void> {
        if (!this.sessionId || !this.tokenExpiresAt || Date.now() > this.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
            this.sessionId = undefined;
            this.tokenExpiresAt = null;
            await this.ensureSession();
        }
    }

    async listVehicles(_creds: TelematicsCredentials): Promise<TelematicsVehicle[]> {
        await this.ensureFreshToken();
        // GET {apiUrl}/wialon/ajax.html?svc=core/search_items&params={
        //   spec:{itemsType:"avl_unit", propName:"sys_name", propValueMask:"*", sortType:"sys_name"},
        //   force:1, flags:1, from:0, to:0
        // }&sid=<eid>
        // Response: { items: Array<{ id, nm, ph, … }> }
        // TODO(real-impl): wire fetch with this.ensureSession().
        return [];
    }

    async getPositions(_vehicleIds: string[], _since: Date): Promise<TelematicsPosition[]> {
        await this.ensureFreshToken();
        // GET {apiUrl}/wialon/ajax.html?svc=core/search_items&... with flags=0x00000001|0x00000002
        // (units' last position is in `lmsg` of the item).
        // For history: svc=messages/load_interval, params { itemId, timeFrom, timeTo, flags, flagsMask, loadCount }
        // TODO(real-impl).
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
