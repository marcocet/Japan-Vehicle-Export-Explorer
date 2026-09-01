import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server (HMR websocket, etc.) work when accessed via the VM's network
  // IP instead of localhost — without this, Next.js 16 silently blocks those requests.
  allowedDevOrigins: ["10.10.5.100"],
};

export default nextConfig;
