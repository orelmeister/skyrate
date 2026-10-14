import Link from "next/link";

const NAV = [
  { href: "/features/consultants", label: "For Consultants" },
  { href: "/features/vendors", label: "For Vendors" },
  { href: "/features/applicants", label: "For Applicants" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
];

/** Shared sticky header for the marketing/feature pages (dark theme). */
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
        <div className="hidden md:flex items-center gap-8">
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
        </div>
      </nav>
    </header>
  );
}
