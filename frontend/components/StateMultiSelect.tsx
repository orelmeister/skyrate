"use client";

import { useEffect, useRef, useState } from "react";

export interface StateOption {
  code: string;
  name?: string;
}

interface StateMultiSelectProps {
  options: StateOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Tailwind classes for the trigger button, so each tab keeps its own accent. */
  buttonClassName?: string;
  /** Tailwind accent classes applied to the checkboxes and the "Select all" link. */
  accentClassName?: string;
  checkboxClassName?: string;
  testIdPrefix?: string;
}

/** Render the trigger label: "All States" / "NY" / "NY, NJ, CT" / "4 states". */
function summarize(selected: string[]): string {
  if (selected.length === 0) return "All States";
  if (selected.length <= 3) return selected.join(", ");
  return `${selected.length} states`;
}

/**
 * Dropdown of US states with checkboxes, Select all / Clear, mirroring the
 * Form 470 digest builder's multi-state grid. Vendors sell across several
 * states and asked to search more than one at a time (Ari 2026-10-21).
 */
export default function StateMultiSelect({
  options,
  value,
  onChange,
  buttonClassName = "w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-left focus:ring-2 focus:ring-orange-500 focus:border-orange-500",
  accentClassName = "text-orange-600 hover:underline",
  checkboxClassName = "h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500",
  testIdPrefix = "state-ms",
}: StateMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const toggle = (code: string) => {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`${testIdPrefix}-toggle`}
        className={buttonClassName}
      >
        <span className={value.length ? "text-slate-900" : "text-slate-500"}>{summarize(value)}</span>
        <span className="float-right text-slate-400">{open ? "\u25B2" : "\u25BC"}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-72 max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-700">
              {value.length ? `${value.length} selected` : "All states"}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onChange(options.map((o) => o.code))}
                data-testid={`${testIdPrefix}-all`}
                className={`text-xs ${accentClassName}`}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                data-testid={`${testIdPrefix}-clear`}
                className="text-xs text-slate-500 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto grid grid-cols-4 sm:grid-cols-5 gap-1">
            {options.map((opt) => (
              <label
                key={opt.code}
                title={opt.name || opt.code}
                className="flex items-center gap-1 text-xs text-slate-700 px-1 py-0.5 rounded hover:bg-slate-100 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={value.includes(opt.code)}
                  onChange={() => toggle(opt.code)}
                  data-testid={`${testIdPrefix}-${opt.code}`}
                  className={checkboxClassName}
                />
                {opt.code}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
