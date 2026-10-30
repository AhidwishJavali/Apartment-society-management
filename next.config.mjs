/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "mongoose", "bcryptjs"],
};

export default nextConfig;
