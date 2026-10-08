import type { Metadata } from "next";
import ToolNav from "@/components/bg/ToolNav";

export const metadata: Metadata = {
  title: "Remove Background",
};

export default function ToolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ToolNav />
      <main>{children}</main>
    </>
  );
}
