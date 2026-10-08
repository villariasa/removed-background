import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remove Background — private, in-browser background remover",
  description:
    "Fast, private, in-browser background removal with one-click AI removal and manual keep/remove brushing. No upload, no account.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
