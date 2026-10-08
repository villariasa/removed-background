import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Guide — Remove Background",
  description: "Client-side usage and the optional server REST API.",
};

export default function ApiPage() {
  return (
    <div className="page">
      <h1>API Guide</h1>
      <p className="lead">
        How the tool reaches its models and runtime — plus an optional server path.
      </p>

      <div className="callout good">
        <strong>No API keys, no accounts.</strong> The default path is 100% client-side: all
        models are public and loaded straight into the browser.
      </div>

      <h2>Model access</h2>
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>Source</th>
            <th>Token?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>RMBG-1.4 (auto matte)</td>
            <td>
              HuggingFace Hub <code>briaai/RMBG-1.4</code>
            </td>
            <td>No</td>
          </tr>
          <tr>
            <td>BiRefNet (upgrade path)</td>
            <td>HF Hub public ONNX export</td>
            <td>No</td>
          </tr>
        </tbody>
      </table>
      <p>
        Weights can be served two ways: <strong>remote</strong> (the runtime fetches from the
        HF Hub CDN on first run, then caches) or <strong>self-hosted</strong> (download the
        <code>.onnx</code> + <code>config.json</code> into <code>public/models/</code> and load
        them same-origin). Toggle with <code>NEXT_PUBLIC_BG_REMOTE_MODELS</code>.
      </p>

      <h2>Client-side usage</h2>
      <p>The matting runs in a Web Worker via Transformers.js:</p>
      <pre>
        <code>{`import { AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";

const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
  device: "webgpu",   // falls back to "wasm"
  dtype: "fp16",
});
const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4");

const image = new RawImage(rgba, width, height, 4);
const { pixel_values } = await processor(image);
const { output } = await model({ input: pixel_values });

// output[0] is the 0..1 matte → scale to a single-channel alpha mask
const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8"))
  .resize(width, height);`}</code>
      </pre>

      <h2>Configuration</h2>
      <pre>
        <code>{`# .env.local  (all optional)
NEXT_PUBLIC_BG_MODEL=rmbg             # rmbg | birefnet
NEXT_PUBLIC_BG_REMOTE_MODELS=true     # false = load from /public/models
NEXT_PUBLIC_BG_MODEL_HOST=https://huggingface.co`}</code>
      </pre>

      <h2>Optional server REST API</h2>
      <p>
        If you ever move inference server-side (heavier models / old browsers), expose a tiny
        REST endpoint and have the client swap its &ldquo;auto&rdquo; call for a{" "}
        <code>fetch</code>. All manual tools stay client-side.
      </p>
      <pre>
        <code>{`POST /api/bg/remove
  Content-Type: multipart/form-data
  fields:  image=<file>   (png/jpg/webp, <= ~15 MB)
  query:   ?model=rmbg|birefnet  &format=png|webp
  auth:    Authorization: Bearer <BG_API_TOKEN>   (optional)
  200 ->   image/png  (RGBA with alpha)
  errors:  400 bad/oversized image · 401 bad token
           415 unsupported type · 429 rate-limited`}</code>
      </pre>
      <p>
        Reference implementation: FastAPI + <code>rembg</code>. Harden with bearer-token auth,
        per-IP rate limiting, max upload size, a MIME allow-list, no persistence, and CORS
        restricted to your origin.
      </p>
    </div>
  );
}
