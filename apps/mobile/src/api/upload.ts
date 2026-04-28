import { getToken } from './auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

/**
 * Upload a photo file to the server.
 * Returns the URL of the uploaded file on the server.
 */
export async function uploadPhoto(localUri: string): Promise<string> {
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

    const formData = new FormData();
    formData.append('file', {
        uri: localUri,
        name: filename,
        type: mimeType,
    } as any);

    const response = await fetch(`${API_URL}/uploads`, {
        method: 'POST',
        body: formData,
        headers: {
            Authorization: `Bearer ${token}`,
            // Content-Type is set automatically by fetch for FormData
        },
    });

    if (!response.ok) {
        throw new Error('Failed to upload photo');
    }

    const result = await response.json();
    return result.data?.url || result.url;
}
