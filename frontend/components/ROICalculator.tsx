"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

// Phase 2: Pure client-side ROI calculator for skyrate.ai homepage.
// Defensible math:
// - Recovered funding = denial_rate_reduction (15%) * historical_denial_rate (10%) * funding_per_ben * bens
//   ≈ 1.5% of total managed funding recovered annually.
// - Time saved = 60% of weekly hours spent on E-Rate paperwork.
// Numbers are conservative; intentionally not "guaranteed" copy.

const ASSUMPTIONS = {
  // Industry-rough average historical denial rate for E-Rate.
  baselineDenialRate: 0.10,
  // What share of denials SkyRate's alerts + appeal generator helps recover.
  denialReduction: 0.15,
  // What share of weekly E-Rate paperwork SkyRate's automation saves.
  timeSaved: 0.60,
  // Default values when sliders are at 0.
  defaultBens: 25,
  defaultFunding: 30000,
  defaultHours: 12,
};

type Inputs = { bens: number; funding: number; hours: number };

function calc(inputs: Inputs) {
  const totalManaged = inputs.bens * inputs.funding;
  const recovered = totalManaged * ASSUMPTIONS.baselineDenialRate * ASSUMPTIONS.denialReduction;
  const hoursSavedPerWeek = inputs.hours * ASSUMPTIONS.timeSaved;
  const hoursSavedPerYear = hoursSavedPerWeek * 52;
  return { totalManaged, recovered, hoursSavedPerWeek, hoursSavedPerYear };
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function ROICalculator() {
  const [bens, setBens] = useState(ASSUMPTIONS.defaultBens);
  const [funding, setFunding] = useState(ASSUMPTIONS.defaultFunding);
  const [hours, setHours] = useState(ASSUMPTIONS.defaultHours);

  const out = useMemo(() => calc({ bens, funding, hours }), [bens, funding, hours]);

  return (
    <section
      id="roi-calculator"
      data-testid="roi-calculator"
      className="py-14 sm:py-20 px-4 sm:px-6 bg-gradient-to-b from-slate-950 to-slate-900 text-white"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/15 text-purple-300 rounded-full text-sm font-medium mb-4 border border-purple-500/30">
            ROI Calculator
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">See What SkyRate Would Recover For You</h2>
          <p className="text-slate-400">
            Tell us about your portfolio and we&apos;ll show what SkyRate typically returns —
            in dollars and hours — based on industry-average denial rates and our automation impact.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Inputs */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6">
            <SliderRow
              label="BENs / FRNs you manage"
              value={bens}
              min={1}
              max={500}
              step={1}
              onChange={setBens}
              suffix=""
            />
            <SliderRow
              label="Average funding per BEN per year"
              value={funding}
              min={5000}
              max={250000}
              step={1000}
              onChange={setFunding}
              suffix=""
              format={(v) => fmtMoney(v)}
            />
            <SliderRow
              label="Hours per week on E-Rate paperwork"
              value={hours}
              min={1}
              max={40}
              step={1}
              onChange={setHours}
              suffix=" hrs"
            />
            <div className="pt-2 border-t border-white/10 text-xs text-slate-500 leading-relaxed">
              Assumptions: baseline denial rate {(ASSUMPTIONS.baselineDenialRate * 100).toFixed(0)}%,
              SkyRate reduces denials by {(ASSUMPTIONS.denialReduction * 100).toFixed(0)}%,
              automation saves {(ASSUMPTIONS.timeSaved * 100).toFixed(0)}% of paperwork time.
            </div>
          </div>

          {/* Output */}
          <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/60 border border-purple-500/30 rounded-2xl p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <Stat
                label="Total funding managed / yr"
                value={fmtMoney(out.totalManaged)}
                hint="Inputs × BENs"
              />
              <Stat
                label="Estimated recovery / yr"
                value={fmtMoney(out.recovered)}
                accent="text-emerald-300"
                hint="Reduced denials"
              />
              <Stat
                label="Hours saved / week"
                value={`${out.hoursSavedPerWeek.toFixed(0)}h`}
                accent="text-indigo-300"
                hint="Automation"
              />
              <Stat
                label="Hours saved / year"
                value={`${out.hoursSavedPerYear.toFixed(0)}h`}
                accent="text-indigo-300"
                hint={`≈ ${(out.hoursSavedPerYear / 8).toFixed(0)} workdays`}
              />
            </div>
            <div className="bg-white/5 rounded-xl p-4 mb-5 text-sm text-slate-300 leading-relaxed">
              For a portfolio your size, SkyRate consultants typically recover{" "}
              <span className="text-emerald-300 font-semibold">{fmtMoney(out.recovered)}</span>{" "}
              in funding that would otherwise be denied, and reclaim{" "}
              <span className="text-indigo-300 font-semibold">{out.hoursSavedPerYear.toFixed(0)} hours</span>{" "}
              of paperwork per year through automation.
            </div>
            <Link
              href="/sign-up?role=consultant&source=roi-calculator"
              onClick={() =>
                trackEvent("roi_calculator_complete", {
                  bens,
                  funding,
                  hours,
                  recovered: Math.round(out.recovered),
                  hours_saved_per_year: Math.round(out.hoursSavedPerYear),
                })
              }
              className="block w-full text-center px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/30"
            >
              See how SkyRate gets you there →
            </Link>
            <p className="text-center text-xs text-slate-500 mt-2">14-day free trial · No credit card</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm font-medium text-slate-300">{label}</label>
        <span className="text-2xl font-bold text-white">
          {format ? format(value) : value.toLocaleString()}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-purple-500 cursor-pointer"
        aria-label={label}
      />
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{format ? format(min) : min.toLocaleString()}</span>
        <span>{format ? format(max) : max.toLocaleString()}</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="bg-white/5 rounded-xl p-4">
      <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold ${accent || "text-white"}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
