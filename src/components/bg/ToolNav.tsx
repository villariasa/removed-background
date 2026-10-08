"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/tools/background-remover", label: "Remove Background" },
  { href: "/tools/background-remover/developer", label: "Developer" },
  { href: "/tools/background-remover/api", label: "API Guide" },
  { href: "/tools/background-remover/security", label: "Security" },
];

export default function ToolNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Background remover"
      className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6"
    >
      <Link
        href="/tools/background-remover"
        className="flex items-center gap-2 font-semibold tracking-tight"
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Scissors className="size-4" />
        </span>
        <span className="hidden sm:inline">Remove Background</span>
      </Link>
      <div className="ml-auto flex items-center gap-1 overflow-x-auto">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
