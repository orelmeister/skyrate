"use client";

import { useMemo, useState } from "react";
import { Sparkles, Search, Target, Bell, Radar, Calendar, TrendingUp } from "lucide-react";

type Status = "new" | "reviewing" | "submitted" | "won" | "lost";
type Opp = {
  district: string; f470: string; st: string; service: string; value: number;
  deadline: string; dueRisk: number; status: Status; match: number;
  competitors: string[]; reqs: string[];
};

const INITIAL: Opp[] = [
  { district: "Eastside Unified SD", f470: "470-2026-004821", st: "CA", service: "Internet Access · 1 Gbps", value: 1215000, deadline: "Bids due in 2d", dueRisk: 2, status: "reviewing", match: 96, competitors: ["143032945", "143018210"], reqs: ["1 Gbps dedicated fiber", "99.9% SLA", "3-year term", "Managed router"] },
  { district: "Cascade Charter Network", f470: "470-2026-004770", st: "OR", service: "Wi-Fi / Internal Connections", value: 480000, deadline: "Bids due in 5d", dueRisk: 1, status: "new", match: 91, competitors: ["143015277"], reqs: ["Campus-wide Wi-Fi 6", "Cat-2 eligible switching", "Install + support"] },
  { district: "Riverbend Public Library", f470: "470-2026-004698", st: "IL", service: "Internet Access · 500 Mbps", value: 128000, deadline: "Bids due in 9d", dueRisk: 0, status: "new", match: 84, competitors: [], reqs: ["500 Mbps fiber", "Static IPs", "Business-hours support"] },
  { district: "Northgate Community SA", f470: "470-2026-004512", st: "MI", service: "Managed Internal Broadband", value: 210000, deadline: "Submitted", dueRisk: 0, status: "submitted", match: 88, competitors: ["143020881", "143032945"], reqs: ["MIBS 3-year", "On-site technician", "Monitoring"] },
  { district: "Coastal Tribal Ed Consortium", f470: "470-2026-004333", st: "WA", service: "Internet Access · Fiber", value: 88000, deadline: "Bids due in 4d", dueRisk: 1, status: "reviewing", match: 79, competitors: ["143020881"], reqs: ["Rural fiber build", "Redundant path", "5-year term"] },
  { district: "Maple School District", f470: "470-2026-004120", st: "WI", service: "Wi-Fi Upgrade", value: 640000, deadline: "Awarded to you", dueRisk: -1, status: "won", match: 94, competitors: ["143015277", "143018210"], reqs: ["District-wide refresh", "Cat-2 budget", "Warranty 5yr"] },
  { district: "Pella Community School", f470: "470-2026-003980", st: "IA", service: "Internet Access", value: 305000, deadline: "Awarded to competitor", dueRisk: -1, status: "lost", match: 72, competitors: ["143032945"], reqs: ["1 Gbps", "3-year"] },
];

function riskScore(o: Opp) {
  if (o.status === "won" || o.status === "lost" || o.status === "submitted") return -1;
  return o.dueRisk * 3 + o.match / 40 + o.value / 1000000;
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  new: { label: "New lead", cls: "bg-sky-950 text-sky-300 border-sky-900" },
  reviewing: { label: "Reviewing", cls: "bg-purple-950/60 text-purple-300 border-purple-900" },
  submitted: { label: "Bid submitted", cls: "bg-amber-950 text-amber-400 border-amber-900" },
  won: { label: "Won", cls: "bg-emerald-950 text-emerald-300 border-emerald-900" },
  lost: { label: "Lost", cls: "bg-slate-800 text-slate-400 border-slate-700" },
};

export default function VendorBoard() {
  const [opps, setOpps] = useState<Opp[]>(() => JSON.parse(JSON.stringify(INITIAL)));
  const [filter, setFilter] = useState<"open" | "new" | "submitted" | "won" | "all">("open");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const kpi = useMemo(() => {
    const openCount = opps.filter((o) => o.status === "new" || o.status === "reviewing").length;
    const submitted = opps.filter((o) => o.status === "submitted").length;
    const won = opps.filter((o) => o.status === "won").length;
    const decided = opps.filter((o) => o.status === "won" || o.status === "lost").length;
    const winRate = decided ? Math.round((won / decided) * 100) : 0;
    const revenue = opps.filter((o) => o.status === "won").reduce((s, o) => s + o.value, 0);
    return { openCount, submitted, winRate, revenue };
  }, [opps]);

  const list = useMemo(() => {
    const ql = q.toLowerCase();
    return opps.filter((o) => {
      if (ql && !o.district.toLowerCase().includes(ql) && !o.f470.includes(ql)) return false;
      if (filter === "all") return true;
      if (filter === "new") return o.status === "new";
      if (filter === "submitted") return o.status === "submitted";
      if (filter === "won") return o.status === "won";
      return o.status === "new" || o.status === "reviewing";
    }).sort((a, b) => riskScore(b) - riskScore(a));
  }, [opps, filter, q]);

  function submitBid(e: React.MouseEvent, f470: string, district: string) {
    e.stopPropagation();
    setOpps((prev) => prev.map((o) => (o.f470 === f470 ? { ...o, status: "submitted", deadline: "Submitted" } : o)));
    setToast(`Bid submitted for ${district} — we’ll track the award decision`);
    setTimeout(() => setToast(null), 2600);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-[1240px] mx-auto px-5 sm:px-6 py-6 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center text-white shadow-lg"><Sparkles className="w-5 h-5" /></div>
          <div>
            <div className="font-bold text-lg leading-none">SkyRate<span className="text-purple-400">.AI</span></div>
            <div className="text-[11px] text-slate-400">Vendor · Opportunity Board</div>
          </div>
          <div className="flex-1" />
          <span className="inline-flex items-center gap-2 text-xs text-slate-300 border border-slate-700 rounded-lg px-3 py-2"><Calendar className="w-4 h-4" /> FY2026</span>
        </div>

        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-purple-300">
          <span className="w-2 h-2 rounded-full bg-pink-400 shadow-[0_0_14px] shadow-pink-400" /> SkyRate AI · Vendor view
        </div>
        <h1 className="text-3xl font-bold tracking-tight mt-3 mb-1.5">
          Every Form 470 worth bidding, <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">ranked for you</span>
        </h1>
        <p className="text-slate-300 max-w-2xl text-[15px]">
          Vendors don’t file — they win. This board turns live Form 470 postings into a bid pipeline: matched to your SPIN,
          ranked by value and deadline, with the competitors already bidding — so you never miss a winnable opportunity.
        </p>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6">
          {[
            ["Open opportunities", kpi.openCount, "text-slate-100"],
            ["Bids in flight", kpi.submitted, "text-amber-400"],
            ["Win rate", `${kpi.winRate}%`, "text-emerald-400"],
            ["Revenue won (FY26)", `$${(kpi.revenue / 1000).toFixed(0)}K`, "text-purple-300"],
          ].map(([l, v, c]) => (
            <div key={l as string} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="text-xs text-slate-400">{l}</div>
              <div className={`text-[28px] font-extrabold mt-1.5 ${c}`}>{v}</div>
            </div>
          ))}
        </div>

        {/* controls */}
        <div className="flex items-center gap-2.5 mt-7 mb-3 flex-wrap">
          <h3 className="text-[17px] font-semibold mr-1.5">Opportunities</h3>
          <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-0.5">
            {([["open", "Open"], ["new", "New leads"], ["submitted", "Submitted"], ["won", "Won"], ["all", "All"]] as const).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} className={`text-[12.5px] rounded-lg px-3 py-1.5 ${filter === f ? "bg-gradient-to-br from-purple-600 to-pink-500 text-white font-bold" : "text-slate-300"}`}>{label}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 min-w-[210px]">
            <Search className="w-4 h-4 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search districts or 470 #…" className="bg-transparent outline-none text-[13px] w-full" />
          </div>
        </div>

        {/* board */}
        <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40">
          <div className="hidden md:grid grid-cols-[2.3fr_1.6fr_1fr_1.2fr_1fr_104px] gap-3.5 items-center px-4 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-bold border-b border-slate-800 bg-slate-900/60">
            <div>District / Form 470</div><div>Service</div><div>Match</div><div>Status</div><div>Deadline</div><div />
          </div>
          {list.length === 0 && <div className="p-10 text-center text-slate-500">No opportunities match.</div>}
          {list.map((o) => {
            const sm = STATUS_META[o.status];
            const dueCls = o.dueRisk >= 2 ? "text-rose-400 font-semibold" : o.dueRisk >= 1 ? "text-amber-400" : "text-slate-400";
            const canBid = o.status === "new" || o.status === "reviewing";
            return (
              <div key={o.f470} className="border-b border-slate-800 last:border-0">
                <div onClick={() => setOpen(open === o.f470 ? null : o.f470)} role="button" tabIndex={0} className="w-full text-left grid grid-cols-2 md:grid-cols-[2.3fr_1.6fr_1fr_1.2fr_1fr_104px] gap-3.5 items-center px-4 py-3 hover:bg-slate-800/40 transition cursor-pointer">
                  <div><b className="text-sm block">{o.district}</b><span className="text-[11.5px] text-slate-400">{o.f470} · {o.st} · ${(o.value / 1000).toFixed(0)}K</span></div>
                  <div className="hidden md:block text-[12.5px] text-slate-200">{o.service}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[7px] bg-slate-800 rounded overflow-hidden md:max-w-[70px]"><i className={`block h-full rounded bg-gradient-to-r ${o.match >= 90 ? "from-emerald-500 to-teal-400" : o.match >= 80 ? "from-purple-600 to-pink-500" : "from-amber-500 to-yellow-400"}`} style={{ width: `${o.match}%` }} /></div>
                    <b className="text-[12.5px] w-9 text-right tabular-nums">{o.match}%</b>
                  </div>
                  <div className="hidden md:block"><span className={`text-[10px] font-extrabold uppercase rounded px-2 py-0.5 border ${sm.cls}`}>{sm.label}</span></div>
                  <div className={`hidden md:block text-xs ${dueCls}`}>{o.deadline}</div>
                  <div onClick={(e) => e.stopPropagation()}>
                    {canBid ? (
                      <button onClick={(e) => submitBid(e, o.f470, o.district)} className="w-full text-[11.5px] font-bold rounded-lg px-2 py-2 bg-gradient-to-br from-purple-600 to-pink-500 text-white">Submit bid</button>
                    ) : (
                      <button className="w-full text-[11.5px] rounded-lg px-2 py-2 border border-slate-700 text-slate-500 cursor-default">{o.status === "submitted" ? "Awaiting" : o.status === "won" ? "Won" : "Closed"}</button>
                    )}
                  </div>
                </div>
                {open === o.f470 && (
                  <div className="px-4 pb-4">
                    <div className="border-t border-dashed border-slate-700 pt-3.5 grid md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-slate-400 mb-2 font-semibold">Requirements</div>
                        <div className="flex flex-wrap gap-2">
                          {o.reqs.map((r) => <span key={r} className="text-[11.5px] bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5">{r}</span>)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-2 font-semibold flex items-center gap-1.5"><Radar className="w-3.5 h-3.5" /> Competitors bidding (SPIN)</div>
                        {o.competitors.length ? (
                          <div className="flex flex-wrap gap-2">
                            {o.competitors.map((s) => <span key={s} className="text-[11.5px] bg-purple-950/40 border border-purple-900 text-purple-200 rounded-lg px-2.5 py-1.5 font-mono">{s}</span>)}
                          </div>
                        ) : <div className="text-[12px] text-emerald-300">No competing bids logged yet — strong opening.</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* rationale */}
        <div className="mt-11">
          <h3 className="text-[19px] font-semibold mb-1.5">Why vendors will love this</h3>
          <p className="text-slate-400 text-sm mb-4 max-w-2xl">It turns the public Form 470 firehose into a ranked, winnable pipeline — you bid on the right ones, on time.</p>
          <div className="grid md:grid-cols-3 gap-3.5">
            {[
              [<Target key="t" className="w-4 h-4" />, "Matched to your SPIN", "Every live Form 470 is scored against your services and service area, so the best-fit opportunities surface first — no scrolling the USAC portal."],
              [<Radar key="r" className="w-4 h-4" />, "See who else is bidding", "Competitor SPIN intelligence shows which providers have already responded, so you can price and position to win."],
              [<TrendingUp key="u" className="w-4 h-4" />, "Never miss a deadline", "Bid windows are ranked by close date and value, with reminders — turning missed 470s into a measurable win rate."],
            ].map(([icon, h, p]) => (
              <div key={h as string} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="w-9 h-9 rounded-xl bg-purple-950/60 text-purple-300 flex items-center justify-center mb-2.5">{icon}</div>
                <h5 className="font-semibold mb-1.5">{h}</h5>
                <p className="text-[13px] text-slate-300">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-7 z-[90] bg-purple-950 border border-purple-800 text-purple-100 px-4 py-3 rounded-xl text-[13.5px] font-semibold shadow-2xl">{toast}</div>
      )}
    </div>
  );
}
