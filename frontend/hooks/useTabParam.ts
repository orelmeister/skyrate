"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Custom hook that syncs tab state with URL search params.
 * On page load, reads `?tab=xxx` from the URL.
 * When the tab changes, updates the URL without a full page reload.
 *
 * @param defaultTab - The default tab when no URL param is present
 * @param validTabs - Optional array of valid tab values for validation
 * @returns [activeTab, setActiveTab] tuple
 */
export function useTabParam<T extends string>(
  defaultTab: T,
  validTabs?: readonly T[]
): [T, (tab: T) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tab = useMemo(() => {
    const rawTab = searchParams.get("tab");
    if (!rawTab) return defaultTab;
    // Validate against allowed tabs if provided
    if (validTabs && !validTabs.includes(rawTab as T)) return defaultTab;
    return rawTab as T;
  }, [searchParams, defaultTab, validTabs]);

  const setTab = useCallback(
    (newTab: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newTab === defaultTab) {
        params.delete("tab");
      } else {
        params.set("tab", newTab);
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, {
        scroll: false,
      });
    },
    [searchParams, router, pathname, defaultTab]
  );

  return [tab, setTab];
}
