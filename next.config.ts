import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Old links -> new public route
      { source: '/share/:token', destination: '/app/share/:token' },
      { source: '/menu/share/:token', destination: '/app/share/:token' },
    ];
  },
};

export default nextConfig;
