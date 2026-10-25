import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const apiOrigin = new URL(api).origin;
const wsOrigin = apiOrigin.replace(/^http/, "ws");

// Strict CSP: no third-party scripts; API/WebSocket origins whitelisted explicitly.
const csp = [
  "default-src 'self'",
  `connect-src 'self' ${apiOrigin} ${wsOrigin}`,
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@wasitx/ui"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(config);
