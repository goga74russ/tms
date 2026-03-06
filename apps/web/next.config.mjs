/** @type {import('next').NextConfig} */
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
};

export default nextConfig;

