export function ensureExtension(filename: string, blob: Blob): string {
    if (/\.[a-z0-9]+$/i.test(filename)) return filename;

    const extensionMap: Record<string, string> = {
        'application/pdf': '.pdf',
        'application/xml': '.xml',
        'text/xml': '.xml',
        'application/json': '.json',
        'text/csv': '.csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-excel': '.xls',
        'application/octet-stream': '',
    };

    return filename + (extensionMap[blob.type] ?? '');
}

export function sanitizeFilename(filename: string) {
    return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

function clickDownloadLink(href: string, filename?: string) {
    const link = document.createElement('a');
    link.href = href;
    if (filename) {
        link.setAttribute('download', sanitizeFilename(filename));
        link.download = sanitizeFilename(filename);
    }
    link.style.display = 'none';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

export function saveBlob(blob: Blob, filename: string) {
    const safeFilename = sanitizeFilename(ensureExtension(filename, blob));
    const file = new File([blob], safeFilename, { type: blob.type || 'application/octet-stream' });
    const url = URL.createObjectURL(file);
    clickDownloadLink(url, safeFilename);

    window.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 3000);
}

/**
 * Скачать файл с API. Раньше вешался простой `<a href download>` — при ответе
 * 4xx/5xx (например 422 ETRN_DATA_INCOMPLETE) браузер показывал «Сайт недоступен»
 * и проглатывал причину. Теперь: fetch → на успех сохраняем blob, на ошибку
 * парсим JSON-сообщение сервера и отдаём его в onError (тост у вызывающего).
 * Не бросает исключений — безопасно для fire-and-forget вызовов.
 */
export async function downloadFromApi(
    apiPath: string,
    fallbackFilename: string,
    onError?: (message: string, status: number) => void,
): Promise<void> {
    try {
        const res = await fetch(apiPath, { credentials: 'include' });
        if (!res.ok) {
            let message = `Не удалось скачать файл (ошибка ${res.status})`;
            try {
                const data = await res.clone().json();
                if (data?.error) message = String(data.error);
            } catch {
                // тело не JSON — оставляем дефолтное сообщение
            }
            if (onError) onError(message, res.status);
            else console.error('[downloadFromApi]', apiPath, message);
            return;
        }
        const blob = await res.blob();
        saveBlob(blob, fallbackFilename);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Ошибка сети при загрузке';
        if (onError) onError(message, 0);
        else console.error('[downloadFromApi]', apiPath, message);
    }
}
