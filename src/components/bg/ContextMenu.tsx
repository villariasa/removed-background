"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Skip the pointerdown-outside check for the event that's still
    // dispatching right now — React flushes this effect synchronously at
    // the end of the native "contextmenu" event that opened the menu, so a
    // same-tick "pointerdown" (or the trailing mouseup of that same
    // right-click on some platforms) must not immediately close it.
    const openedAt = performance.now();

    const onPointerDown = (e: PointerEvent) => {
      if (performance.now() - openedAt < 50) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // Clamp to the viewport once the menu has a real size.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Editor actions"
      className="fixed z-50 min-w-[230px] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: x, top: y }}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={it.key || i} role="separator" className="my-1 h-px bg-border" />
        ) : (
          <button
            key={it.key}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              if (it.disabled) return;
              it.onSelect?.();
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm [&_svg]:size-4 [&_svg]:shrink-0",
              it.disabled
                ? "cursor-not-allowed opacity-40"
                : "cursor-pointer hover:bg-accent hover:text-accent-foreground",
              it.danger && !it.disabled && "text-destructive",
            )}
          >
            {it.icon}
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
