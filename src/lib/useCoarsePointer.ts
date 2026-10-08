"use client";

import { useEffect, useState } from "react";

/**
 * Whether the primary input is a coarse pointer (touch), independent of
 * viewport width. Some phones report a CSS viewport width past common
 * breakpoints (e.g. 768px), which would otherwise serve them a
 * mouse-oriented desktop layout — confirmed happening on a real device.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}
