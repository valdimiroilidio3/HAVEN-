import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["node:sqlite"],
  experimental: {
    // Server Actions receive only typed, Zod-validated payloads.
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    // Locally uploaded media is served from /uploads; remote Supabase Storage
    // hosts are added through NEXT_PUBLIC_SUPABASE_STORAGE_HOST when configured.
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
