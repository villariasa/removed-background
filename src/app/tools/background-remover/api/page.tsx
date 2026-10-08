import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "API Guide — Remove Background",
  description: "Client-side usage and the optional server REST API.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-foreground p-4 text-[0.82rem] leading-relaxed text-background">
      <code>{children}</code>
    </pre>
  );
}

const ic = "rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono";

export default function ApiPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 pb-24">
      <h1 className="text-3xl font-semibold tracking-tight">API Guide</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        How the tool reaches its models and runtime — plus an optional server path.
      </p>

      <Card className="mt-6 border-l-4 border-l-green-600 py-4">
        <CardContent>
          <strong>No API keys, no accounts.</strong> The default path is 100% client-side: all
          models are public and loaded straight into the browser.
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Model access</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Model</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 font-medium">Token?</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-4">RMBG-1.4 (auto matte)</td>
                <td className="py-2 pr-4">
                  HuggingFace Hub <code className={ic}>briaai/RMBG-1.4</code>
                </td>
                <td className="py-2">No</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">BiRefNet (upgrade path)</td>
                <td className="py-2 pr-4">HF Hub public ONNX export</td>
                <td className="py-2">No</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Weights can be served two ways: <strong className="text-foreground">remote</strong>{" "}
          (fetched from the HF Hub CDN on first run, then cached) or{" "}
          <strong className="text-foreground">self-hosted</strong> (download the{" "}
          <code className={ic}>.onnx</code> + <code className={ic}>config.json</code> into{" "}
          <code className={ic}>public/models/</code>). Toggle with{" "}
          <code className={ic}>NEXT_PUBLIC_BG_REMOTE_MODELS</code>.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Client-side usage</h2>
        <p className="mt-3 text-muted-foreground">The matting runs in a Web Worker via Transformers.js:</p>
        <Code>{`import { AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";

const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
  device: "webgpu",   // falls back to "wasm"
  dtype: "fp16",
});
const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4");

const image = new RawImage(rgba, width, height, 4);
const { pixel_values } = await processor(image);
const { output } = await model({ input: pixel_values });

// output[0] is the 0..1 matte -> scale to a single-channel alpha mask
const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8"))
  .resize(width, height);`}</Code>
      </section>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Configuration</h2>
        <Code>{`# .env.local  (all optional)
NEXT_PUBLIC_BG_MODEL=rmbg             # rmbg | birefnet
NEXT_PUBLIC_BG_REMOTE_MODELS=true     # false = load from /public/models
NEXT_PUBLIC_BG_MODEL_HOST=https://huggingface.co`}</Code>
      </section>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Optional server REST API</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          If you ever move inference server-side (heavier models / old browsers), expose a tiny
          REST endpoint and have the client swap its &ldquo;auto&rdquo; call for a{" "}
          <code className={ic}>fetch</code>. All manual tools stay client-side.
        </p>
        <Code>{`POST /api/bg/remove
  Content-Type: multipart/form-data
  fields:  image=<file>   (png/jpg/webp, <= ~15 MB)
  query:   ?model=rmbg|birefnet  &format=png|webp
  auth:    Authorization: Bearer <BG_API_TOKEN>   (optional)
  200 ->   image/png  (RGBA with alpha)
  errors:  400 bad/oversized image · 401 bad token
           415 unsupported type · 429 rate-limited`}</Code>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Reference implementation: FastAPI + <code className={ic}>rembg</code>. Harden with
          bearer-token auth, per-IP rate limiting, max upload size, a MIME allow-list, no
          persistence, and CORS restricted to your origin.
        </p>
      </section>
    </div>
  );
}
