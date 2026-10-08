import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Whether model weights are fetched from the HF Hub (remote) or served from
// /public/models (self-hosted). Controls whether the CSP `connect-src` must
// allow the HF CDN. See plan §10.1 / §12.2.
const remoteModels = process.env.NEXT_PUBLIC_BG_REMOTE_MODELS !== "false";
const modelHost =
  process.env.NEXT_PUBLIC_BG_MODEL_HOST || "https://huggingface.co";

// Remote model + WASM-backend hosts the browser is allowed to reach.
const remoteConnect = remoteModels
  ? [modelHost, "https://cdn.jsdelivr.net", "https://cdn-lfs.huggingface.co", "https://cdn-lfs-us-1.huggingface.co"]
  : [];

// `'unsafe-eval'` is only needed by the Next.js dev runtime; production relies
// solely on `'wasm-unsafe-eval'` for the WASM backend.
const scriptSrc = [
  "'self'",
  "'wasm-unsafe-eval'",
  ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
].join(" ");

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "worker-src 'self' blob:",
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' blob: data: ${remoteConnect.join(" ")}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
]
  .join("; ")
  .trim();

// Security headers for the tool routes (plan §10.4 / §12.2).
// COEP=credentialless enables cross-origin isolation (threaded WASM, WebGPU)
// while still allowing cross-origin model fetches without CORP headers.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/tools/background-remover/:path*",
        headers: securityHeaders,
      },
      {
        source: "/tools/background-remover",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
