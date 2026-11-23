import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-hosted containers opt in; Vercel uses its native Next.js output.
  ...(process.env.WEB_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  transpilePackages: ['@eventos/contracts'],
};

export default nextConfig;
