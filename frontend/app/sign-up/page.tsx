"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

type UserRole = "consultant" | "vendor" | "applicant";
type VerificationStatus = "idle" | "verifying" | "verified" | "error";

export default function SignUpPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
      </div>
    }>
      <SignUpPage />
    </Suspense>
  );
}

function SignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, isLoading, error: authError } = useAuthStore();
  
  // Promo invite state
  const [promoToken, setPromoToken] = useState<string | null>(null);
  const [promoData, setPromoData] = useState<{ email: string; role: string; trial_days: number } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    company: "",
    role: "consultant" as UserRole,
    crn: "",  // Consultant Registration Number
    spin: "", // Service Provider Identification Number
    ben: "",  // Billed Entity Number (for applicants)
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Verification state
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("idle");
  const [verifiedName, setVerifiedName] = useState("");
  const [verificationError, setVerificationError] = useState("");

  // Validate promo token on mount
  useEffect(() => {
    const token = searchParams.get("promo");
    if (token) {
      setPromoToken(token);
      setPromoLoading(true);
      api.validatePromoToken(token)
        .then((res) => {
          if (res.data?.valid) {
            setPromoData(res.data);
            // Pre-fill email and role from invite
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
          const detail = err?.response?.data?.detail || err?.message || "Invalid invite link";
          setPromoError(detail);
        })
        .finally(() => setPromoLoading(false));
    }
  }, [searchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Reset verification when CRN/SPIN/BEN changes
    if (name === "crn" || name === "spin" || name === "ben") {
      setVerificationStatus("idle");
      setVerifiedName("");
      setVerificationError("");
    }
  };
  
  // Verify CRN/SPIN/BEN with USAC API
  const verifyEntity = useCallback(async () => {
    const { role, crn, spin, ben } = formData;
    
    let endpoint = "";
    let value = "";
    
    if (role === "consultant" && crn.trim()) {
      endpoint = "/auth/validate-crn";
      value = crn.trim();
    } else if (role === "vendor" && spin.trim()) {
      endpoint = "/auth/validate-spin";
      value = spin.trim();
    } else if (role === "applicant" && ben.trim()) {
      endpoint = "/auth/validate-ben";
      value = ben.trim();
    } else {
      return; // Nothing to verify
    }
    
    setVerificationStatus("verifying");
    setVerificationError("");
    
    try {
      const response = await api.post(endpoint, { value });
      const data = response.data;
      
      if (data.valid) {
        setVerificationStatus("verified");
        setVerifiedName(data.name || "");
        // Auto-populate company/entity name
        if (data.name) {
          setFormData(prev => ({ ...prev, company: data.name }));
        }
      } else {
        setVerificationStatus("error");
        setVerificationError(data.error || "Not found in USAC database");
      }
    } catch (err: any) {
      setVerificationStatus("error");
      setVerificationError(err.response?.data?.detail || "Verification failed. Please try again.");
    }
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setIsSubmitting(false);
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsSubmitting(false);
      return;
    }

    // Validate CRN for consultants
    if (formData.role === "consultant" && !formData.crn.trim()) {
      setError("CRN (Consultant Registration Number) is required");
      setIsSubmitting(false);
      return;
    }

    // Validate SPIN for vendors
    if (formData.role === "vendor" && !formData.spin.trim()) {
      setError("SPIN (Service Provider ID Number) is required");
      setIsSubmitting(false);
      return;
    }
    
    // Validate BEN for applicants
    if (formData.role === "applicant" && !formData.ben.trim()) {
      setError("BEN (Billed Entity Number) is required");
      setIsSubmitting(false);
      return;
    }
    
    // Ensure verification passed
    if (verificationStatus !== "verified") {
      setError("Please verify your registration number with USAC before continuing");
      setIsSubmitting(false);
      return;
    }

    const success = await register({
      email: formData.email,
      password: formData.password,
      first_name: formData.firstName || undefined,
      last_name: formData.lastName || undefined,
      company_name: formData.company || undefined,
      role: formData.role,
      crn: formData.role === "consultant" ? formData.crn.trim() : undefined,
      spin: formData.role === "vendor" ? formData.spin.trim() : undefined,
      ben: formData.role === "applicant" ? formData.ben.trim() : undefined,
      promo_token: promoToken || undefined,
    });

    if (success) {
      if (promoToken && promoData) {
        // Promo invite: skip paywall, go directly to dashboard
        router.push(`/${formData.role}`);
      } else {
        // Normal registration: redirect to subscribe page
        router.push("/subscribe");
      }
    } else {
      setError(authError || "Failed to create account. Please try again.");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-700 p-12 flex-col justify-between relative overflow-hidden">
        {/* Mesh Gradient Background */}
        <div className="absolute inset-0">
          <div className="absolute top-40 left-10 w-80 h-80 bg-white/10 rounded-full blur-3xl floating"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-400/15 rounded-full blur-3xl floating" style={{ animationDelay: '-3s' }}></div>
          <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-purple-400/10 rounded-full blur-3xl floating" style={{ animationDelay: '-6s' }}></div>
        </div>
        
        {/* Logo */}
        <div className="relative z-10 animate-slide-up">
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={40} height={40} className="rounded-xl" />
            <span className="text-white font-bold text-2xl">SkyRate<span className="text-purple-300">.AI</span></span>
          </Link>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 space-y-6 animate-slide-up-delay-1">
          <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
            {promoData ? (
              <>You&apos;re Invited!<br /><span className="text-blue-200">{promoData.trial_days >= 30 ? `${Math.floor(promoData.trial_days / 30)} Month${Math.floor(promoData.trial_days / 30) > 1 ? 's' : ''}` : `${promoData.trial_days} Days`} Free Access</span></>
            ) : (
              <>Start Your<br /><span className="text-blue-200">14-Day Free Trial</span></>
            )}
          </h1>
          <p className="text-lg text-purple-100 max-w-md">
            {promoData 
              ? "You've been invited to experience SkyRate AI — the E-Rate Funding Intelligence Platform. No credit card required."
              : "Join thousands of E-Rate professionals who trust SkyRate AI to manage their funding applications."
            }
          </p>
          
          {/* Stats */}
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
              <div className="text-3xl font-bold text-white">98%</div>
              <div className="text-sm text-purple-200">Success Rate</div>
            </div>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="relative z-10 animate-slide-up-delay-2">
          <div className="flex items-center gap-4 text-white/80 text-sm">
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm">🔒 SSL Secured</span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm">✓ SOC 2 Compliant</span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm">🛡️ FERPA Ready</span>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 overflow-y-auto">
        <div className="w-full max-w-lg animate-slide-up">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <Link href="/" className="inline-flex items-center justify-center gap-3">
              <img src="/images/logos/logo-icon-transparent.png" alt="" width={40} height={40} className="rounded-xl" />
              <span className="text-slate-900 font-bold text-2xl">SkyRate<span className="text-purple-600">.AI</span></span>
            </Link>
          </div>

          {/* Form Card */}
          <div className="light-card rounded-2xl p-8">
            {/* Promo Loading */}
            {promoLoading && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-3" />
                <p className="text-slate-500">Validating your invite...</p>
              </div>
            )}

            {/* Promo Error */}
            {promoError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="font-medium text-red-700">Invalid Invite</div>
                <div className="text-sm text-red-600 mt-1">{promoError}</div>
                <Link href="/sign-up" className="text-sm text-purple-600 hover:underline mt-2 inline-block">
                  Sign up normally instead →
                </Link>
              </div>
            )}

            {/* Promo Success Banner */}
            {promoData && !promoLoading && (
              <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🎟️</span>
                  <span className="font-semibold text-purple-800">You&apos;re Invited!</span>
                </div>
                <p className="text-sm text-purple-700">
                  You have <strong>{promoData.trial_days >= 30 ? `${Math.floor(promoData.trial_days / 30)} month${Math.floor(promoData.trial_days / 30) > 1 ? 's' : ''}` : `${promoData.trial_days} days`}</strong> of 
                  free access as a <strong className="capitalize">{promoData.role}</strong>. No credit card required.
                </p>
              </div>
            )}

            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold gradient-text-dark">Create your account</h1>
              <p className="text-slate-500 mt-2">
                {promoData 
                  ? `Complete your ${promoData.role} account setup`
                  : "Start your free 14-day trial today"
                }
              </p>
            </div>

            {(error || authError) && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <span className="text-red-500 text-lg">⚠️</span>
                <div>
                  <div className="font-medium text-red-700">Registration failed</div>
                  <div className="text-sm text-red-600">
                    {typeof (error || authError) === 'string' 
                      ? (error || authError) 
                      : 'Please check your information and try again.'}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">I am a...</label>
                {promoData && (
                  <p className="text-xs text-purple-600 mb-2">Role set by your invite — <span className="capitalize font-medium">{promoData.role}</span></p>
                )}
                <div className={`grid grid-cols-3 gap-3 ${promoData ? 'opacity-60 pointer-events-none' : ''}`}>
                  <button
                    type="button"
                    onClick={() => { setFormData(prev => ({ ...prev, role: "consultant" })); setVerificationStatus("idle"); setVerifiedName(""); }}
                    className={`p-3 rounded-xl border-2 text-center transition-all hover-lift ${
                      formData.role === "consultant"
                        ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="text-2xl mb-1">📋</div>
                    <div className={`font-semibold text-sm ${formData.role === "consultant" ? "text-indigo-700" : "text-slate-700"}`}>
                      Consultant
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Manage schools</div>
                    <div className={`text-xs mt-1 font-medium ${formData.role === "consultant" ? "text-indigo-600" : "text-slate-400"}`}>
                      $300/mo
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFormData(prev => ({ ...prev, role: "vendor" })); setVerificationStatus("idle"); setVerifiedName(""); }}
                    className={`p-3 rounded-xl border-2 text-center transition-all hover-lift ${
                      formData.role === "vendor"
                        ? "border-purple-500 bg-purple-50 shadow-md shadow-purple-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="text-2xl mb-1">🏢</div>
                    <div className={`font-semibold text-sm ${formData.role === "vendor" ? "text-purple-700" : "text-slate-700"}`}>
                      Vendor
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Find leads</div>
                    <div className={`text-xs mt-1 font-medium ${formData.role === "vendor" ? "text-purple-600" : "text-slate-400"}`}>
                      $199/mo
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFormData(prev => ({ ...prev, role: "applicant" })); setVerificationStatus("idle"); setVerifiedName(""); }}
                    className={`p-3 rounded-xl border-2 text-center transition-all hover-lift ${
                      formData.role === "applicant"
                        ? "border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="text-2xl mb-1">🏫</div>
                    <div className={`font-semibold text-sm ${formData.role === "applicant" ? "text-emerald-700" : "text-slate-700"}`}>
                      Applicant
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Track funding</div>
                    <div className={`text-xs mt-1 font-medium ${formData.role === "applicant" ? "text-emerald-600" : "text-slate-400"}`}>
                      $200/mo
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="John"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {formData.role === "applicant" ? "Entity Name" : "Company Name"}
                  {verificationStatus === "verified" && verifiedName && (
                    <span className="ml-2 text-emerald-600 text-xs font-normal">✓ Verified from USAC</span>
                  )}
                </label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                    verificationStatus === "verified" ? "border-emerald-300 bg-emerald-50" : "border-slate-200"
                  }`}
                  placeholder={
                    formData.role === "consultant" ? "E-Rate Consulting Inc." : 
                    formData.role === "vendor" ? "Network Solutions LLC" :
                    "Lincoln Elementary School"
                  }
                  required
                />
              </div>

              {/* CRN Field for Consultants */}
              {formData.role === "consultant" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    CRN (Consultant Registration Number) <span className="text-red-500">*</span>
                    {verificationStatus === "verified" && (
                      <span className="ml-2 text-emerald-600 text-xs font-normal">✓ Verified</span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="crn"
                      value={formData.crn}
                      onChange={handleChange}
                      onBlur={verifyEntity}
                      className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all uppercase ${
                        verificationStatus === "verified" ? "border-emerald-400 bg-emerald-50 pr-10" :
                        verificationStatus === "error" ? "border-red-400 bg-red-50" :
                        "border-slate-200"
                      }`}
                      placeholder="Enter your USAC CRN"
                      required
                    />
                    {verificationStatus === "verifying" && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="animate-spin h-5 w-5 text-indigo-500" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    )}
                    {verificationStatus === "verified" && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-lg">✓</div>
                    )}
                  </div>
                  {verificationStatus === "error" && verificationError && (
                    <p className="mt-1 text-xs text-red-600">{verificationError}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    Your USAC CRN will be verified before registration.
                    <a href="https://www.usac.org/e-rate/resources/e-rate-productivity-center/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 ml-1">
                      Learn more →
                    </a>
                  </p>
                </div>
              )}

              {/* SPIN Field for Vendors */}
              {formData.role === "vendor" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    SPIN (Service Provider ID Number) <span className="text-red-500">*</span>
                    {verificationStatus === "verified" && (
                      <span className="ml-2 text-emerald-600 text-xs font-normal">✓ Verified</span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="spin"
                      value={formData.spin}
                      onChange={handleChange}
                      onBlur={verifyEntity}
                      className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all uppercase ${
                        verificationStatus === "verified" ? "border-emerald-400 bg-emerald-50 pr-10" :
                        verificationStatus === "error" ? "border-red-400 bg-red-50" :
                        "border-slate-200"
                      }`}
                      placeholder="Enter your USAC SPIN"
                      required
                    />
                    {verificationStatus === "verifying" && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="animate-spin h-5 w-5 text-purple-500" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    )}
                    {verificationStatus === "verified" && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-lg">✓</div>
                    )}
                  </div>
                  {verificationStatus === "error" && verificationError && (
                    <p className="mt-1 text-xs text-red-600">{verificationError}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    Your USAC SPIN will be verified before registration.
                    <a href="https://opendata.usac.org/stories/s/twgi-emss" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 ml-1">
                      Look up SPIN →
                    </a>
                  </p>
                </div>
              )}

              {/* BEN Field for Applicants */}
              {formData.role === "applicant" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    BEN (Billed Entity Number) <span className="text-red-500">*</span>
                    {verificationStatus === "verified" && (
                      <span className="ml-2 text-emerald-600 text-xs font-normal">✓ Verified</span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="ben"
                      value={formData.ben}
                      onChange={handleChange}
                      onBlur={verifyEntity}
                      className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                        verificationStatus === "verified" ? "border-emerald-400 bg-emerald-50 pr-10" :
                        verificationStatus === "error" ? "border-red-400 bg-red-50" :
                        "border-slate-200"
                      }`}
                      placeholder="Enter your USAC BEN"
                      required
                    />
                    {verificationStatus === "verifying" && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="animate-spin h-5 w-5 text-emerald-500" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    )}
                    {verificationStatus === "verified" && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-lg">✓</div>
                    )}
                  </div>
                  {verificationStatus === "error" && verificationError && (
                    <p className="mt-1 text-xs text-red-600">{verificationError}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    Your USAC BEN will be verified before registration.
                    <a href="https://opendata.usac.org/E-rate/E-Rate-Entity-Search-Tool/59r2-zbdq" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 ml-1">
                      Look up your BEN →
                    </a>
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${promoData ? 'bg-slate-100 cursor-not-allowed' : ''}`}
                  placeholder="you@company.com"
                  required
                  readOnly={!!promoData}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Confirm</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="terms"
                  className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  required
                />
                <label htmlFor="terms" className="text-sm text-slate-600">
                  I agree to the{" "}
                  <Link href="/terms" className="text-indigo-600 hover:text-indigo-700 font-medium">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-indigo-600 hover:text-indigo-700 font-medium">
                    Privacy Policy
                  </Link>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isLoading || verificationStatus !== "verified"}
                className="w-full py-3.5 shimmer-btn bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-500/25"
              >
                {isSubmitting || isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Creating account...
                  </span>
                ) : verificationStatus !== "verified" ? (
                  "Verify Your ID to Continue"
                ) : promoData ? (
                  "Accept Invite & Create Account →"
                ) : (
                  "Start Free Trial →"
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-200 text-center">
              <p className="text-slate-600">
                Already have an account?{" "}
                <Link href="/sign-in" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          {/* Credit card notice */}
          <p className="mt-6 text-center text-sm text-slate-500">
            💳 Credit card required • 14-day free trial • Cancel anytime • No commitment
          </p>
        </div>
      </div>
    </div>
  );
}
