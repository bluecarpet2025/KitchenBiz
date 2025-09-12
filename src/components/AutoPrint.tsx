"use client";
import { useEffect } from "react";

/** Triggers the browser print dialog once after mount. */
export default function AutoPrint() {
  useEffect(() => {
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}
