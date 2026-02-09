"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";

type UserRole = "consultant" | "vendor";

export default function SignUpPage() {
  const router = useRouter();
  const { register, isLoading, error: authError } = useAuthStore();
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
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

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

    const success = await register({
      email: formData.email,
      password: formData.password,
      first_name: formData.firstName || undefined,
      last_name: formData.lastName || undefined,
      company_name: formData.company || undefined,
      role: formData.role,
      crn: formData.role === "consultant" ? formData.crn.trim() : undefined,
      spin: formData.role === "vendor" ? formData.spin.trim() : undefined,
    });

    if (success) {
      // Redirect to subscribe page for subscription setup
      // User must complete payment setup before accessing the dashboard
      router.push("/subscribe");
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
            Start Your<br />
            <span className="text-blue-200">14-Day Free Trial</span>
          </h1>
          <p className="text-lg text-purple-100 max-w-md">
            Join thousands of E-Rate professionals who trust SkyRate AI to manage their funding applications.
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
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold gradient-text-dark">Create your account</h1>
              <p className="text-slate-500 mt-2">Start your free 14-day trial today</p>
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
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, role: "consultant" }))}
                    className={`p-4 rounded-xl border-2 text-center transition-all hover-lift ${
                      formData.role === "consultant"
                        ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="text-3xl mb-2">📋</div>
                    <div className={`font-semibold ${formData.role === "consultant" ? "text-indigo-700" : "text-slate-700"}`}>
                      Consultant
                    </div>
                    <div className="text-sm text-slate-500 mt-1">Manage schools & filings</div>
                    <div className={`text-xs mt-2 font-medium ${formData.role === "consultant" ? "text-indigo-600" : "text-slate-400"}`}>
                      $300/mo or $3,000/yr
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, role: "vendor" }))}
                    className={`p-4 rounded-xl border-2 text-center transition-all hover-lift ${
                      formData.role === "vendor"
                        ? "border-purple-500 bg-purple-50 shadow-md shadow-purple-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="text-3xl mb-2">🏢</div>
                    <div className={`font-semibold ${formData.role === "vendor" ? "text-purple-700" : "text-slate-700"}`}>
                      Vendor
                    </div>
                    <div className="text-sm text-slate-500 mt-1">Find school leads</div>
                    <div className={`text-xs mt-2 font-medium ${formData.role === "vendor" ? "text-purple-600" : "text-slate-400"}`}>
                      $199/mo or $1,999/yr
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder={formData.role === "consultant" ? "E-Rate Consulting Inc." : "Network Solutions LLC"}
                  required
                />
              </div>

              {/* CRN Field for Consultants */}
              {formData.role === "consultant" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    CRN (Consultant Registration Number) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="crn"
                    value={formData.crn}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all uppercase"
                    placeholder="Enter your USAC CRN"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Your unique USAC Consultant Registration Number. 
                    <a href="https://www.usac.org/e-rate/applicants/consultants/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 ml-1">
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
                  </label>
                  <input
                    type="text"
                    name="spin"
                    value={formData.spin}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all uppercase"
                    placeholder="Enter your USAC SPIN"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Your unique USAC Service Provider Identification Number.
                    <a href="https://www.usac.org/e-rate/service-providers/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 ml-1">
                      Learn more →
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
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="you@company.com"
                  required
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
                disabled={isSubmitting || isLoading}
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

          {/* No credit card notice */}
          <p className="mt-6 text-center text-sm text-slate-500">
            💳 No credit card required • Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
