"use client";

import dynamic from "next/dynamic";

// The editor loads ~tens of MB of ML runtime/weights on demand, so it is
// strictly client-only — never server-rendered (plan §2 / §7).
const Editor = dynamic(() => import("@/components/bg/Editor"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: "4rem 1.25rem", textAlign: "center", color: "#6b7280" }}>
      Loading editor…
    </div>
  ),
});

export default function Page() {
  return <Editor />;
}
