"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

const FALLBACK_CALENDAR =
  process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendar.app.google/edkn1FDx2mBngFGs9";

export default function FundingGuardForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [hp, setHp] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
      trackEvent("funding_guard_submit", { source: "funding-guard" });
      const res = await fetch("/api/v1/leads/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          organization: organization.trim() || undefined,
          role: "consultant",
          source: "skyrate.ai/funding-guard",
          _hp: hp,
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setSubmitted(true);
    } catch {
      // Don't trap the user — offer the calendar as a fallback path.
      setError(
        "Something went wrong submitting the form. You can also book directly:"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full font-medium text-sm mb-4">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          You&apos;re in. We&apos;ll reach out within 1 business day.
        </div>
        <p className="text-sm text-slate-400">
          Want to talk sooner?{" "}
          <a
            href={FALLBACK_CALENDAR}
            className="text-purple-300 hover:text-purple-200 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Grab a time on the calendar
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot */}
      <input
        type="text"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <div>
        <label htmlFor="fg-name" className="block text-sm font-medium text-slate-300 mb-1.5">
          Name
        </label>
        <input
          id="fg-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Your name"
          className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
        />
      </div>
      <div>
        <label htmlFor="fg-email" className="block text-sm font-medium text-slate-300 mb-1.5">
          Work email
        </label>
        <input
          id="fg-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@yourfirm.com"
          className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
        />
      </div>
      <div>
        <label htmlFor="fg-org" className="block text-sm font-medium text-slate-300 mb-1.5">
          Firm / organization <span className="text-slate-500">(optional)</span>
        </label>
        <input
          id="fg-org"
          type="text"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          placeholder="Your consulting firm"
          className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl font-semibold text-white shadow-lg shadow-purple-500/25 transition disabled:opacity-60"
      >
        {submitting ? "Submitting..." : "Get my free audit"}
      </button>
      {error && (
        <p className="text-xs text-red-400">
          {error}{" "}
          <a
            href={FALLBACK_CALENDAR}
            className="underline text-purple-300"
            target="_blank"
            rel="noopener noreferrer"
          >
            book a call
          </a>
        </p>
      )}
      <p className="text-[11px] text-slate-500 text-center">
        Capped at 10 consultant books for the FY2027 season. Audit is free; no
        card required.
      </p>
    </form>
  );
}
