"use client";

import { useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

const FALLBACK_CALENDAR =
  process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendar.app.google/edkn1FDx2mBngFGs9";

type Role = "applicant" | "consultant" | "vendor" | "unsure";

export default function BookDemoPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState<Role>("unsure");
  const [hp, setHp] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim()) {
      setError("Please enter your name and email.");
      return;
    }
    setSubmitting(true);
    try {
      trackEvent("demo_request_submit", { role });
      const res = await fetch("/api/v1/leads/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          organization: organization.trim() || undefined,
          role,
          source: "skyrate.ai/book-demo",
          _hp: hp,
        }),
      });
      let calendarUrl = FALLBACK_CALENDAR;
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.calendar_url) calendarUrl = data.calendar_url;
      }
      // Redirect to the calendar to finish self-scheduling.
      window.location.href = calendarUrl;
    } catch {
      // Never trap the user — send them to the calendar regardless.
      window.location.href = FALLBACK_CALENDAR;
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="border-b border-white/10">
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/images/logos/logo-icon-transparent.png"
              alt=""
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="font-bold text-xl">
              SkyRate<span className="text-purple-400">.AI</span>
            </span>
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-3">Book your free demo</h1>
            <p className="text-slate-400">
              Tell us who you are and we&apos;ll take you straight to the calendar to pick a time.
              A SkyRate specialist will walk you through your district&apos;s real E-Rate data.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4"
          >
            {/* Honeypot — hidden from real users */}
            <input
              type="text"
              name="_hp"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />

            <div>
              <label htmlFor="bd-name" className="block text-sm font-medium text-slate-300 mb-1.5">
                Name <span className="text-purple-400">*</span>
              </label>
              <input
                id="bd-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg bg-slate-900 border border-white/10 px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label htmlFor="bd-email" className="block text-sm font-medium text-slate-300 mb-1.5">
                Work email <span className="text-purple-400">*</span>
              </label>
              <input
                id="bd-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg bg-slate-900 border border-white/10 px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="jane@yourdistrict.org"
              />
            </div>

            <div>
              <label htmlFor="bd-org" className="block text-sm font-medium text-slate-300 mb-1.5">
                Organization
              </label>
              <input
                id="bd-org"
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-white/10 px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Your district, school, or company"
              />
            </div>

            <div>
              <label htmlFor="bd-role" className="block text-sm font-medium text-slate-300 mb-1.5">
                I am a…
              </label>
              <select
                id="bd-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-lg bg-slate-900 border border-white/10 px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="unsure">Not sure yet</option>
                <option value="applicant">School / District / Library</option>
                <option value="consultant">E-Rate Consultant</option>
                <option value="vendor">Service Provider / Vendor</option>
              </select>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              {submitting ? "Opening calendar…" : "Continue to calendar →"}
            </button>

            <p className="text-xs text-slate-500 text-center">
              No spam. We&apos;ll only use this to prepare for your demo.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
