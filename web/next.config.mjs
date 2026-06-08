import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const config = {
  output: isDev ? undefined : "export",
  distDir: "out",
  images: { unoptimized: true },
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  ...(isDev && {
    async rewrites() {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:5522/api/:path*",
        },
        {
          source: "/:path+",
          destination: "/",
        },
      ];
    },
  }),
};

export default config;
