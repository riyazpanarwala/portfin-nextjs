/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client', 'prisma', 'yahoo-finance2', 'xlsx'],
};

export default nextConfig;
