// ============================================================
// Storage Service — S3-compatible (MinIO in prod, local fallback in dev)
// ============================================================
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET || 'tms';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || '';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || '';
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL; // e.g. https://storage.example.com/tms
const USE_LOCAL = !S3_ENDPOINT && process.env.NODE_ENV !== 'production';

// Local uploads directory (dev only)
const LOCAL_UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const LOCAL_PUBLIC_BASE = process.env.LOCAL_PUBLIC_BASE || 'http://localhost:4000/uploads';

let s3: S3Client | null = null;

function getS3Client(): S3Client {
    if (!s3) {
        s3 = new S3Client({
            region: S3_REGION,
            endpoint: S3_ENDPOINT,
            forcePathStyle: true, // required for MinIO
            credentials: {
                accessKeyId: S3_ACCESS_KEY,
                secretAccessKey: S3_SECRET_KEY,
            },
        });
    }
    return s3;
}

export interface UploadResult {
    key: string;
    url: string;
    bucket: string;
}

const MIME_EXTENSIONS: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'application/pdf': '.pdf',
};

function safeStorageFolder(folder?: string) {
    return (folder || 'uploads')
        .split('/')
        .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, '_'))
        .filter(Boolean)
        .join('/') || 'uploads';
}

function resolveLocalUploadPath(key: string) {
    const uploadsRoot = path.resolve(LOCAL_UPLOADS_DIR);
    const targetPath = path.resolve(uploadsRoot, key);
    const relativePath = path.relative(uploadsRoot, targetPath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Invalid storage key');
    }
    return targetPath;
}

/**
 * Upload a Buffer to S3/MinIO (or local disk in dev).
 * Returns the key and public URL.
 */
export async function uploadBuffer(
    buffer: Buffer,
    options: { folder?: string; filename?: string; contentType?: string }
): Promise<UploadResult> {
    const ext = options.contentType ? MIME_EXTENSIONS[options.contentType] ?? '.bin' : '.bin';
    const folder = safeStorageFolder(options.folder);
    const key = `${folder}/${crypto.randomUUID()}${ext}`;

    if (USE_LOCAL) {
        const dir = path.join(LOCAL_UPLOADS_DIR, folder);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(resolveLocalUploadPath(key), buffer);
        return { key, url: `${LOCAL_PUBLIC_BASE}/${key}`, bucket: 'local' };
    }

    const client = getS3Client();
    await client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: options.contentType || 'application/octet-stream',
    }));

    const url = S3_PUBLIC_URL
        ? `${S3_PUBLIC_URL}/${key}`
        : `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;

    return { key, url, bucket: S3_BUCKET };
}

/**
 * Delete an object from S3/MinIO (or local disk in dev).
 */
export async function deleteObject(key: string): Promise<void> {
    if (USE_LOCAL) {
        await fs.unlink(resolveLocalUploadPath(key)).catch(() => {});
        return;
    }
    const client = getS3Client();
    await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

/**
 * Generate a pre-signed GET URL (valid for 1 hour by default).
 */
export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    if (USE_LOCAL) {
        resolveLocalUploadPath(key);
        return `${LOCAL_PUBLIC_BASE}/${key}`;
    }
    const client = getS3Client();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn });
}
