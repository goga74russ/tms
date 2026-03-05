/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',  // Minimal Docker image (~100MB vs ~500MB)
    transpilePackages: ['@tms/shared'],
};

export default nextConfig;
