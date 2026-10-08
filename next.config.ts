import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Whether model weights are fetched from the HF Hub (remote) or served from
// /public/models (self-hosted). Controls whether the CSP `connect-src` must
// allow the HF CDN. See plan §10.1 / §12.2.
const remoteModels = process.env.NEXT_PUBLIC_BG_REMOTE_MODELS !== "false";
const modelHost =
  process.env.NEXT_PUBLIC_BG_MODEL_HOST || "https://huggingface.co";

// Remote model + WASM-backend hosts the browser is allowed to reach.
// `*.cdn.hf.co` covers HF's newer "Xet" storage backend — large files on
// huggingface.co redirect to a region-specific subdomain under it (observed:
// us.aws.cdn.hf.co), and that subdomain isn't enumerable in advance.
const remoteConnect = remoteModels
  ? [
      modelHost,
      "https://cdn.jsdelivr.net",
      "https://cdn-lfs.huggingface.co",
      "https://cdn-lfs-us-1.huggingface.co",
      "https://*.cdn.hf.co",
    ]
  : [];

// `'unsafe-inline'` is required even in production: Next.js's static export
// embeds per-page inline <script> tags carrying the serialized RSC/hydration
// payload, and there's no server to inject nonces for a purely static site.
// `'unsafe-eval'` is only needed by the Next.js dev runtime. jsdelivr is
// needed here (not just connect-src) because onnxruntime-web's wasm loader
// is a dynamically `import()`-ed .mjs module, which script-src governs.
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "'wasm-unsafe-eval'",
  ...(remoteModels ? ["https://cdn.jsdelivr.net"] : []),
  ...(isDev ? ["'unsafe-eval'"] : []),
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
// No Cross-Origin-Embedder-Policy: the WASM backend is pinned to
// single-threaded (see ml.worker.ts), so cross-origin isolation /
// SharedArrayBuffer is never needed — and enabling it is what previously
// made onnxruntime-web opt into a pthread codepath that crashed under CSP.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "export",
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
