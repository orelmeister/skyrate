"use client";

import { useState } from "react";

interface EmailCaptureFormProps {
  source?: string;
  id?: string;
}

export default function EmailCaptureForm({ source = "inline_subscribe", id }: EmailCaptureFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();

    const endpoint = process.env.NEXT_PUBLIC_FORM_ENDPOINT;
    if (!endpoint) {
      setError("Form endpoint not configured.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <section id={id} className="py-10 sm:py-14 px-4 sm:px-6 bg-gradient-to-r from-indigo-50 to-purple-50 scroll-mt-16">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-100 text-emerald-700 rounded-full font-medium text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            You&apos;re in! Check your inbox.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id={id} className="py-10 sm:py-14 px-4 sm:px-6 bg-gradient-to-r from-indigo-50 to-purple-50 scroll-mt-16">
      <div className="max-w-3xl mx-auto text-center">
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
          Get E-Rate insights delivered to your inbox
        </h3>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4"
        >
          <input
            type="email"
            name="email"
            required
            placeholder="Enter your email address"
            aria-label="Email address"
            className="w-full sm:w-80 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-white"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/25 text-sm disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {loading ? "Subscribing..." : "Subscribe"}
            {!loading && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            )}
          </button>
        </form>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <p className="text-xs text-slate-500 mt-3">
          Join 500+ E-Rate professionals. No spam, ever. Unsubscribe anytime.
        </p>
      </div>
    </section>
  );
}
