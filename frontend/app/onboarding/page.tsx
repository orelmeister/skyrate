"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Bell,
  Smartphone,
  Radio,
  Shield,
  Loader2,
  Search,
  AlertTriangle,
  Clock,
  DollarSign,
  FileText,
  Send,
  Phone,
  Check,
  X,
} from "lucide-react";

// ==================== TYPES ====================

interface DiscoveredFRN {
  frn_number: string;
  funding_year: string;
  applicant_name: string;
  service_type: string;
  status: string;
  funding_committed: number;
  form_number: string;
}

interface AlertPreferences {
  status_changes: boolean;
  new_denials: boolean;
  deadline_reminders: boolean;
  funding_updates: boolean;
  form_470_matches: boolean;
  email_notifications: boolean;
  push_notifications: boolean;
  sms_notifications: boolean;
  notification_frequency: string;
}

// ==================== STEP 1: FRN DISCOVERY ====================

function FRNDiscoveryStep({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [frns, setFrns] = useState<DiscoveredFRN[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    discoverFRNs();
  }, []);

  const discoverFRNs = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.discoverFRNs();
      if (res.success && res.data?.frns) {
        setFrns(res.data.frns);
        // Select all by default
        setSelected(new Set(res.data.frns.map((f: DiscoveredFRN) => f.frn_number)));
      }
    } catch (err: any) {
      setError("Could not discover FRNs. You can add them manually later from your dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const toggleFRN = (frn: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(frn)) next.delete(frn);
      else next.add(frn);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === frns.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(frns.map((f) => f.frn_number)));
    }
  };

  const handleSave = async () => {
    if (selected.size === 0) {
      onSkip();
      return;
    }
    setSaving(true);
    try {
      await api.selectFRNs(Array.from(selected));
      onNext();
    } catch {
      setError("Failed to save selections. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase() || "";
    if (s.includes("fund") || s.includes("committed")) return "text-green-600 bg-green-50";
    if (s.includes("denied") || s.includes("reject")) return "text-red-600 bg-red-50";
    if (s.includes("pending") || s.includes("review")) return "text-yellow-600 bg-yellow-50";
    return "text-slate-600 bg-slate-50";
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-10 h-10 text-purple-600 animate-spin mb-4" />
        <h3 className="text-lg font-semibold text-slate-800">Discovering your FRNs...</h3>
        <p className="text-sm text-slate-500 mt-1">Searching USAC records for your organization</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Search className="w-7 h-7 text-purple-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Your E-Rate FRNs</h2>
        <p className="text-slate-500 mt-1">
          {frns.length > 0
            ? `We found ${frns.length} FRN${frns.length > 1 ? "s" : ""} linked to your organization. Select which ones to monitor.`
            : "No FRNs were found. You can add them manually from your dashboard."}
        </p>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-700">{error}</p>
        </div>
      )}

      {frns.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={toggleAll}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              {selected.size === frns.length ? "Deselect all" : "Select all"}
            </button>
            <span className="text-sm text-slate-500">
              {selected.size} of {frns.length} selected
            </span>
          </div>

          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {frns.map((frn) => (
              <button
                key={frn.frn_number}
                onClick={() => toggleFRN(frn.frn_number)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selected.has(frn.frn_number)
                    ? "border-purple-300 bg-purple-50/50 ring-1 ring-purple-200"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm text-slate-800">
                        {frn.frn_number}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(frn.status)}`}>
                        {frn.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5 truncate">{frn.applicant_name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>FY {frn.funding_year}</span>
                      <span>{frn.service_type}</span>
                      <span className="font-medium text-slate-600">{formatCurrency(frn.funding_committed)}</span>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                    selected.has(frn.frn_number) ? "bg-purple-600 border-purple-600" : "border-slate-300"
                  }`}>
                    {selected.has(frn.frn_number) && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
        <button
          onClick={onSkip}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Skip for now
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {frns.length > 0 ? "Continue" : "Next"}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ==================== STEP 2: ALERT PREFERENCES ====================

function AlertPreferencesStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<AlertPreferences>({
    status_changes: true,
    new_denials: true,
    deadline_reminders: true,
    funding_updates: true,
    form_470_matches: user?.role === "vendor",
    email_notifications: true,
    push_notifications: true,
    sms_notifications: false,
    notification_frequency: "realtime",
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const res = await api.getAlertPreferences();
      if (res.success && res.data?.preferences) {
        setPrefs((prev) => ({ ...prev, ...res.data.preferences }));
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateAlertPreferences(prefs);
      onNext();
    } catch {
      // Continue anyway since defaults are sensible
      onNext();
    } finally {
      setSaving(false);
    }
  };

  const alertTypes = [
    { key: "status_changes" as const, icon: Radio, label: "FRN Status Changes", desc: "When an FRN status is updated in USAC" },
    { key: "new_denials" as const, icon: AlertTriangle, label: "New Denials", desc: "Immediate notification when funding is denied" },
    { key: "deadline_reminders" as const, icon: Clock, label: "Deadline Reminders", desc: "Upcoming filing and appeal deadlines" },
    { key: "funding_updates" as const, icon: DollarSign, label: "Funding Updates", desc: "Committed/disbursed amount changes" },
    ...(user?.role === "vendor"
      ? [{ key: "form_470_matches" as const, icon: FileText, label: "Form 470 Matches", desc: "New Form 470s matching your services" }]
      : []),
  ];

  const frequencies = [
    { value: "realtime", label: "Real-time", desc: "Instant notifications" },
    { value: "6hr", label: "Every 6 hours", desc: "Batched summary" },
    { value: "daily", label: "Daily digest", desc: "Once per day at 8 AM" },
    { value: "weekly", label: "Weekly summary", desc: "Monday mornings" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Bell className="w-7 h-7 text-purple-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Alert Preferences</h2>
        <p className="text-slate-500 mt-1">Choose what you want to be notified about and how</p>
      </div>

      {/* Alert Types */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">What to monitor</h3>
        <div className="space-y-2">
          {alertTypes.map((at) => (
            <label
              key={at.key}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                prefs[at.key] ? "border-purple-200 bg-purple-50/30" : "border-slate-200 bg-white"
              }`}
            >
              <at.icon className={`w-5 h-5 flex-shrink-0 ${prefs[at.key] ? "text-purple-600" : "text-slate-400"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{at.label}</p>
                <p className="text-xs text-slate-500">{at.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={prefs[at.key]}
                onChange={() => setPrefs((p) => ({ ...p, [at.key]: !p[at.key] }))}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Notification Channels */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">How to receive alerts</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "email_notifications" as const, label: "Email", icon: "📧" },
            { key: "push_notifications" as const, label: "Push", icon: "🔔" },
            { key: "sms_notifications" as const, label: "SMS", icon: "📱" },
          ].map((ch) => (
            <button
              key={ch.key}
              onClick={() => setPrefs((p) => ({ ...p, [ch.key]: !p[ch.key] }))}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                prefs[ch.key]
                  ? "border-purple-300 bg-purple-50 text-purple-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
              }`}
            >
              <span>{ch.icon}</span>
              {ch.label}
            </button>
          ))}
        </div>
        {prefs.sms_notifications && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            <Smartphone className="w-3 h-3" />
            You'll verify your phone number in the next step
          </p>
        )}
      </div>

      {/* Frequency */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Notification frequency</h3>
        <div className="grid grid-cols-2 gap-2">
          {frequencies.map((f) => (
            <button
              key={f.value}
              onClick={() => setPrefs((p) => ({ ...p, notification_frequency: f.value }))}
              className={`text-left p-3 rounded-xl border text-sm transition-all ${
                prefs.notification_frequency === f.value
                  ? "border-purple-300 bg-purple-50 ring-1 ring-purple-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p className="font-medium text-slate-800">{f.label}</p>
              <p className="text-xs text-slate-500">{f.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Continue
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ==================== STEP 3: PHONE VERIFICATION ====================

function PhoneVerificationStep({
  onComplete,
  onBack,
  smsEnabled,
}: {
  onComplete: () => void;
  onBack: () => void;
  smsEnabled: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const sendCode = async () => {
    if (!phone.trim()) {
      setError("Please enter your phone number");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await api.sendPhoneVerification(phone.trim());
      if (res.success) {
        setCodeSent(true);
        setResendTimer(60);
      } else {
        setError(res.error || "Failed to send verification code");
      }
    } catch {
      setError("Failed to send code. Please check the number and try again.");
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (!code.trim() || code.length < 4) {
      setError("Please enter the verification code");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await api.verifyPhoneCode(phone.trim(), code.trim());
      if (res.success && res.data?.verified) {
        setVerified(true);
      } else {
        setError(res.error || "Invalid verification code. Please try again.");
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await api.completeOnboarding();
      if (res.success && res.data?.redirect_url) {
        onComplete();
      } else {
        onComplete();
      }
    } catch {
      onComplete();
    }
  };

  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Smartphone className="w-7 h-7 text-purple-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">
          {smsEnabled ? "Verify Your Phone" : "You're All Set!"}
        </h2>
        <p className="text-slate-500 mt-1">
          {smsEnabled
            ? "Verify your phone number to receive SMS alerts"
            : "Your account is configured and ready to go"}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
          <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {smsEnabled && !verified && (
        <div className="space-y-4">
          {!codeSent ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <button
                  onClick={sendCode}
                  disabled={sending}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Code
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Standard messaging rates may apply</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-600 mb-3">
                A verification code was sent to <span className="font-medium">{phone}</span>
              </p>
              <label className="block text-sm font-medium text-slate-700 mb-1">Verification Code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <button
                  onClick={verifyCode}
                  disabled={verifying || code.length < 4}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Verify
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <button
                  onClick={() => {
                    setCodeSent(false);
                    setCode("");
                    setError("");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Change number
                </button>
                <button
                  onClick={sendCode}
                  disabled={resendTimer > 0 || sending}
                  className="text-xs text-purple-600 hover:text-purple-700 disabled:text-slate-400"
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend code"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {verified && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 mb-4">
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">Phone verified successfully!</p>
            <p className="text-xs text-green-600">You'll receive SMS alerts at {phone}</p>
          </div>
        </div>
      )}

      {!smsEnabled && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-purple-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-purple-800">Your monitoring is set up</p>
              <ul className="text-xs text-purple-600 mt-2 space-y-1">
                <li className="flex items-center gap-1"><Check className="w-3 h-3" /> FRN tracking configured</li>
                <li className="flex items-center gap-1"><Check className="w-3 h-3" /> Alert preferences saved</li>
                <li className="flex items-center gap-1"><Check className="w-3 h-3" /> Notification channels selected</li>
              </ul>
              <p className="text-xs text-slate-500 mt-2">
                You can enable SMS alerts anytime from your account settings.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={handleComplete}
          disabled={completing || (smsEnabled && !verified)}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-50 shadow-lg shadow-purple-200"
        >
          {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

// ==================== MAIN ONBOARDING PAGE ====================

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, user, isLoading } = useAuthStore();
  const [step, setStep] = useState(0);
  const [smsEnabled, setSmsEnabled] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/sign-in");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleComplete = async () => {
    // Redirect to role-based dashboard
    const dashboardUrl =
      user?.role === "vendor"
        ? "/vendor"
        : user?.role === "applicant"
        ? "/applicant"
        : "/consultant";
    router.push(dashboardUrl);
  };

  const steps = [
    { label: "FRN Discovery", icon: Search },
    { label: "Alerts", icon: Bell },
    { label: "Verify Phone", icon: Smartphone },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img
              src="/images/logos/logo-icon-transparent.png"
              alt=""
              width={36}
              height={36}
              className="rounded-lg"
            />
            <span className="text-slate-900 font-bold text-xl">
              SkyRate<span className="text-purple-600">.AI</span>
            </span>
          </div>
          <p className="text-sm text-slate-500">Welcome! Let's set up your E-Rate monitoring</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  i === step
                    ? "bg-purple-600 text-white shadow-md shadow-purple-200"
                    : i < step
                    ? "bg-purple-100 text-purple-700"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {i < step ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <s.icon className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-6 h-0.5 ${i < step ? "bg-purple-400" : "bg-slate-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-8">
          {step === 0 && (
            <FRNDiscoveryStep
              onNext={() => setStep(1)}
              onSkip={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <AlertPreferencesStep
              onNext={() => {
                setStep(2);
              }}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <PhoneVerificationStep
              onComplete={handleComplete}
              onBack={() => setStep(1)}
              smsEnabled={smsEnabled}
            />
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-4">
          You can change these settings anytime from your dashboard
        </p>
      </div>
    </div>
  );
}
