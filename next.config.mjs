/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/app', destination: '/', permanent: true },
    ];
  },
};

export default nextConfig;
