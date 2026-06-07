"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Reads `?frn=` from the URL and scrolls to the matching table row.
 * Adds a temporary highlight class for 2 seconds.
 *
 * Usage: call this hook in the page component. It will look for an element
 * with `data-frn="{frnValue}"` and scroll + highlight it once.
 */
export function useFrnDeepLink() {
  const searchParams = useSearchParams();
  const frnParam = searchParams.get("frn");
  const handled = useRef(false);

  useEffect(() => {
    if (!frnParam || handled.current) return;

    // Allow a tick for the table to render
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-frn="${frnParam}"]`);
      if (el) {
        handled.current = true;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("frn-highlight");
        setTimeout(() => {
          el.classList.remove("frn-highlight");
        }, 2000);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [frnParam]);

  return frnParam;
}
