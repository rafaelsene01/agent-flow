import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const config = {
  allowedDevOrigins: ["*.*", "*.*.*", "*.*.*.*"],
  output: isDev ? undefined : "export",
  distDir: "out",
  images: { unoptimized: true },
  turbopack: { root: path.resolve(__dirname, "..") },
  // Boards com viewFilter de repo esparso fazem varredura server-side de várias
  // páginas do GitHub e podem levar >30s. O proxy de dev do Next corta em ~30s
  // por padrão (socket hang up / ECONNRESET); subimos para 2min.
  experimental: { proxyTimeout: 120_000 },
  ...(isDev && {
    async rewrites() {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:5522/api/:path*",
        },
      ];
    },
  }),
};

export default config;
