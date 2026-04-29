"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";

type UserRole = "consultant" | "vendor" | "applicant";

const ROLE_OPTIONS: { value: UserRole; label: string; emoji: string; price: string; tagline: string }[] = [
  { value: "consultant", label: "Consultant", emoji: "📋", price: "$499/mo", tagline: "Manage school portfolios" },
  { value: "vendor", label: "Vendor", emoji: "🏢", price: "$499/mo", tagline: "Find Form 470 leads" },
  { value: "applicant", label: "Applicant", emoji: "🏫", price: "$199/mo", tagline: "Track funding & FRNs" },
];

export default function SignUpPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
        </div>
      }
    >
      <SignUpPage />
    </Suspense>
  );
}

function SignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, isLoading, error: authError } = useAuthStore();

  const [promoToken, setPromoToken] = useState<string | null>(null);
  const [promoData, setPromoData] = useState<{ email: string; role: string; trial_days: number } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    role: "consultant" as UserRole,
    referral: "",
  });
  const [prefillFrn, setPrefillFrn] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Phase 2: read ?role=&prefill_frn= so deep-links from /tools/frn-tracker
  // and the homepage audience chips pre-populate the signup form.
  useEffect(() => {
    trackEvent("signup_start", {
      source: searchParams.get("source") || undefined,
      role: searchParams.get("role") || undefined,
    });
    const roleParam = searchParams.get("role");
    if (roleParam && ["consultant", "vendor", "applicant"].includes(roleParam)) {
      setFormData((prev) => ({ ...prev, role: roleParam as UserRole }));
    }
    const frnParam = searchParams.get("prefill_frn");
    if (frnParam) {
      const cleaned = frnParam.replace(/\D/g, "").slice(0, 20);
      if (cleaned) setPrefillFrn(cleaned);
    }
  }, [searchParams]);

  useEffect(() => {
    const token = searchParams.get("promo");
    if (!token) return;
    setPromoToken(token);
    setPromoLoading(true);
    api
      .validatePromoToken(token)
      .then((res: any) => {
        if (res.data?.valid) {
          setPromoData(res.data);
          setFormData((prev) => ({
            ...prev,
            email: res.data.email || prev.email,
            role: (res.data.role || prev.role) as UserRole,
          }));
        } else {
          setPromoError("This invite link is invalid or has expired.");
        }
      })
      .catch((err: any) => {
        setPromoError(err?.response?.data?.detail || err?.message || "Invalid invite link");
      })
      .finally(() => setPromoLoading(false));
  }, [searchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.email.trim()) {
      setError("Email is required");
      return;
    }
    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    const success = await register({
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      role: formData.role,
      promo_token: promoToken || undefined,
    });

    if (success) {
      trackEvent("signup_complete", {
        role: formData.role,
        source: searchParams.get("source") || undefined,
      });
      router.push(promoToken && promoData ? "/onboarding" : "/onboarding");
    } else {
      setError(authError || "Failed to create account. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* LEFT — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-700 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-40 left-10 w-80 h-80 bg-white/10 rounded-full blur-3xl floating" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-400/15 rounded-full blur-3xl floating" style={{ animationDelay: "-3s" }} />
        </div>

        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={40} height={40} className="rounded-xl" />
            <span className="text-white font-bold text-2xl">
              SkyRate<span className="text-purple-300">.AI</span>
            </span>
          </Link>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
            {promoData ? (
              <>
                You&apos;re Invited!
                <br />
                <span className="text-blue-200">
                  {promoData.trial_days >= 30
                    ? `${Math.floor(promoData.trial_days / 30)} Month${Math.floor(promoData.trial_days / 30) > 1 ? "s" : ""}`
                    : `${promoData.trial_days} Days`}{" "}
                  Free
                </span>
              </>
            ) : (
              <>
                Start in 30 seconds.
                <br />
                <span className="text-blue-200">Add details later.</span>
              </>
            )}
          </h1>
          <p className="text-lg text-purple-100 max-w-md">
            Just email and password. We&apos;ll set up CRN/SPIN/BEN verification after you&apos;re inside.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="text-center glassmorphism-card rounded-xl p-3">
              <div className="text-3xl font-bold text-white">$500M+</div>
              <div className="text-sm text-purple-200">Funding Tracked</div>
            </div>
            <div className="text-center glassmorphism-card rounded-xl p-3">
              <div className="text-3xl font-bold text-white">2,500+</div>
              <div className="text-sm text-purple-200">Schools</div>
            </div>
            <div className="text-center glassmorphism-card rounded-xl p-3">
              <div className="text-3xl font-bold text-white">14-day</div>
              <div className="text-sm text-purple-200">Free Trial</div>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4 text-white/80 text-sm flex-wrap">
            <span className="px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm">🔒 SSL Secured</span>
            <span className="px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm">✓ SOC 2 Aligned</span>
            <span className="px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm">🛡️ FERPA Ready</span>
          </div>
        </div>
      </div>

      {/* RIGHT — Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 overflow-y-auto">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <Link href="/" className="inline-flex items-center justify-center gap-3">
              <img src="/images/logos/logo-icon-transparent.png" alt="" width={40} height={40} className="rounded-xl" />
              <span className="text-slate-900 font-bold text-2xl">
                SkyRate<span className="text-purple-600">.AI</span>
              </span>
            </Link>
          </div>

          <div className="light-card rounded-2xl p-8 bg-white shadow-xl shadow-slate-200/50 border border-slate-200/80">
            {promoLoading && (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-3" />
                <p className="text-slate-500">Validating your invite...</p>
              </div>
            )}

            {promoError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="font-medium text-red-700">Invalid Invite</div>
                <div className="text-sm text-red-600 mt-1">{promoError}</div>
              </div>
            )}

            {promoData && !promoLoading && (
              <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🎟️</span>
                  <span className="font-semibold text-purple-800">You&apos;re Invited!</span>
                </div>
                <p className="text-sm text-purple-700">
                  You have{" "}
                  <strong>
                    {promoData.trial_days >= 30
                      ? `${Math.floor(promoData.trial_days / 30)} month${Math.floor(promoData.trial_days / 30) > 1 ? "s" : ""}`
                      : `${promoData.trial_days} days`}
                  </strong>{" "}
                  of free access as a <strong className="capitalize">{promoData.role}</strong>. No credit card.
                </p>
              </div>
            )}

            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold gradient-text-dark">Create your account</h1>
              <p className="text-slate-500 mt-2 text-sm">
                Start in seconds. Verify your USAC entity later.
              </p>
            </div>

            {prefillFrn && (
              <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl" data-testid="prefill-frn-banner">
                <div className="flex items-start gap-2">
                  <span className="text-indigo-500 text-lg">📡</span>
                  <div>
                    <div className="font-medium text-indigo-800">Tracking FRN {prefillFrn}</div>
                    <div className="text-sm text-indigo-700 mt-0.5">
                      We&apos;ll set up real-time alerts for this FRN as soon as you finish signing up.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(error || authError) && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <span className="text-red-500 text-lg">⚠️</span>
                <div>
                  <div className="font-medium text-red-700">Sign-up failed</div>
                  <div className="text-sm text-red-600">
                    {typeof (error || authError) === "string"
                      ? error || authError
                      : "Please check your information and try again."}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Role radio */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">I am a...</label>
                {promoData && (
                  <p className="text-xs text-purple-600 mb-2">
                    Role set by your invite — <span className="capitalize font-medium">{promoData.role}</span>
                  </p>
                )}
                <div className={`grid grid-cols-3 gap-3 ${promoData ? "opacity-60 pointer-events-none" : ""}`}>
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, role: opt.value }))}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        formData.role === opt.value
                          ? "border-purple-500 bg-purple-50 shadow-md shadow-purple-100"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="text-2xl mb-1">{opt.emoji}</div>
                      <div
                        className={`font-semibold text-sm ${
                          formData.role === opt.value ? "text-purple-700" : "text-slate-700"
                        }`}
                      >
                        {opt.label}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{opt.tagline}</div>
                      <div
                        className={`text-xs mt-1 font-medium ${
                          formData.role === opt.value ? "text-purple-600" : "text-slate-400"
                        }`}
                      >
                        {opt.price}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  readOnly={!!promoData}
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                    promoData ? "bg-slate-100 cursor-not-allowed" : ""
                  }`}
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>

              {/* Password (with show/hide) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-12 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  8+ characters with upper, lower, digit, and one special char.
                </p>
              </div>

              {/* Optional referral source */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  How did you hear about us? <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  name="referral"
                  value={formData.referral}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="Google, friend, conference..."
                />
              </div>

              <button
                type="submit"
                disabled={submitting || isLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-purple-200 disabled:opacity-60"
              >
                {submitting || isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  "Create account →"
                )}
              </button>

              <p className="text-center text-xs text-slate-500">
                By creating an account you agree to our{" "}
                <Link href="/terms" className="text-purple-600 hover:underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-purple-600 hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-200 text-center">
              <p className="text-sm text-slate-600">
                Already have an account?{" "}
                <Link href="/sign-in" className="text-purple-600 hover:text-purple-700 font-medium">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
