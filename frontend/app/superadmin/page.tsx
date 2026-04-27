"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth-store";

export default function SuperadminIndex() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user && user.role !== "super" && user.role !== "admin") {
      router.replace("/sign-in");
    }
  }, [user, router]);

  if (!user || (user.role !== "super" && user.role !== "admin")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Sign in as super to view this page.</p>
      </div>
    );
  }

  const tiles = [
    {
      href: "/superadmin/leads",
      title: "Inbound Leads",
      desc: "Review every lead captured from public forms (erateapp.com get-started, FRN tracker, sign-up funnel).",
      icon: "📥",
    },
    {
      href: "/superadmin/mail-campaigns",
      title: "Mail Campaigns",
      desc: "Operate the mail.skyrate.ai outbound queue: dashboards, paused sends, and approval workflows.",
      icon: "✉️",
    },
    {
      href: "/admin",
      title: "Standard Admin Panel",
      desc: "Users, tickets, FRN monitor, promo invites, communications, blog manager.",
      icon: "🛠️",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="font-bold text-xl">SkyRate<span className="text-purple-400">.AI</span></span>
            <span className="ml-2 text-xs bg-amber-500 text-slate-900 px-2 py-0.5 rounded-full font-semibold">SUPER</span>
          </div>
          <span className="text-sm text-slate-400">{user.email}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Superadmin Console</h1>
        <p className="text-slate-600 mb-8 text-sm">
          High-trust dashboards for SkyRate operators. All routes here are no-indexed.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="block rounded-xl border border-slate-200 bg-white hover:border-purple-300 hover:shadow-md transition p-5"
            >
              <div className="text-3xl mb-2">{t.icon}</div>
              <h2 className="font-semibold text-slate-900">{t.title}</h2>
              <p className="text-xs text-slate-500 mt-1">{t.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
