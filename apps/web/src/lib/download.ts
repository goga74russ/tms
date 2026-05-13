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

export async function downloadFromApi(apiPath: string, fallbackFilename: string) {
    clickDownloadLink(apiPath, fallbackFilename);
}
