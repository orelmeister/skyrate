"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";

export default function SignInPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading, error, clearError, user } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isAuthenticated && user) {
      const dashboard = user.role === 'vendor' ? '/vendor' : 
                       user.role === 'admin' ? '/admin' :
                       user.role === 'applicant' ? '/applicant' : '/consultant';
      router.push(dashboard);
    }
  }, [isAuthenticated, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    const success = await login(email, password);
    if (success) {
      const currentUser = useAuthStore.getState().user;
      const dashboard = currentUser?.role === 'vendor' ? '/vendor' : 
                       currentUser?.role === 'admin' ? '/admin' :
                       currentUser?.role === 'applicant' ? '/applicant' : '/consultant';
      router.push(dashboard);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 p-12 flex-col justify-between relative overflow-hidden">
        {/* Mesh Gradient Background */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl floating"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-400/15 rounded-full blur-3xl floating" style={{ animationDelay: '-3s' }}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-400/10 rounded-full blur-3xl floating" style={{ animationDelay: '-5s' }}></div>
        </div>
        
        {/* Logo */}
        <div className="relative z-10 animate-slide-up">
          <Link href="/" className="flex items-center">
            <img src="/images/logos/logo-white.svg" alt="SkyRate AI" width={180} height={46} className="object-contain" />
          </Link>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 space-y-6 animate-slide-up-delay-1">
          <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
            E-Rate Intelligence<br />
            <span className="text-purple-200">Made Simple</span>
          </h1>
          <p className="text-lg text-purple-100 max-w-md">
            Leverage AI to maximize your E-Rate funding. Track applications, analyze denials, and discover opportunities.
          </p>
          
          {/* Feature Pills */}
          <div className="flex flex-wrap gap-3 pt-4">
            <span className="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm text-white border border-white/20 hover:bg-white/20 transition-all">
              ✨ AI-Powered Analysis
            </span>
            <span className="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm text-white border border-white/20 hover:bg-white/20 transition-all">
              📊 Real-time Data
            </span>
            <span className="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm text-white border border-white/20 hover:bg-white/20 transition-all">
              🎯 Smart Insights
            </span>
          </div>
        </div>

        {/* Testimonial */}
        <div className="relative z-10 glassmorphism-card rounded-2xl p-6 animate-slide-up-delay-2">
          <p className="text-purple-100 italic mb-4">
            &quot;SkyRate AI helped us recover over $2M in denied funding. The appeal analysis is game-changing.&quot;
          </p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-300 to-indigo-300 flex items-center justify-center text-purple-700 font-semibold shadow-md">
              JM
            </div>
            <div>
              <div className="text-white font-medium">Jennifer Martinez</div>
              <div className="text-purple-200 text-sm">E-Rate Consultant, California</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md animate-slide-up">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <Link href="/" className="inline-flex items-center justify-center">
              <img src="/images/logos/logo-dark.svg" alt="SkyRate AI" width={180} height={46} className="object-contain" />
            </Link>
          </div>

          {/* Form Card */}
          <div className="light-card rounded-2xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold gradient-text-dark">Welcome back</h1>
              <p className="text-slate-500 mt-2">Sign in to your account to continue</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <span className="text-red-500 text-lg">⚠️</span>
                <div>
                  <div className="font-medium text-red-700">Sign in failed</div>
                  <div className="text-sm text-red-600">{error}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="you@company.com"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember"
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="remember" className="text-sm text-slate-600">
                  Remember me for 30 days
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 shimmer-btn bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-500/25"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-200 text-center">
              <p className="text-slate-600">
                Don&apos;t have an account?{" "}
                <Link href="/sign-up" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                  Create account
                </Link>
              </p>
            </div>
          </div>

          {/* Demo Accounts */}
          <div className="mt-6 light-card rounded-xl p-4 border-l-4 border-l-amber-400">
            <p className="text-sm font-medium text-amber-900 mb-2 text-center">Demo Accounts</p>
            <div className="space-y-1 text-sm text-amber-800">
              <p><span className="font-medium">Consultant:</span> test_consultant@example.com / TestPass123!</p>
              <p><span className="font-medium">Vendor:</span> test_vendor@example.com / TestPass123!</p>
              <p><span className="font-medium">Applicant:</span> test_applicant@example.com / TestPass123!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
