"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/tools/background-remover", label: "Remove Background" },
  { href: "/tools/background-remover/developer", label: "Developer" },
  { href: "/tools/background-remover/api", label: "API Guide" },
  { href: "/tools/background-remover/security", label: "Security" },
];

export default function ToolNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="toolnav" aria-label="Background remover">
      <Link href="/tools/background-remover" className="brand">
        <span aria-hidden>✂️</span> Remove Background
      </Link>
      <div className="links" role="menubar">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
