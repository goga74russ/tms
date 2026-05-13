/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

// CSP mirrors the API helmet config (apps/api). Applied only in production —
// Next dev needs 'unsafe-eval' for React Refresh, so leaving CSP off in dev
// keeps the developer experience clean while still hardening prod.
const cspDirectives = [
    "default-src 'self'",
    // Next runtime injects inline bootstrap scripts; React Refresh needs eval in dev,
    // but even prod builds require 'unsafe-inline' for the framework's hydration shim.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    // API + WS — connect to same-origin /api and /api/ws by default.
    "connect-src 'self' http: https: ws: wss:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
];

const securityHeaders = [
    {
        key: 'Content-Security-Policy',
        value: cspDirectives.join('; '),
    },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig = {
    output: 'standalone',  // Minimal Docker image (~100MB vs ~500MB)
    transpilePackages: ['@tms/shared'],
    eslint: { ignoreDuringBuilds: true },  // Lint separately, don't block build
    async rewrites() {
        // Proxy /api/* to the backend API server
        // This keeps all requests same-origin (no cross-origin cookie issues)
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
        // Strip /api suffix for the destination since we're rewriting /api/:path*
        const apiBase = apiUrl.replace(/\/api\/?$/, '');
        return [
            {
                source: '/api/:path*',
                destination: `${apiBase}/api/:path*`,
            },
        ];
    },
    async headers() {
        if (!isProd) return [];
        return [
            {
                source: '/:path*',
                headers: securityHeaders,
            },
        ];
    },
};

export default nextConfig;
