"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const SELL_OPTIONS = [
  "Internet / Broadband",
  "Wi-Fi / Network Equipment",
  "Cabling / Low-voltage",
  "Phones / VoIP",
  "Managed IT",
  "Other",
];

const K12_OPTIONS = ["Yes, currently", "Not yet, but want to", "No"];

const SPIN_OPTIONS = ["No", "Not sure", "Yes"];

export default function VendorEligibilityForm() {
  const [sells, setSells] = useState("");
  const [k12, setK12] = useState("");
  const [spin, setSpin] = useState("");
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hp, setHp] = useState(""); // honeypot — must stay empty for humans

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!name.trim() || !email.trim() || !company.trim()) {
      setErr("Please enter your name, email, and company name.");
      return;
    }

    const notes = [
      "Eligibility answers:",
      `- Sells to schools: ${sells || "(not specified)"}`,
      `- Currently sells to K-12: ${k12 || "(not specified)"}`,
      `- Has SPIN / USAC registered: ${spin || "(not specified)"}`,
    ].join("\n");

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/leads/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          role: "vendor",
          organization: company.trim(),
          source: "skyrate.ai/become-a-vendor",
          notes,
          _hp: hp,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data?.detail || "Could not submit your details. Please try again.");
      } else {
        const data = await res.json().catch(() => ({}));
        setDone(true);
        trackEvent("lead_submitted", {
          source: "skyrate.ai/become-a-vendor",
          role: "vendor",
          lead_id: data?.lead_id,
        });
      }
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-8 sm:p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" aria-hidden />
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-2">You look like a great fit.</h3>
        <p className="text-slate-600 leading-relaxed max-w-md mx-auto mb-6">
          We&apos;ll reach out within 1 business day to confirm your eligibility and walk you
          through getting registered. Want to talk sooner?
        </p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-3 rounded-lg font-semibold shadow-sm transition"
        >
          Book a free call <ArrowRight className="w-4 h-4" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5"
    >
      {/* Honeypot — visually hidden, must remain empty */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="bv-company-url">Company URL</label>
        <input
          id="bv-company-url"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="bv-sells" className="block text-sm font-medium text-slate-700 mb-1.5">
          What does your company sell to schools?
        </label>
        <select
          id="bv-sells"
          value={sells}
          onChange={(e) => setSells(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Select one…</option>
          {SELL_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="bv-k12" className="block text-sm font-medium text-slate-700 mb-1.5">
          Do you already sell to K-12 schools or districts?
        </label>
        <select
          id="bv-k12"
          value={k12}
          onChange={(e) => setK12(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Select one…</option>
          {K12_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="bv-spin" className="block text-sm font-medium text-slate-700 mb-1.5">
          Do you have a SPIN / are you registered with USAC?
        </label>
        <select
          id="bv-spin"
          value={spin}
          onChange={(e) => setSpin(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Select one…</option>
          {SPIN_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="bv-company" className="block text-sm font-medium text-slate-700 mb-1.5">
          Company name
        </label>
        <input
          id="bv-company"
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Acme Networks LLC"
          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="bv-name" className="block text-sm font-medium text-slate-700 mb-1.5">
            Your name
          </label>
          <input
            id="bv-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label htmlFor="bv-email" className="block text-sm font-medium text-slate-700 mb-1.5">
            Email
          </label>
          <input
            id="bv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="bv-phone" className="block text-sm font-medium text-slate-700 mb-1.5">
          Phone <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <input
          id="bv-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {err && (
        <p className="text-red-600 text-sm" role="alert">
          {err}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-3.5 rounded-lg font-semibold shadow-sm transition disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Checking…
          </>
        ) : (
          <>
            Check my eligibility <ArrowRight className="w-4 h-4" aria-hidden />
          </>
        )}
      </button>
      <p className="text-xs text-slate-500 text-center">
        No USAC experience required on your end. We&apos;ll confirm your fit within 1 business day.
      </p>
    </form>
  );
}
