/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optional alternate build output dir (e.g. for atomic build-and-swap deploys); defaults to .next
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
  experimental: {
    serverComponentsExternalPackages: ['web-push'],
  },
};

export default nextConfig;
