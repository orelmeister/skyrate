import Link from "next/link";
import { CONTACT } from "@/lib/siteConfig";

const NAV = [
  { href: "/features/consultants", label: "For Consultants" },
  { href: "/features/applicants", label: "For Schools" },
  { href: "/features/vendors", label: "For Vendors" },
  { href: "/pricing", label: "Pricing" },
  { href: "/case-studies", label: "Case Studies" },
  { href: "/tools/frn-tracker", label: "Free Tools" },
  { href: "/blog", label: "Blog" },
];

/**
 * THE single shared sticky header for every public marketing page
 * (external CRO audit 2026-10-14: "ONE header everywhere").
 * CSS-only mobile menu - no client JS needed, works in server components.
 */
export default function MarketingHeader({ active }: { active?: string }) {
  return (
    <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/10">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/images/logos/logo-icon-transparent.png"
            alt=""
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="text-white font-bold text-xl">
            SkyRate<span className="text-purple-400">.AI</span>
          </span>
        </Link>
        <div className="hidden lg:flex items-center gap-6">
          {NAV.map((n) =>
            n.href === active ? (
              <Link key={n.href} href={n.href} className="text-purple-300 text-sm font-medium">
                {n.label}
              </Link>
            ) : (
              <Link
                key={n.href}
                href={n.href}
                className="text-slate-300 hover:text-white text-sm transition-colors"
              >
                {n.label}
              </Link>
            )
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={CONTACT.phoneHref}
            className="hidden xl:flex items-center gap-1.5 text-slate-400 hover:text-white transition text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {CONTACT.phoneDisplay}
          </a>
          <Link
            href="/sign-in"
            className="text-slate-300 hover:text-white text-sm transition-colors hidden sm:block"
          >
            Sign In
          </Link>
          <Link
            href="/book-demo"
            className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Book a Demo
          </Link>
          {/* CSS-only mobile menu button */}
          <label htmlFor="mkt-menu-toggle" className="lg:hidden cursor-pointer p-2 -mr-2" aria-label="Open menu">
            <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </label>
        </div>
      </nav>
      <input type="checkbox" id="mkt-menu-toggle" className="hidden peer" />
      <div className="hidden peer-checked:block lg:!hidden border-t border-white/10 px-4 sm:px-6 pb-4">
        <nav className="flex flex-col gap-3 pt-3">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-slate-300 hover:text-white font-medium py-1">
              {n.label}
            </Link>
          ))}
          <a href={CONTACT.phoneHref} className="text-slate-300 hover:text-white font-medium py-1">
            Call {CONTACT.phoneDisplay}
          </a>
          <Link href="/sign-in" className="text-indigo-400 font-medium py-1 sm:hidden">
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  );
}
