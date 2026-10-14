"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Marketing pages that get the mobile sticky demo bar. The homepage is
// excluded because it already renders MobileContactBar at the bottom.
const SHOW_PREFIXES = [
  "/about",
  "/become-a-vendor",
  "/blog",
  "/case-studies",
  "/contact",
  "/demo",
  "/features",
  "/industry-pulse",
  "/pricing",
  "/security",
  "/states",
  "/tools",
];

export default function StickyDemoBar() {
  const pathname = usePathname() || "";
  const show = SHOW_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!show) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-slate-950/90 backdrop-blur-lg border-t border-white/10 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        <a
          href="tel:+18557657291"
          aria-label="Call (855) 765-7291"
          className="flex-shrink-0 w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </a>
        <Link
          href="/book-demo?source=sticky-bar"
          className="flex-1 text-center bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 rounded-xl transition"
        >
          Book a Demo
        </Link>
      </div>
    </div>
  );
}
