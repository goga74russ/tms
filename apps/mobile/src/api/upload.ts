import { getToken } from './auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

const UPLOAD_TIMEOUT_MS = 30_000;
const RETRY_BACKOFFS_MS = [500, 2_000]; // 2 retries, total 3 attempts

const TIMEOUT_MESSAGE = 'Загрузка не удалась — превышено время ожидания';
const NETWORK_MESSAGE = 'Загрузка не удалась — нет связи с сервером';

export type UploadOptions = {
    /**
     * Progress callback in 0..100. Currently a no-op when using fetch
     * (the standard fetch API can't observe FormData upload progress); kept
     * in the signature so callers can wire it up once we move to XHR.
     */
    onProgress?: (pct: number) => void;
};

function isClientError(status: number): boolean {
    return status >= 400 && status < 500;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a photo file to the server.
 * Returns the URL of the uploaded file on the server.
 *
 * Behaviour:
 *  - 30s timeout per attempt via AbortController.
 *  - 2 retries on network failure / 5xx (backoff: 500ms, then 2s).
 *  - No retry on 4xx (validation, auth, etc.) — those are surfaced immediately.
 *  - Progress is not reported (fetch + RN FormData doesn't expose upload progress);
 *    the `onProgress` option is accepted for API stability with future XHR migration.
 */
export async function uploadPhoto(localUri: string, options: UploadOptions = {}): Promise<string> {
    const token = await getToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const filename = localUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const ext = match ? match[1].toLowerCase() : '';
    const MIME_MAP: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        bmp: 'image/bmp',
        webp: 'image/webp',
        heic: 'image/heic',
        heif: 'image/heif',
        svg: 'image/svg+xml',
        pdf: 'application/pdf',
    };
    const mimeType = MIME_MAP[ext] || (ext ? `image/${ext}` : 'application/octet-stream');

    // We rebuild FormData per attempt — some RN runtimes don't allow reuse
    // of an already-consumed FormData body.
    const buildBody = () => {
        const formData = new FormData();
        formData.append('file', {
            uri: localUri,
            name: filename,
            type: mimeType,
        } as any);
        return formData;
    };

    // No real upload-progress instrumentation for now, but signal start/finish
    // so callers that bind a spinner can drive it.
    options.onProgress?.(0);

    const maxAttempts = RETRY_BACKOFFS_MS.length + 1;
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
        try {
            const response = await fetch(`${API_URL}/uploads`, {
                method: 'POST',
                body: buildBody(),
                headers: {
                    Authorization: `Bearer ${token}`,
                    // Content-Type is set automatically by fetch for FormData
                },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const result = await response.json();
                options.onProgress?.(100);
                return result.data?.url || result.url;
            }

            // 4xx — do not retry, surface immediately.
            if (isClientError(response.status)) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body?.error || `Загрузка не удалась (код ${response.status})`);
            }

            // 5xx — fall through to retry.
            lastErr = new Error(`Загрузка не удалась (код ${response.status})`);
        } catch (err: any) {
            clearTimeout(timeoutId);
            // AbortError == our 30s timeout.
            if (err?.name === 'AbortError') {
                lastErr = new Error(TIMEOUT_MESSAGE);
            } else if (err instanceof Error && err.message.startsWith('Загрузка не удалась (код 4')) {
                // 4xx already classified above — bail out without retrying.
                throw err;
            } else {
                lastErr = err instanceof Error ? err : new Error(NETWORK_MESSAGE);
            }
        }

        const backoff = RETRY_BACKOFFS_MS[attempt];
        if (backoff !== undefined) {
            await sleep(backoff);
        }
    }

    throw lastErr || new Error(NETWORK_MESSAGE);
}
