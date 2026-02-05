"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Applicant Sign Up Page
 * 
 * "Sign up → Enter BEN → Pay → BOOM - Everything's ready!"
 * 
 * This is the minimal-friction signup designed for E-Rate applicants.
 * Just email, password, and BEN - that's all we need!
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export default function ApplicantSignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: Email/Password, 2: BEN Entry
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    ben: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidatingBen, setIsValidatingBen] = useState(false);
  const [benInfo, setBenInfo] = useState<{
    organization_name?: string;
    state?: string;
    city?: string;
  } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Clear BEN info when BEN changes
    if (name === "ben") {
      setBenInfo(null);
    }
  };

  // Validate BEN and show organization info
  const validateBen = async (ben: string) => {
    if (!ben || ben.length < 5) {
      setBenInfo(null);
      return;
    }

    setIsValidatingBen(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/query/ben/${ben.trim()}`);
      if (response.ok) {
        const data = await response.json();
        if (data.organization_name) {
          setBenInfo({
            organization_name: data.organization_name,
            state: data.state,
            city: data.city,
          });
        } else {
          setBenInfo(null);
        }
      }
    } catch (e) {
      console.error("BEN validation error:", e);
    }
    setIsValidatingBen(false);
  };

  // Debounced BEN validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.ben && formData.ben.length >= 5) {
        validateBen(formData.ben);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.ben]);

  const handleNextStep = () => {
    setError("");
    
    if (step === 1) {
      // Validate email
      if (!formData.email.includes("@")) {
        setError("Please enter a valid email address");
        return;
      }
      
      // Validate password
      if (formData.password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      
      if (!/[A-Z]/.test(formData.password)) {
        setError("Password must contain at least one uppercase letter");
        return;
      }
      
      if (!/[a-z]/.test(formData.password)) {
        setError("Password must contain at least one lowercase letter");
        return;
      }
      
      if (!/\d/.test(formData.password)) {
        setError("Password must contain at least one number");
        return;
      }
      
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(formData.password)) {
        setError("Password must contain at least one special character");
        return;
      }
      
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    if (!formData.ben.trim()) {
      setError("Please enter your BEN (Billed Entity Number)");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/applicant/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email.toLowerCase(),
          password: formData.password,
          ben: formData.ben.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store tokens
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        localStorage.setItem("user", JSON.stringify(data.user));

        // Redirect to payment page (or dashboard if already paid)
        if (data.needs_payment) {
          router.push("/applicant/subscribe");
        } else {
          router.push("/applicant");
        }
      } else {
        setError(data.detail || "Failed to create account. Please try again.");
      }
    } catch (e) {
      console.error("Registration error:", e);
      setError("Network error. Please check your connection and try again.");
    }
    
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Value Proposition */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-96 h-96 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-80 h-80 bg-cyan-300 rounded-full blur-3xl"></div>
        </div>
        
        {/* Logo */}
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <span className="text-2xl font-bold text-white">S</span>
            </div>
            <span className="text-2xl font-bold text-white">SkyRate AI</span>
          </Link>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 space-y-8">
          <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
            Your E-Rate<br />
            <span className="text-emerald-200">On Autopilot</span>
          </h1>
          
          <div className="space-y-4">
            <p className="text-xl text-emerald-100">
              Enter your BEN and we handle everything:
            </p>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-white">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  ✓
                </div>
                <span>Auto-track all your applications & FRNs</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  ✓
                </div>
                <span>Instant alerts on status changes</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  ✓
                </div>
                <span>AI-generated appeals for denials</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  ✓
                </div>
                <span>Deadline tracking & reminders</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <div className="text-emerald-200 text-sm mb-2">STARTING AT</div>
            <div className="text-4xl font-bold text-white">$99<span className="text-lg font-normal text-emerald-200">/month</span></div>
            <div className="text-emerald-200 text-sm mt-2">14-day free trial • Cancel anytime</div>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 text-white/70 text-sm">
            <span className="flex items-center gap-1">🔒 SSL Secured</span>
            <span className="flex items-center gap-1">✓ SOC 2 Compliant</span>
            <span className="flex items-center gap-1">🛡️ FERPA Ready</span>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg">
                <span className="text-2xl font-bold text-white">S</span>
              </div>
              <span className="text-2xl font-bold text-slate-900">SkyRate AI</span>
            </Link>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-all ${
              step >= 1 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
            }`}>
              1
            </div>
            <div className={`w-12 h-1 rounded transition-all ${step >= 2 ? "bg-emerald-600" : "bg-slate-200"}`}></div>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-all ${
              step >= 2 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
            }`}>
              2
            </div>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">
              {step === 1 ? "Create Your Account" : "Enter Your BEN"}
            </h2>
            <p className="text-slate-600 mt-2">
              {step === 1 
                ? "Start with your email and password" 
                : "Your Billed Entity Number connects us to your E-Rate data"}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={step === 1 ? (e) => { e.preventDefault(); handleNextStep(); } : handleSubmit} className="space-y-5">
            {step === 1 && (
              <>
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    placeholder="you@school.edu"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    placeholder="Create a strong password"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    At least 8 characters with uppercase, lowercase, number, and special character
                  </p>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    placeholder="Confirm your password"
                  />
                </div>

                {/* Next Button */}
                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl"
                >
                  Continue →
                </button>
              </>
            )}

            {step === 2 && (
              <>
                {/* BEN Input */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    BEN (Billed Entity Number)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="ben"
                      value={formData.ben}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                      placeholder="Enter your BEN"
                    />
                    {isValidatingBen && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Your BEN is on your E-Rate documentation (e.g., Form 470, 471)
                  </p>
                </div>

                {/* BEN Info Preview */}
                {benInfo && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-lg">
                        ✓
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{benInfo.organization_name}</div>
                        <div className="text-sm text-slate-600">
                          {benInfo.city}, {benInfo.state}
                        </div>
                        <div className="text-xs text-emerald-600 mt-1">
                          We found your organization!
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* What Happens Next */}
                <div className="bg-slate-100 rounded-xl p-4">
                  <div className="text-sm font-medium text-slate-700 mb-2">What happens next:</div>
                  <ol className="text-sm text-slate-600 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="bg-emerald-100 text-emerald-700 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold">1</span>
                      We'll fetch all your E-Rate data automatically
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-emerald-100 text-emerald-700 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold">2</span>
                      You'll see your complete dashboard instantly
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-emerald-100 text-emerald-700 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold">3</span>
                      AI-generated appeals ready for any denials
                    </li>
                  </ol>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 py-3 px-4 border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition-all"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !formData.ben}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Creating...
                      </span>
                    ) : (
                      "Start Free Trial →"
                    )}
                  </button>
                </div>
              </>
            )}
          </form>

          {/* Sign In Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              Already have an account?{" "}
              <Link href="/sign-in" className="text-emerald-600 hover:text-emerald-700 font-semibold">
                Sign In
              </Link>
            </p>
          </div>

          {/* Other Portals */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center mb-3">
              Looking for a different portal?
            </p>
            <div className="flex gap-3 justify-center">
              <Link 
                href="/sign-up" 
                className="text-xs text-slate-600 hover:text-purple-600 font-medium transition-colors"
              >
                Consultant Portal
              </Link>
              <span className="text-slate-300">|</span>
              <Link 
                href="/sign-up" 
                className="text-xs text-slate-600 hover:text-blue-600 font-medium transition-colors"
              >
                Vendor Portal
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
