"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Safe redirect target check. Accepts only same-origin relative paths
 * (must start with a single "/" and not "//" which would be protocol-
 * relative). This prevents open-redirect abuse via ?redirect=https://evil.
 */
function safeRedirect(target: string | null): string | null {
  if (!target) return null;
  if (!target.startsWith("/")) return null;
  if (target.startsWith("//")) return null;
  return target;
}

declare global {
  interface Window {
    google?: any;
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const REMEMBER_ME_KEY = "sr_remember_me";

function readRememberFlag(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(REMEMBER_ME_KEY);
  // Default ON. Only off when explicitly set to "0".
  return v !== "0";
}

export default function SignInPage() {
  // useSearchParams() requires a Suspense boundary for Next.js 14 static
  // prerendering. Without this wrapper, `next build` fails with
  // "useSearchParams() should be wrapped in a suspense boundary at /sign-in".
  return (
    <Suspense fallback={null}>
      <SignInClient />
    </Suspense>
  );
}

function SignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = safeRedirect(searchParams.get("redirect"));
  const { login, isAuthenticated, isLoading, error, clearError, user } = useAuthStore();
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Read Remember-me preference on mount
  useEffect(() => {
    setRemember(readRememberFlag());
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    if (typeof window === "undefined") return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) {
            setGoogleError("Google sign-in was canceled or failed.");
            return;
          }
          setGoogleError(null);
          clearError();
          setGoogleLoading(true);
          const ok = await loginWithGoogle(response.credential);
          setGoogleLoading(false);
          if (!ok) {
            const storeErr = (useAuthStore.getState().error || "").toLowerCase();
            if (
              storeErr.includes("not found") ||
              storeErr.includes("required") ||
              storeErr.includes("crn") ||
              storeErr.includes("spin") ||
              storeErr.includes("ben")
            ) {
              setGoogleError("No SkyRate account is linked to that Google login. Please sign up first.");
            } else {
              setGoogleError(useAuthStore.getState().error || "Google sign-in failed. Please try again.");
            }
          }
        },
        ux_mode: "popup",
        auto_select: false,
      });
      googleBtnRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 360,
      });
    };

    const existing = document.getElementById("google-gsi-script") as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.id) initGoogle();
      else existing.addEventListener("load", initGoogle, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "google-gsi-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.head.appendChild(script);
  }, [loginWithGoogle, clearError]);

  useEffect(() => {
    // Silent auto-login: when the user lands on /sign-in with a persisted
    // refresh token AND Remember-me enabled, attempt to refresh the access
    // token in the background. On success, route straight to the dashboard.
    // On failure (token revoked, expired, secret rotated), leave the form
    // visible so the user can sign in normally.
    if (!_hasHydrated) return;

    const persistedRemember = readRememberFlag();
    const hasRefreshToken =
      typeof window !== "undefined" &&
      (() => {
        try {
          const raw = window.localStorage.getItem("skyrate-auth");
          if (!raw) return false;
          const parsed = JSON.parse(raw);
          return Boolean(parsed?.state?.refreshToken);
        } catch {
          return false;
        }
      })();

    const finishCheck = () => { /* form remains visible */ };

    if (isAuthenticated && user) {
      const dashboard = user.role === 'vendor' ? '/vendor' :
                       user.role === 'admin' ? '/admin' :
                       user.role === 'super' ? '/super' :
                       user.role === 'applicant' ? '/applicant' : '/consultant';
      router.push(redirectParam || dashboard);
      return;
    }

    if (!persistedRemember || !hasRefreshToken) {
      finishCheck();
      return;
    }

    let cancelled = false;
    (async () => {
      const ok = await refreshAccessToken();
      if (cancelled) return;
      if (ok) {
        const u = useAuthStore.getState().user;
        const dashboard = u?.role === 'vendor' ? '/vendor' :
                         u?.role === 'admin' ? '/admin' :
                         u?.role === 'super' ? '/super' :
                         u?.role === 'applicant' ? '/applicant' : '/consultant';
        router.push(redirectParam || dashboard);
        return;
      }
      finishCheck();
    })();

    return () => { cancelled = true; };
  }, [_hasHydrated, isAuthenticated, user, router, refreshAccessToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    // Persist the Remember-me preference so the auto-login effect respects
    // the user's choice on the next visit.
    try {
      window.localStorage.setItem(REMEMBER_ME_KEY, remember ? "1" : "0");
    } catch { /* ignore */ }

    const success = await login(email, password);
    if (success) {
      const currentUser = useAuthStore.getState().user;
      const dashboard = currentUser?.role === 'vendor' ? '/vendor' : 
                       currentUser?.role === 'admin' ? '/admin' :
                       currentUser?.role === 'super' ? '/super' :
                       currentUser?.role === 'applicant' ? '/applicant' : '/consultant';
      router.push(redirectParam || dashboard);
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
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={40} height={40} className="rounded-xl" />
            <span className="text-white font-bold text-2xl">SkyRate<span className="text-purple-300">.AI</span></span>
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
              AB
            </div>
            <div>
              <div className="text-white font-medium">Ari Bernstein</div>
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
            <Link href="/" className="inline-flex items-center justify-center gap-3">
              <img src="/images/logos/logo-icon-transparent.png" alt="" width={40} height={40} className="rounded-xl" />
              <span className="text-slate-900 font-bold text-2xl">SkyRate<span className="text-purple-600">.AI</span></span>
            </Link>
          </div>

          {/* Form Card */}
          <div className="light-card rounded-2xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold gradient-text-dark">Welcome back</h1>
              <p className="text-slate-500 mt-2">Sign in to your account to continue</p>
            </div>

            {(error || googleError) && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <span className="text-red-500 text-lg">⚠️</span>
                <div>
                  <div className="font-medium text-red-700">Sign in failed</div>
                  <div className="text-sm text-red-600">
                    {googleError || error}
                    {googleError && googleError.toLowerCase().includes("sign up") && (
                      <>
                        {" "}
                        <Link href="/sign-up" className="underline font-semibold text-red-700 hover:text-red-800">
                          Create an account
                        </Link>
                        .
                      </>
                    )}
                  </div>
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
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
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

            {GOOGLE_CLIENT_ID && (
              <div className="mt-6">
                <div className="relative flex items-center">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink mx-4 text-xs uppercase tracking-wider text-slate-500">
                    Or continue with
                  </span>
                  <div className="flex-grow border-t border-slate-200"></div>
                </div>
                <div className="mt-4 flex justify-center min-h-[44px]">
                  {googleLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing in with Google...
                    </div>
                  ) : (
                    <div id="google-signin-btn" ref={googleBtnRef}></div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-slate-200 text-center">
              <p className="text-slate-600">
                Don&apos;t have an account?{" "}
                <Link href="/sign-up" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                  Create account
                </Link>
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
