"use client";

import { trackEvent } from "@/lib/analytics";

export type FAQItem = { id: string; q: string; a: string };

export default function PricingFAQ({ items }: { items: FAQItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((faq) => (
        <details
          key={faq.id}
          className="group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
          onToggle={(e) => {
            const el = e.currentTarget as HTMLDetailsElement;
            if (el.open) trackEvent("pricing_faq_open", { question_id: faq.id });
          }}
        >
          <summary className="flex items-center justify-between cursor-pointer px-5 sm:px-6 py-4 sm:py-5 text-left font-semibold text-slate-900 hover:text-purple-700 transition text-sm sm:text-base list-none">
            <span>{faq.q}</span>
            <svg
              className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform flex-shrink-0 ml-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-5 sm:px-6 pb-4 sm:pb-5 text-sm sm:text-base text-slate-600 leading-relaxed">
            {faq.a}
          </div>
        </details>
      ))}
    </div>
  );
}
