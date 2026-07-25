"use client";

import { useMemo, useState } from "react";
import { Sparkles, Search, Target, Bell, Layers, Calendar } from "lucide-react";

type Owner = "client" | "us" | null;
type Client = {
  name: string; ben: string; st: string; phase: number; pt: string; rd: number;
  owner: Owner; blk: string | null; due: string; dueRisk: number; amt: number;
  tasks: [string, "client" | "us", "done" | "waiting" | "doing" | "todo"][];
};

const CLIENTS: Client[] = [
  { name: "Cascade Charter Network", ben: "17042199", st: "OR", phase: 3, pt: "Form 470 Prep", rd: 35, owner: "client", blk: "Unsigned Letter of Agency", due: "Today", dueRisk: 2, amt: 480000, tasks: [["Draft 470 & RFP", "us", "done"], ["Sign LOA", "client", "waiting"], ["Services survey", "client", "todo"]] },
  { name: "Riverbend Public Library", ben: "15003245", st: "IL", phase: 8, pt: "PIA Review", rd: 78, owner: "client", blk: "PIA docs due in 3 days", due: "3d", dueRisk: 2, amt: 31200, tasks: [["Submit 471", "us", "done"], ["Provide PIA docs", "client", "waiting"], ["Monitor status", "us", "todo"]] },
  { name: "Eastside Unified SD", ben: "16056315", st: "CA", phase: 3, pt: "Form 470 Prep", rd: 68, owner: "client", blk: "Services survey incomplete", due: "2d", dueRisk: 1, amt: 1215000, tasks: [["Draft 470 & RFP", "us", "doing"], ["Approve RFP scope", "client", "todo"], ["Services survey", "client", "waiting"]] },
  { name: "Northgate Community SA", ben: "18092011", st: "MI", phase: 5, pt: "Vendor Selection", rd: 52, owner: "us", blk: "Bid scoring in progress", due: "6d", dueRisk: 0, amt: 210000, tasks: [["Log bids", "us", "done"], ["Score bids", "us", "doing"], ["Select vendor", "client", "todo"]] },
  { name: "Coastal Tribal Ed Consortium", ben: "19011774", st: "WA", phase: 4, pt: "Competitive Bidding", rd: 44, owner: "client", blk: "No answer to vendor Qs", due: "5d", dueRisk: 1, amt: 88000, tasks: [["Open bid window", "us", "done"], ["Answer vendor questions", "client", "waiting"], ["Log bids", "us", "todo"]] },
  { name: "Maple School District", ben: "13007701", st: "WI", phase: 6, pt: "Form 471 Prep", rd: 88, owner: "us", blk: "Preparing Form 471", due: "12d", dueRisk: 0, amt: 640000, tasks: [["Execute contract", "client", "done"], ["Verify FRNs", "us", "done"], ["Prepare 471", "us", "doing"]] },
  { name: "Pella Community School", ben: "13193201", st: "IA", phase: 7, pt: "Form 471 Filing", rd: 100, owner: null, blk: null, due: "Filed", dueRisk: -1, amt: 305000, tasks: [["Submit 471", "us", "done"], ["Certify", "client", "done"], ["Review FRNs", "us", "done"]] },
  { name: "Tupelo School District", ben: "13000000", st: "MS", phase: 9, pt: "Funding Commitments", rd: 100, owner: null, blk: null, due: "Funded", dueRisk: -1, amt: 558000, tasks: [["Review FCDL", "us", "done"], ["Confirm CIPA", "client", "done"], ["Plan delivery", "us", "done"]] },
];

function riskScore(c: Client) {
  if (c.owner === null) return -1;
  return c.dueRisk * 3 + (c.owner === "client" ? 2 : 0) + c.amt / 1000000;
}
function barColor(rd: number) {
  return rd >= 100 ? "from-emerald-500 to-lime-500" : rd >= 70 ? "from-purple-600 to-pink-500" : rd >= 45 ? "from-amber-500 to-yellow-400" : "from-rose-500 to-amber-500";
}

export default function ConsultantBoard() {
  const [filter, setFilter] = useState<"risk" | "client" | "ready" | "all">("risk");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [nudged, setNudged] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  const kpi = useMemo(() => ({
    total: CLIENTS.length,
    ready: CLIENTS.filter((c) => c.owner === null).length,
    onClient: CLIENTS.filter((c) => c.owner === "client").length,
    urgent: CLIENTS.filter((c) => c.dueRisk >= 2 && c.owner !== null).length,
  }), []);

  const list = useMemo(() => {
    const ql = q.toLowerCase();
    return CLIENTS.filter((c) => {
      if (ql && !c.name.toLowerCase().includes(ql) && !c.ben.includes(ql)) return false;
      if (filter === "all") return true;
      if (filter === "ready") return c.owner === null;
      if (filter === "client") return c.owner === "client";
      return c.owner !== null;
    }).sort((a, b) => riskScore(b) - riskScore(a));
  }, [filter, q]);

  function nudge(e: React.MouseEvent, name: string) {
    e.stopPropagation();
    setNudged((n) => ({ ...n, [name]: true }));
    setToast(`Reminder sent to ${name} — they’ll see it on their board`);
    setTimeout(() => setToast(null), 2600);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-[1240px] mx-auto px-5 sm:px-6 py-6 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center text-white shadow-lg"><Sparkles className="w-5 h-5" /></div>
          <div>
            <div className="font-bold text-lg leading-none">SkyRate<span className="text-purple-400">.AI</span></div>
            <div className="text-[11px] text-slate-400">Consultant · Filing Board</div>
          </div>
          <div className="flex-1" />
          <span className="inline-flex items-center gap-2 text-xs text-slate-300 border border-slate-700 rounded-lg px-3 py-2"><Calendar className="w-4 h-4" /> FY2026</span>
        </div>

        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-purple-300">
          <span className="w-2 h-2 rounded-full bg-pink-400 shadow-[0_0_14px] shadow-pink-400" /> SkyRate AI · Consultant view
        </div>
        <h1 className="text-3xl font-bold tracking-tight mt-3 mb-1.5">
          Every client’s filing, <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">at a glance</span>
        </h1>
        <p className="text-slate-300 max-w-2xl text-[15px]">
          The same journey your applicants follow — from the consultant’s chair. See which districts are ready to file,
          which are stuck, who owns the hold-up, and nudge a client back on track in one click. Sorted so the filings most at risk float to the top.
        </p>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6">
          {[
            ["Active clients", kpi.total, "text-slate-100"],
            ["Ready / filed", `${kpi.ready} / ${kpi.total}`, "text-emerald-400"],
            ["Waiting on a client", kpi.onClient, "text-amber-400"],
            ["Need action today", kpi.urgent, "text-rose-400"],
          ].map(([l, v, c]) => (
            <div key={l as string} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="text-xs text-slate-400">{l}</div>
              <div className={`text-[28px] font-extrabold mt-1.5 ${c}`}>{v}</div>
            </div>
          ))}
        </div>

        {/* controls */}
        <div className="flex items-center gap-2.5 mt-7 mb-3 flex-wrap">
          <h3 className="text-[17px] font-semibold mr-1.5">Clients</h3>
          <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-0.5">
            {([["risk", "At risk"], ["client", "Waiting on client"], ["ready", "Ready to file"], ["all", "All"]] as const).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} className={`text-[12.5px] rounded-lg px-3 py-1.5 ${filter === f ? "bg-gradient-to-br from-purple-600 to-pink-500 text-white font-bold" : "text-slate-300"}`}>{label}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 min-w-[210px]">
            <Search className="w-4 h-4 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search districts…" className="bg-transparent outline-none text-[13px] w-full" />
          </div>
        </div>

        {/* board */}
        <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40">
          <div className="hidden md:grid grid-cols-[2.4fr_1.5fr_1.3fr_1.5fr_0.9fr_96px] gap-3.5 items-center px-4 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-bold border-b border-slate-800 bg-slate-900/60">
            <div>District</div><div>Phase</div><div>Readiness</div><div>What’s blocking</div><div>Next due</div><div />
          </div>
          {list.length === 0 && <div className="p-10 text-center text-slate-500">No clients match.</div>}
          {list.map((c) => {
            const ownCls = c.owner === "client" ? "bg-amber-950 text-amber-400 border-amber-900" : c.owner === "us" ? "bg-purple-950/60 text-purple-300 border-purple-900" : "bg-emerald-950 text-emerald-300 border-emerald-900";
            const ownTxt = c.owner === "client" ? "Client" : c.owner === "us" ? "Us" : "Done";
            const dueCls = c.dueRisk >= 2 ? "text-rose-400 font-semibold" : c.dueRisk >= 1 ? "text-amber-400" : "text-slate-400";
            return (
              <div key={c.ben} className="border-b border-slate-800 last:border-0">
                <div onClick={() => setOpen(open === c.ben ? null : c.ben)} role="button" tabIndex={0} className="w-full text-left grid grid-cols-2 md:grid-cols-[2.4fr_1.5fr_1.3fr_1.5fr_0.9fr_96px] gap-3.5 items-center px-4 py-3 hover:bg-slate-800/40 transition cursor-pointer">
                  <div><b className="text-sm block">{c.name}</b><span className="text-[11.5px] text-slate-400">BEN {c.ben} · {c.st} · ${(c.amt / 1000).toFixed(0)}K at stake</span></div>
                  <div className="hidden md:block text-[12.5px] text-slate-200">Phase {c.phase}<span className="block text-[11px] text-slate-400">{c.pt}</span></div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-[7px] bg-slate-800 rounded overflow-hidden"><i className={`block h-full rounded bg-gradient-to-r ${barColor(c.rd)}`} style={{ width: `${c.rd}%` }} /></div>
                    <b className="text-[12.5px] w-8 text-right tabular-nums">{c.rd}%</b>
                  </div>
                  <div className="hidden md:flex text-[12.5px] text-slate-200 items-center gap-2">
                    <span className={`text-[9.5px] font-extrabold uppercase rounded px-1.5 py-0.5 border ${ownCls}`}>{ownTxt}</span> {c.blk || "Nothing — on track"}
                  </div>
                  <div className={`hidden md:block text-xs ${dueCls}`}>{c.due}</div>
                  <div onClick={(e) => e.stopPropagation()}>
                    {c.owner === "client" ? (
                      <button onClick={(e) => nudge(e, c.name)} className={`w-full text-[11.5px] font-bold rounded-lg px-2.5 py-2 ${nudged[c.name] ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-gradient-to-br from-purple-600 to-pink-500 text-white"}`}>{nudged[c.name] ? "Sent" : "Nudge"}</button>
                    ) : (
                      <button className="w-full text-[11.5px] rounded-lg px-2.5 py-2 border border-slate-700 text-slate-500 cursor-default">{c.owner === null ? "—" : "Ours"}</button>
                    )}
                  </div>
                </div>
                {open === c.ben && (
                  <div className="px-4 pb-4">
                    <div className="border-t border-dashed border-slate-700 pt-3.5">
                      <div className="text-xs text-slate-400 mb-2.5 font-semibold">Phase {c.phase} tasks · {c.pt}</div>
                      <div className="flex flex-wrap gap-2">
                        {c.tasks.map(([t, who, col]) => (
                          <span key={t} className={`flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs ${col === "done" ? "opacity-60" : ""}`}>
                            <span className="w-2 h-2 rounded-full" style={{ background: col === "done" ? "#22c55e" : col === "waiting" ? "#f59e0b" : col === "doing" ? "#a855f7" : "#64748b" }} />
                            <span className={col === "done" ? "line-through" : ""}>{t}</span>
                            <span className={`text-[9.5px] font-extrabold uppercase rounded px-1.5 py-0.5 border ${who === "client" ? "bg-amber-950 text-amber-400 border-amber-900" : "bg-purple-950/60 text-purple-300 border-purple-900"}`}>{who === "client" ? "Client" : "Us"}</span>
                          </span>
                        ))}
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
          <h3 className="text-[19px] font-semibold mb-1.5">Why consultants will love this</h3>
          <p className="text-slate-400 text-sm mb-4 max-w-2xl">It turns “chase every client by email” into a single prioritized worklist — you always know who to push and why.</p>
          <div className="grid md:grid-cols-3 gap-3.5">
            {[
              [<Target key="t" className="w-4 h-4" />, "Risk rises to the top", "Clients are ranked by dollars-at-risk and deadline proximity, so the district about to miss its 28-day bid window is the first thing you see every morning."],
              [<Bell key="b" className="w-4 h-4" />, "One-click nudges", "When a filing is stuck on the client (unsigned LOA, missing survey), send a friendly, pre-written reminder straight to their board — and see when they act on it."],
              [<Layers key="l" className="w-4 h-4" />, "Same source of truth", "This is the exact 12-phase engine your clients use. When they tick a task, your board updates instantly — no status meetings, no spreadsheets."],
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
