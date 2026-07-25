"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PenLine, ClipboardList, Upload, Calendar, Clock, AlertTriangle, Check,
  Target, Sparkles, LayoutGrid, X, Flame, ArrowRight, FileText, Bell,
} from "lucide-react";
import { api, type CompliancePlanResponse, type TrackerTask } from "@/lib/api";

/* ----------------------------- data ----------------------------- */
type Owner = "you" | "team";
type Col = "todo" | "doing" | "waiting" | "done";
type Task = { id: string; t: string; own: Owner; col: Col; due: string; doc?: boolean; blk?: string; realId?: number; required?: boolean };
type Phase = { n: number; mo: string; title: string; state: "done" | "current" | "future" };

const PHASES: Phase[] = [
  { n: 1, mo: "July", title: "Strategic Planning Begins", state: "done" },
  { n: 2, mo: "August", title: "Requirements & Data Collection", state: "done" },
  { n: 3, mo: "September", title: "Form 470 Preparation & Early Posting", state: "current" },
  { n: 4, mo: "October", title: "Competitive Bidding", state: "future" },
  { n: 5, mo: "November", title: "Vendor Evaluation & Selection", state: "future" },
  { n: 6, mo: "December", title: "Contract Execution & Form 471 Prep", state: "future" },
  { n: 7, mo: "Jan – Feb", title: "Form 471 Filing", state: "future" },
  { n: 8, mo: "Mar – Apr", title: "PIA Review", state: "future" },
  { n: 9, mo: "May – Jun", title: "Funding Commitments", state: "future" },
  { n: 10, mo: "July", title: "Service Delivery", state: "future" },
  { n: 11, mo: "Ongoing", title: "Invoicing & Reimbursement", state: "future" },
  { n: 12, mo: "Post-year", title: "Closeout & Record Retention", state: "future" },
];

const INITIAL_TASKS: Record<number, Task[]> = {
  1: [
    { id: "1a", t: "Kickoff call", own: "team", col: "done", due: "Jul 12" },
    { id: "1b", t: "Confirm entities & BENs", own: "team", col: "done", due: "Jul 20" },
    { id: "1c", t: "Set funding-year goals", own: "you", col: "done", due: "Jul 28" },
  ],
  2: [
    { id: "2a", t: "Collect enrollment & NSLP data", own: "you", col: "done", due: "Aug 10", doc: true },
    { id: "2b", t: "Map current services & contracts", own: "team", col: "done", due: "Aug 18" },
    { id: "2c", t: "Confirm discount rate", own: "team", col: "done", due: "Aug 24" },
  ],
  3: [
    { id: "3a", t: "Draft Form 470 & RFP scope", own: "team", col: "doing", due: "Sep 15", doc: true },
    { id: "3b", t: "Approve RFP scope", own: "you", col: "todo", due: "Sep 18" },
    { id: "3c", t: "Sign Letter of Agency (LOA)", own: "you", col: "waiting", due: "Today", doc: true, blk: "loa" },
    { id: "3d", t: "Complete services survey", own: "you", col: "waiting", due: "Sep 12", blk: "survey" },
    { id: "3e", t: "Upload network inventory", own: "you", col: "waiting", due: "Sep 14", doc: true, blk: "inventory" },
    { id: "3f", t: "Post Form 470 to USAC", own: "team", col: "todo", due: "Sep 22" },
  ],
  4: [
    { id: "4a", t: "Open 28-day bidding window", own: "team", col: "todo", due: "Oct 1" },
    { id: "4b", t: "Answer vendor questions", own: "you", col: "todo", due: "Oct 12" },
    { id: "4c", t: "Log all bids received", own: "team", col: "todo", due: "Oct 28", doc: true },
  ],
  5: [
    { id: "5a", t: "Score bids on the matrix", own: "team", col: "todo", due: "Nov 8", doc: true },
    { id: "5b", t: "Select winning vendor", own: "you", col: "todo", due: "Nov 15" },
    { id: "5c", t: "Document selection rationale", own: "team", col: "todo", due: "Nov 20", doc: true },
  ],
  6: [
    { id: "6a", t: "Execute vendor contract", own: "you", col: "todo", due: "Dec 5", doc: true },
    { id: "6b", t: "Verify funding requests", own: "team", col: "todo", due: "Dec 12" },
    { id: "6c", t: "Prepare FCC Form 471", own: "team", col: "todo", due: "Dec 20", doc: true },
  ],
  7: [
    { id: "7a", t: "Submit FCC Form 471", own: "team", col: "todo", due: "Feb 20", doc: true },
    { id: "7b", t: "Certify the application", own: "you", col: "todo", due: "Feb 24" },
    { id: "7c", t: "Review FRNs", own: "team", col: "todo", due: "Feb 26" },
  ],
  8: [
    { id: "8a", t: "Respond to PIA requests", own: "team", col: "todo", due: "Mar 30" },
    { id: "8b", t: "Provide supporting docs", own: "you", col: "todo", due: "Apr 5", doc: true },
    { id: "8c", t: "Monitor application status", own: "team", col: "todo", due: "Apr 20" },
  ],
  9: [
    { id: "9a", t: "Review FCDL", own: "team", col: "todo", due: "May 20", doc: true },
    { id: "9b", t: "Confirm CIPA compliance", own: "you", col: "todo", due: "May 28", doc: true },
    { id: "9c", t: "Plan service implementation", own: "team", col: "todo", due: "Jun 10" },
  ],
  10: [
    { id: "10a", t: "Begin eligible services", own: "team", col: "todo", due: "Jul 1" },
    { id: "10b", t: "Track installations", own: "team", col: "todo", due: "ongoing" },
    { id: "10c", t: "Maintain documentation", own: "you", col: "todo", due: "ongoing", doc: true },
  ],
  11: [
    { id: "11a", t: "File BEAR / SPI invoices", own: "team", col: "todo", due: "ongoing", doc: true },
    { id: "11b", t: "Track reimbursement status", own: "team", col: "todo", due: "ongoing" },
    { id: "11c", t: "Keep audit documentation", own: "you", col: "todo", due: "ongoing", doc: true },
  ],
  12: [
    { id: "12a", t: "Confirm all reimbursements", own: "team", col: "todo", due: "post-year" },
    { id: "12b", t: "Retain records (10 years)", own: "you", col: "todo", due: "post-year", doc: true },
  ],
};

type Kind = "loa" | "survey" | "upload" | "simple";
function inferKind(task: Task): Kind {
  const t = task.t.toLowerCase();
  if (/letter of agency|loa/.test(t)) return "loa";
  if (/survey/.test(t)) return "survey";
  if (/upload|inventory|document|attach/.test(t) || task.doc) return "upload";
  return "simple";
}

const SURVEY = [
  { q: "Which services do you need funded this year?", opts: ["Internet access", "Wi-Fi / internal connections", "Both"] },
  { q: "Roughly how many students does your district serve?", opts: ["Under 1,000", "1,000 – 5,000", "Over 5,000"] },
  { q: "Do you have a preferred contract length?", opts: ["1 year", "3 years", "No preference"] },
];

const READY_TOTAL = 22;
const READY_BASE = 15;

/* --------------- real compliance-tracker mapping (authed users) --------------- */
function statusToCol(s: TrackerTask["status"]): Col {
  if (s === "complete") return "done";
  if (s === "in_progress") return "doing";
  if (s === "blocked") return "waiting";
  return "todo";
}
const YOU_RE = /\b(sign|upload|provide|approve|certify|complete|answer|confirm|submit|retain|maintain|review|respond)\b/i;
function ownerFor(title: string): Owner { return YOU_RE.test(title) ? "you" : "team"; }
function fmtDue(iso: string): string {
  try { return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return iso; }
}
function planToState(plan: CompliancePlanResponse): { tasks: Record<number, Task[]>; phaseState: Record<number, Phase["state"]>; current: number } {
  const tasks: Record<number, Task[]> = {};
  for (let n = 1; n <= 12; n++) tasks[n] = [];
  const byStep: Record<number, CompliancePlanResponse["phases"][number]> = {};
  plan.phases.forEach((g) => { byStep[g.phase_step] = g; });
  for (let n = 1; n <= 12; n++) {
    const g = byStep[n];
    if (g) tasks[n] = [...g.tasks].sort((a, b) => a.sort_order - b.sort_order).map((tk) => ({
      id: String(tk.id), realId: tk.id, t: tk.title, own: ownerFor(tk.title),
      col: statusToCol(tk.status), due: tk.due_date ? fmtDue(tk.due_date) : (tk.is_overdue ? "overdue" : "\u2014"),
      doc: tk.category === "document", required: tk.required,
    }));
  }
  const phaseState: Record<number, Phase["state"]> = {};
  let current = 12; let currentSet = false;
  for (let n = 1; n <= 12; n++) {
    const g = byStep[n]; const pct = g ? g.percent : 0;
    if (pct >= 100) phaseState[n] = "done";
    else if (!currentSet) { phaseState[n] = "current"; current = n; currentSet = true; }
    else phaseState[n] = "future";
  }
  return { tasks, phaseState, current };
}

/* ----------------------------- component ----------------------------- */
export default function FilingBoard() {
  // This route lives on the skyrate.ai domain, so it is ALWAYS SkyRate-branded.
  // Never surface the "erateapp" brand here (that brand belongs to erateapp.com only).
  const brand = { name: "SkyRate", ai: ".AI", grad: "from-purple-600 to-pink-500", team: "SkyRate", r1: "#a855f7", r2: "#ec4899" };

  const [tasks, setTasks] = useState<Record<number, Task[]>>(() =>
    JSON.parse(JSON.stringify(INITIAL_TASKS)),
  );
  const [phaseState, setPhaseState] = useState<Record<number, Phase["state"]>>(() =>
    Object.fromEntries(PHASES.map((p) => [p.n, p.state])),
  );
  const [selected, setSelected] = useState(3);
  const [simple, setSimple] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);

  // drawer
  const [drawer, setDrawer] = useState<{ phase: number; taskId: string } | null>(null);
  const [signName, setSignName] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const [surveyStep, setSurveyStep] = useState(0);
  const [surveyAns, setSurveyAns] = useState<(number | null)[]>([null, null, null]);
  const [plan, setPlan] = useState<CompliancePlanResponse | null>(null);

  // countdown
  const [cd, setCd] = useState({ d: 27, h: 14, m: 5 });
  useEffect(() => {
    const target = new Date();
    target.setDate(target.getDate() + 27);
    target.setHours(target.getHours() + 14);
    const step = () => {
      let ms = target.getTime() - Date.now();
      if (ms < 0) ms = 0;
      setCd({
        d: Math.floor(ms / 86400000),
        h: Math.floor((ms % 86400000) / 3600000),
        m: Math.floor((ms % 3600000) / 60000),
      });
    };
    step();
    const id = setInterval(step, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  // When signed in, load the user's REAL compliance-tracker plan and drive the
  // board from it. Any failure (or no auth) silently keeps the demo data so the
  // page still showcases perfectly for public / prospect review.
  useEffect(() => {
    let cancelled = false;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    api.getCompliancePlan(2026).then((res) => {
      if (cancelled || !res?.data?.phases?.length) return;
      const mapped = planToState(res.data);
      setTasks(mapped.tasks);
      setPhaseState(mapped.phaseState);
      setSelected(mapped.current);
      setPlan(res.data);
    }).catch(() => { /* keep demo data */ });
    return () => { cancelled = true; };
  }, []);

  const resolvedCount = useMemo(
    () => (tasks[3] || []).filter((t) => t.blk && t.col === "done").length,
    [tasks],
  );
  const currentPhaseNum = useMemo(() => {
    for (let n = 1; n <= 12; n++) if (phaseState[n] === "current") return n;
    return 3;
  }, [phaseState]);
  const realReq = useMemo(() => {
    if (!plan) return null;
    let total = 0, done = 0;
    for (let n = 1; n <= 12; n++) for (const t of tasks[n] || []) if (t.required) { total++; if (t.col === "done") done++; }
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [plan, tasks]);
  const blockerItems = useMemo(() => {
    if (plan) {
      return (tasks[currentPhaseNum] || []).filter((t) => t.own === "you" && t.col !== "done").slice(0, 4)
        .map((t) => ({ id: t.id, phase: currentPhaseNum, title: t.t, sub: t.required ? "Required to file" : "Recommended step", cta: "Open", kind: inferKind(t), done: false }));
    }
    const find = (k: string) => (tasks[3] || []).find((x) => x.blk === k);
    return [
      { id: find("loa")?.id || "3c", phase: 3, title: "Sign your Letter of Agency", sub: "Lets us file on your behalf", cta: "Sign now", kind: "loa" as Kind, done: find("loa")?.col === "done" },
      { id: find("survey")?.id || "3d", phase: 3, title: "Complete the services survey", sub: "Tells us what to bid out", cta: "Start", kind: "survey" as Kind, done: find("survey")?.col === "done" },
      { id: find("inventory")?.id || "3e", phase: 3, title: "Upload current network inventory", sub: "Needed for the RFP scope", cta: "Upload", kind: "upload" as Kind, done: find("inventory")?.col === "done" },
    ];
  }, [plan, tasks, currentPhaseNum]);
  const readyN = realReq ? realReq.done : READY_BASE + resolvedCount;
  const readyTotal = realReq ? realReq.total : READY_TOTAL;
  const pct = realReq ? realReq.pct : Math.round((readyN / READY_TOTAL) * 100);
  const itemsLeft = blockerItems.filter((b) => !b.done).length;

  const drawerTask = drawer ? (tasks[drawer.phase] || []).find((t) => t.id === drawer.taskId) || null : null;
  const drawerKind = drawerTask ? inferKind(drawerTask) : "simple";

  function openTask(phase: number, taskId: string) {
    setSignName("");
    setUploaded(false);
    setSurveyStep(0);
    setSurveyAns([null, null, null]);
    setDrawer({ phase, taskId });
  }
  function openBlocker(key: string) {
    const t = (tasks[3] || []).find((x) => x.blk === key);
    if (t) openTask(3, t.id);
  }
  void openBlocker;
  function closeDrawer() {
    setDrawer(null);
  }

  function completeTask(phase: number, taskId: string) {
    const rt = (tasks[phase] || []).find((t) => t.id === taskId);
    if (plan && rt?.realId) { api.updateComplianceTaskStatus(rt.realId, "complete").catch(() => {}); }
    setTasks((prev) => {
      const next = { ...prev, [phase]: (prev[phase] || []).map((t) => (t.id === taskId ? { ...t, col: "done" as Col } : t)) };
      const all = (next[phase] || []).every((t) => t.col === "done");
      if (all && phaseState[phase] !== "done") {
        setPhaseState((ps) => ({ ...ps, [phase]: "done" }));
        setConfetti(true);
        setTimeout(() => setConfetti(false), 2600);
        setToast(`Phase ${phase} complete! On to the next milestone.`);
      }
      return next;
    });
  }

  function submitDrawer() {
    if (!drawer) return;
    const { phase, taskId } = drawer;
    closeDrawer();
    completeTask(phase, taskId);
    setToast("Done — that’s one less thing between you and your Form 470");
  }

  const nextStep = useMemo(() => {
    for (let p = 1; p <= 12; p++) {
      const list = tasks[p] || [];
      for (const t of list) if (t.own === "you" && t.col !== "done") return { phase: p, task: t };
    }
    return null;
  }, [tasks]);

  const phaseTasks = tasks[selected] || [];
  const counts = {
    todo: phaseTasks.filter((t) => t.col === "todo").length,
    doing: phaseTasks.filter((t) => t.col === "doing").length,
    waiting: phaseTasks.filter((t) => t.col === "waiting").length,
    done: phaseTasks.filter((t) => t.col === "done").length,
  };
  const selPhase = PHASES[selected - 1];

  const C = 477.5;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <style>{`@keyframes fbfall{to{transform:translateY(105vh) rotate(680deg);opacity:.9}}`}</style>

      <div className="max-w-[1300px] mx-auto px-5 sm:px-6 py-6 pb-24">
        {/* top bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${brand.grad} flex items-center justify-center text-slate-950 shadow-lg`}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-lg leading-none">
              {brand.name}
              <span className="text-teal-300">{brand.ai}</span>
            </div>
            <div className="text-[11px] text-slate-400">Filing Journey</div>
          </div>
          <div className="flex-1" />
          <span className="hidden sm:inline-flex items-center gap-2 text-xs text-slate-300 border border-slate-700 rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4" /> FY2026 · Eastside USD
          </span>
          <button
            onClick={() => setSimple((s) => !s)}
            className="inline-flex items-center gap-2 text-xs text-slate-200 border border-slate-700 rounded-lg px-3 py-2 hover:border-slate-500"
          >
            {simple ? <LayoutGrid className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {simple ? "Full board" : "Simple mode"}
          </button>
        </div>

        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-300">
          <span className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_14px] shadow-teal-400" />
          {brand.name}{brand.ai} · Filing board
        </div>
        <h1 className="text-3xl font-bold tracking-tight mt-3 mb-1.5">
          Everything you need to <span className={`bg-gradient-to-r ${brand.grad} bg-clip-text text-transparent`}>file your Form 470</span>
        </h1>
        <p className="text-slate-300 max-w-2xl text-[15px]">
          One clear game plan: a readiness score, a season timeline, and a work board that spells out exactly what’s
          blocking your filing and who owns it. Tap any task to do it right here.
        </p>

        {/* HERO */}
        <div className="grid lg:grid-cols-[300px_1fr_320px] gap-4 mt-6">
          {/* gauge */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col items-center text-center">
            <h3 className="text-[13px] text-slate-200 font-medium">Form 470 readiness</h3>
            <div className="text-[11.5px] text-slate-400">Everything needed to post your 470</div>
            <div className="relative w-[180px] h-[180px] my-2">
              <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
                <circle cx="90" cy="90" r="76" stroke="#1e293b" strokeWidth="15" fill="none" />
                <circle
                  cx="90" cy="90" r="76" stroke="url(#fbgrad)" strokeWidth="15" fill="none" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100}
                  style={{ transition: "stroke-dashoffset .6s" }}
                />
                <defs>
                  <linearGradient id="fbgrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={brand.r1} />
                    <stop offset="1" stopColor={brand.r2} />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <b className="text-[42px] font-extrabold leading-none">{pct}%</b>
                <span className="text-[11.5px] text-slate-400 mt-1">{readyN} / {readyTotal} ready</span>
              </div>
            </div>
            <div className={`text-xs font-bold text-slate-950 rounded-full px-3.5 py-1.5 bg-gradient-to-br ${itemsLeft <= 0 ? "from-emerald-500 to-teal-400" : brand.grad}`}>
              {itemsLeft <= 0 ? "Ready to file!" : `${itemsLeft} item${itemsLeft > 1 ? "s need" : " needs"} you`}
            </div>
          </div>

          {/* goal + countdown */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-center">
            <div className="text-[12px] uppercase tracking-[0.1em] text-teal-300 font-bold">Current goal</div>
            <h2 className="text-2xl font-semibold mt-1.5 mb-1">Post Form 470 &amp; open competitive bidding</h2>
            <p className="text-slate-300 text-sm">
              You’re in <b>Phase 3 — Form 470 Preparation &amp; Early Posting</b>. Post early to protect a full 28-day
              bidding window before the Form 471 deadline.
            </p>
            <div className="flex gap-2.5 mt-4">
              {[["d", cd.d], ["h", cd.h], ["m", cd.m]].map(([k, v], i) => (
                <div key={k as string} className="flex items-center gap-2.5">
                  <div className="bg-slate-950/70 border border-slate-700 rounded-xl px-3.5 py-2.5 text-center min-w-[68px]">
                    <b className="text-2xl font-extrabold tabular-nums block">{i === 0 ? v : String(v).padStart(2, "0")}</b>
                    <span className="text-[10.5px] uppercase text-slate-400">{k === "d" ? "days" : k === "h" ? "hrs" : "min"}</span>
                  </div>
                  {i < 2 && <span className="text-slate-600 text-xl font-bold">:</span>}
                </div>
              ))}
              <div className="self-center ml-2 text-xs text-slate-400 max-w-[130px]">until the recommended 470 posting date</div>
            </div>
            <div className="mt-3.5 text-[12.5px] text-slate-400 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Live Form 471 window: <b className="text-slate-200">Jan 15 – Mar 26, 2026</b>
            </div>
          </div>

          {/* blockers */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-[13px] font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Blocking your filing
            </h3>
            <div className="text-[11.5px] text-slate-400 mb-2.5">Clear these and we can file your 470</div>
            {blockerItems.map((b) => {
              const kindIcon = b.kind === "loa" ? <PenLine className="w-4 h-4" /> : b.kind === "survey" ? <ClipboardList className="w-4 h-4" /> : b.kind === "upload" ? <FileText className="w-4 h-4" /> : <Target className="w-4 h-4" />;
              return (
                <div key={b.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl mb-2 border transition ${b.done ? "border-emerald-900 bg-emerald-950/40 opacity-75" : "border-amber-900/60 bg-amber-950/30"}`}>
                  <div className={`w-[30px] h-[30px] rounded-lg flex items-center justify-center flex-none ${b.done ? "bg-emerald-900/50 text-emerald-300" : "bg-amber-900/50 text-amber-400"}`}>
                    {b.done ? <Check className="w-4 h-4" /> : kindIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <b className="text-[12.5px] block">{b.title}</b>
                    <span className="text-[11px] text-slate-400">{b.sub}</span>
                  </div>
                  {b.done ? (
                    <span className="text-[11.5px] font-bold text-emerald-300 bg-emerald-900/40 rounded-lg px-2.5 py-1.5">Done</span>
                  ) : (
                    <button onClick={() => openTask(b.phase, b.id)} className={`text-[11.5px] font-bold text-slate-950 rounded-lg px-2.5 py-1.5 bg-gradient-to-br ${brand.grad} whitespace-nowrap`}>{b.cta}</button>
                  )}
                </div>
              );
            })}
            {itemsLeft <= 0 && (
              <div className="text-center py-3 text-emerald-300 text-[13px] font-semibold flex items-center justify-center gap-2">
                <Check className="w-4 h-4" /> All clear — you’re ready to post!
              </div>
            )}
          </div>
        </div>

        {/* SIMPLE MODE */}
        {simple && (
          <div className="mt-7">
            <div className="rounded-3xl border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-9 text-center max-w-2xl mx-auto shadow-2xl">
              {nextStep ? (
                <>
                  <div className="text-[12px] uppercase tracking-[0.12em] text-slate-400 font-bold">Your next step · Phase {nextStep.phase}</div>
                  <div className="w-[76px] h-[76px] rounded-[22px] bg-slate-900 border border-slate-700 flex items-center justify-center text-teal-300 mx-auto mt-4 mb-4">
                    {inferKind(nextStep.task) === "loa" ? <PenLine className="w-8 h-8" /> : inferKind(nextStep.task) === "survey" ? <ClipboardList className="w-8 h-8" /> : inferKind(nextStep.task) === "upload" ? <Upload className="w-8 h-8" /> : <Target className="w-8 h-8" />}
                  </div>
                  <h2 className="text-[27px] font-bold mb-2">{nextStep.task.t}</h2>
                  <p className="text-slate-300 max-w-md mx-auto mb-6 text-[14.5px]">This is the one thing we need from you right now. Tap the button and we’ll walk you through it, one step at a time.</p>
                  <button onClick={() => openTask(nextStep.phase, nextStep.task.id)} className={`inline-flex items-center gap-2.5 text-base font-extrabold text-slate-950 rounded-2xl px-7 py-4 bg-gradient-to-br ${brand.grad}`}>
                    <Sparkles className="w-5 h-5" /> Do it now
                  </button>
                  <div className="mt-4 text-[12.5px] text-slate-400">Due {nextStep.task.due} · about a minute</div>
                </>
              ) : (
                <>
                  <div className="text-[12px] uppercase tracking-[0.12em] text-slate-400 font-bold">You’re all caught up</div>
                  <div className="w-[76px] h-[76px] rounded-[22px] bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-300 mx-auto mt-4 mb-4">
                    <Check className="w-8 h-8" />
                  </div>
                  <h2 className="text-[27px] font-bold mb-2">Nothing needs you right now</h2>
                  <p className="text-slate-300 max-w-md mx-auto text-[14.5px]">Every task on your plate is done. We’ll let you know the moment your next step is ready.</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* TIMELINE + BOARD */}
        {!simple && (
          <>
            <div className="flex items-center justify-between mt-9 mb-3">
              <h3 className="text-[17px] font-semibold tracking-tight">The season — 12 phases</h3>
              <div className="text-xs text-slate-400 hidden sm:flex gap-3.5">
                <span><i className="inline-block w-2 h-2 rounded-full bg-teal-400 mr-1.5 align-middle" />Done</span>
                <span><i className="inline-block w-2 h-2 rounded-full bg-indigo-400 mr-1.5 align-middle" />Current</span>
                <span><i className="inline-block w-2 h-2 rounded-full bg-slate-600 mr-1.5 align-middle" />Upcoming</span>
              </div>
            </div>
            <div className="flex gap-0 overflow-x-auto pb-3.5 -mx-1 px-1">
              {PHASES.map((p) => {
                const st = phaseState[p.n];
                return (
                  <button key={p.n} onClick={() => setSelected(p.n)} className="flex-none w-[132px] px-1.5 text-left">
                    <div className={`h-[5px] rounded-md mb-2.5 overflow-hidden ${st === "future" ? "bg-slate-800" : "bg-slate-700"}`}>
                      <i className={`block h-full rounded-md origin-left transition-transform duration-500 ${st === "done" ? "scale-x-100 bg-gradient-to-r from-teal-400 to-emerald-500" : st === "current" ? "scale-x-100 bg-gradient-to-r from-indigo-500 to-teal-400" : "scale-x-0"}`} />
                    </div>
                    <div className={`w-[34px] h-[34px] rounded-[10px] flex items-center justify-center mb-2 border transition ${selected === p.n ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-950" : ""} ${st === "done" ? "bg-emerald-950 border-emerald-800 text-emerald-300" : st === "current" ? `bg-gradient-to-br ${brand.grad} border-transparent text-slate-950` : "bg-slate-900 border-slate-700 text-slate-500"}`}>
                      {st === "done" ? <Check className="w-4 h-4" /> : st === "current" ? <Target className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                    </div>
                    <div className="text-[10.5px] uppercase tracking-wide font-bold text-slate-400">{p.mo}</div>
                    <div className="text-[12px] text-slate-300 mt-0.5 leading-tight min-h-[31px]">{p.title}</div>
                  </button>
                );
              })}
            </div>

            {/* board */}
            <div className="grid lg:grid-cols-[1fr_296px] gap-4 mt-1.5">
              <div>
                <div className="flex items-center gap-3.5 mb-3.5">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${brand.grad} flex items-center justify-center text-slate-950 font-extrabold text-lg`}>{selPhase.n}</div>
                  <div>
                    <h3 className="text-[19px] font-semibold tracking-tight">{selPhase.title}</h3>
                    <p className="text-[12.5px] text-slate-400 mt-0.5">{selPhase.mo} · Funding Year 2026</p>
                  </div>
                  <div className="ml-auto text-right">
                    <b className="text-xl">{counts.done}/{phaseTasks.length}</b>
                    <span className="block text-[11px] text-slate-400">tasks done</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {([
                    ["todo", "To Do", "bg-slate-500", counts.todo],
                    ["doing", "In Progress", "bg-indigo-500", counts.doing],
                    ["waiting", "Waiting on You", "bg-amber-500", counts.waiting],
                    ["done", "Done", "bg-teal-400", counts.done],
                  ] as const).map(([col, label, dot, count]) => (
                    <div key={col} className={`rounded-2xl border p-2.5 min-h-[180px] ${col === "waiting" ? "border-amber-900/60 bg-amber-950/20" : "border-slate-800 bg-slate-900/40"}`}>
                      <div className="flex items-center gap-2 text-xs font-bold mb-2.5 px-0.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${dot}`} /> {label}
                        <span className="ml-auto text-[11px] text-slate-400 bg-slate-950/60 border border-slate-700 rounded-full px-2">{count}</span>
                      </div>
                      {phaseTasks.filter((t) => t.col === col).map((t) => {
                        const soon = t.due === "Today" || /Sep 1[0-5]/.test(t.due);
                        return (
                          <button key={t.id} onClick={() => t.col !== "done" && openTask(selected, t.id)} className={`w-full text-left bg-slate-900 border border-slate-700 rounded-xl p-2.5 mb-2.5 relative block hover:border-slate-500 transition ${t.col === "done" ? "opacity-60" : ""}`}>
                            {t.col === "done" && <span className="absolute top-2.5 right-2.5 w-[18px] h-[18px] rounded-md bg-emerald-900/60 border border-emerald-800 text-emerald-300 flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                            <div className={`text-[12.5px] font-semibold leading-snug ${t.col === "done" ? "line-through decoration-teal-400/50" : ""}`}>{t.t}</div>
                            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                              <span className={`text-[10px] font-extrabold uppercase rounded-md px-1.5 py-0.5 border ${t.own === "you" ? "bg-lime-950 text-lime-300 border-lime-900" : "bg-slate-800 text-indigo-300 border-indigo-900/60"}`}>{t.own === "you" ? "You" : brand.team}</span>
                              {t.doc && <span className="text-[10px] text-slate-400 bg-slate-950 border border-slate-700 rounded-md px-1.5 py-0.5 inline-flex gap-1 items-center"><FileText className="w-2.5 h-2.5" />Doc</span>}
                              <span className={`text-[10.5px] flex items-center gap-1 ${t.due === "Today" ? "text-rose-400" : soon ? "text-amber-400" : "text-slate-400"}`}><Clock className="w-2.5 h-2.5" />{t.due}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* right rail */}
              <div className="space-y-3.5">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <h4 className="text-[13px] text-slate-200 font-medium mb-0.5">Keep the streak</h4>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="w-11 h-11 rounded-xl bg-amber-950 text-amber-400 flex items-center justify-center"><Flame className="w-5 h-5" /></div>
                    <div>
                      <b className="text-xl">4-phase streak</b>
                      <span className="block text-[11.5px] text-slate-400">Finish Phase 3 to make it 5</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <h4 className="text-[13px] text-slate-200 font-medium mb-2.5">Upcoming deadlines</h4>
                  {[
                    ["#f43f5e", "Recommended 470 posting", "27d"],
                    ["#818cf8", "Bid evaluation opens", "Nov"],
                    ["#2dd4bf", "Form 471 window closes", "Mar 26"],
                  ].map(([c, t, d]) => (
                    <div key={t} className="flex items-center gap-2.5 py-2 border-b border-slate-800 last:border-0">
                      <span className="w-2 h-2 rounded-full flex-none" style={{ background: c }} />
                      <span className="text-[12px] flex-1">{t}</span>
                      <span className="text-[10.5px] text-slate-400">{d}</span>
                    </div>
                  ))}
                  <button onClick={() => setToast("Subscription link copied — add it to Google or Outlook")} className={`w-full mt-3 flex items-center justify-center gap-2 text-[13px] font-bold text-slate-950 rounded-xl py-2.5 bg-gradient-to-br ${brand.grad}`}>
                    <Calendar className="w-4 h-4" /> Add deadlines to calendar
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* DRAWER */}
      {drawer && drawerTask && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex justify-end" onClick={(e) => e.target === e.currentTarget && closeDrawer()}>
          <aside className="w-[min(470px,96vw)] h-full bg-slate-900 border-l border-slate-700 flex flex-col shadow-2xl">
            <div className="flex items-start gap-3 p-5 border-b border-slate-800">
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-teal-300 font-bold">
                  {drawerKind === "survey" ? "Quick survey" : drawerKind === "loa" ? "E-signature" : drawerKind === "upload" ? "Upload a file" : "Complete task"}
                </div>
                <h3 className="text-lg font-semibold mt-1">{drawerTask.t}</h3>
              </div>
              <button onClick={closeDrawer} className="ml-auto w-8 h-8 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 flex items-center justify-center flex-none"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {drawerKind === "loa" && (
                <>
                  <p className="text-[13.5px] text-slate-300 mb-4 leading-relaxed">Read the short letter, type your name to sign, and we’ll file your Form 470 for you. Takes about 20 seconds.</p>
                  <div className="bg-slate-950 border border-slate-700 rounded-xl p-4 text-[12.5px] text-slate-300 leading-relaxed max-h-52 overflow-y-auto mb-4">
                    <b className="text-slate-100">Letter of Agency</b><br /><br />
                    Eastside Unified School District (BEN 16056315) authorizes <b className="text-slate-100">{brand.name}</b> to prepare, file, and manage its FCC Form 470 and related E-Rate filings for Funding Year 2026, including communicating with USAC on the district’s behalf.<br /><br />
                    This authorization stays in effect for the 2026 funding year unless revoked in writing.
                  </div>
                  <div className="mb-3.5">
                    <label className="block text-xs text-slate-400 mb-1.5 font-semibold">Type your full name to sign</label>
                    <input value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="e.g. Maria Gonzalez" autoComplete="off" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="border border-dashed border-slate-600 rounded-xl p-4 text-center">
                    <div className="text-2xl text-teal-300 min-h-[38px]" style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive" }}>{signName || <span className="text-slate-500 text-sm">Your signature appears here</span>}</div>
                  </div>
                </>
              )}

              {drawerKind === "upload" && (
                <>
                  <p className="text-[13.5px] text-slate-300 mb-4 leading-relaxed">Drag your file here or click to choose one. PDF, Word, or even a clear photo works — we’ll read it for you and check it’s complete.</p>
                  <button onClick={() => setUploaded(true)} className={`w-full border border-dashed rounded-2xl py-8 text-center transition ${uploaded ? "border-emerald-800 bg-emerald-950/40 text-emerald-300" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:bg-slate-800/40"}`}>
                    <Upload className="w-7 h-7 mx-auto mb-2 text-teal-300" />
                    <div>{uploaded ? "network-inventory.pdf · uploaded & validated" : "Click to choose a file"}</div>
                  </button>
                </>
              )}

              {drawerKind === "survey" && (
                <>
                  <div className="flex gap-1.5 mb-4">
                    {SURVEY.map((_, i) => <i key={i} className={`h-1 rounded flex-1 ${i <= surveyStep ? "bg-teal-400" : "bg-slate-700"}`} />)}
                  </div>
                  <p className="text-[13.5px] text-slate-300 mb-3.5">Question {surveyStep + 1} of {SURVEY.length} — just tap an answer.</p>
                  <div className="text-base font-semibold mb-3.5">{SURVEY[surveyStep].q}</div>
                  <div className="flex flex-col gap-2.5">
                    {SURVEY[surveyStep].opts.map((o, i) => (
                      <button key={o} onClick={() => setSurveyAns((a) => a.map((v, idx) => (idx === surveyStep ? i : v)))} className={`border rounded-xl px-3.5 py-3 text-left text-[13.5px] transition ${surveyAns[surveyStep] === i ? "border-teal-500 bg-emerald-950/40 text-slate-100" : "border-slate-700 text-slate-300 hover:border-indigo-500"}`}>{o}</button>
                    ))}
                  </div>
                </>
              )}

              {drawerKind === "simple" && (
                <>
                  <p className="text-[13.5px] text-slate-300 mb-4 leading-relaxed">Here’s what this step is. When you’ve taken care of it, mark it done and we’ll update your filing progress automatically.</p>
                  <div className="bg-slate-950 border border-slate-700 rounded-xl p-4 text-[12.5px] text-slate-300">{drawerTask.t}</div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 flex gap-2.5">
              {drawerKind === "survey" && surveyStep > 0 ? (
                <button onClick={() => setSurveyStep((s) => s - 1)} className="flex-1 rounded-xl py-3 font-bold text-[13.5px] border border-slate-700 text-slate-200 hover:border-slate-500">Back</button>
              ) : (
                <button onClick={closeDrawer} className="flex-1 rounded-xl py-3 font-bold text-[13.5px] border border-slate-700 text-slate-200 hover:border-slate-500">Cancel</button>
              )}
              {drawerKind === "survey" && surveyStep < SURVEY.length - 1 ? (
                <button disabled={surveyAns[surveyStep] == null} onClick={() => setSurveyStep((s) => s + 1)} className={`flex-1 rounded-xl py-3 font-bold text-[13.5px] text-slate-950 bg-gradient-to-br ${brand.grad} disabled:opacity-40`}>Next</button>
              ) : (
                <button
                  disabled={(drawerKind === "loa" && !signName.trim()) || (drawerKind === "upload" && !uploaded) || (drawerKind === "survey" && surveyAns[surveyStep] == null)}
                  onClick={submitDrawer}
                  className={`flex-1 rounded-xl py-3 font-bold text-[13.5px] text-slate-950 bg-gradient-to-br ${brand.grad} disabled:opacity-40`}
                >
                  {drawerKind === "loa" ? "Sign & submit" : drawerKind === "survey" ? "Submit survey" : drawerKind === "upload" ? "Submit" : "Mark done"}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* confetti */}
      {confetti && (
        <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
          {Array.from({ length: 80 }).map((_, i) => (
            <span key={i} className="absolute -top-2 w-2 h-3.5 rounded-sm" style={{
              left: `${Math.random() * 100}vw`,
              background: ["#4f7cf7", "#2dd4bf", "#22c55e", "#fbbf24", "#a5f3d0"][i % 5],
              animation: `fbfall ${2 + Math.random() * 1.6}s linear forwards`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }} />
          ))}
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-7 z-[90] bg-emerald-950 border border-emerald-800 text-emerald-200 px-4 py-3 rounded-xl text-[13.5px] font-semibold shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
