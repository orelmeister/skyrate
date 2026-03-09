"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { useVerificationGuard } from "@/lib/use-verification-guard";

export default function SuperDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout, _hasHydrated } = useAuthStore();
  const { verified: emailVerified, checking: checkingVerification } = useVerificationGuard();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!_hasHydrated || checkingVerification) return;
    if (!isAuthenticated) {
      router.push("/sign-in");
      return;
    }
    if (!emailVerified) return;
    if (user?.role !== "super" && user?.role !== "admin") {
      // Redirect to appropriate dashboard
      const dashboard = user?.role === 'vendor' ? '/vendor' : 
                       user?.role === 'applicant' ? '/applicant' : '/consultant';
      router.push(dashboard);
      return;
    }
    setIsReady(true);
  }, [_hasHydrated, checkingVerification, isAuthenticated, emailVerified, user, router]);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="SkyRate AI" width={36} height={36} className="rounded-lg" />
            <div>
              <span className="font-bold text-slate-900 text-lg">SkyRate AI</span>
              <span className="block text-xs text-purple-600 font-semibold">Super Account</span>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user?.email}</span>
            <span className="px-2 py-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold rounded-full uppercase">
              Super
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-700 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Welcome Section */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900">
            Welcome, {user?.first_name || "Super User"} 👋
          </h1>
          <p className="text-slate-500 mt-2 text-lg">
            Full access to both Consultant and Vendor portals. Choose a portal below to get started.
          </p>
        </div>

        {/* Portal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Consultant Portal Card */}
          <Link
            href="/consultant"
            className="group bg-white rounded-2xl border border-slate-200 p-8 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-indigo-200">
                📊
              </div>
              <svg className="w-6 h-6 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
              Consultant Portal
            </h2>
            <p className="text-slate-500 mt-3 leading-relaxed">
              Manage your school portfolio, track funding data, monitor FRN statuses, generate appeals, and search for services across your managed BENs.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["My Schools", "Funding Data", "FRN Status", "Appeals", "Service Search"].map(tag => (
                <span key={tag} className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </Link>

          {/* Vendor Portal Card */}
          <Link
            href="/vendor"
            className="group bg-white rounded-2xl border border-slate-200 p-8 shadow-sm hover:shadow-xl hover:border-purple-300 transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-purple-200">
                🎯
              </div>
              <svg className="w-6 h-6 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
              Vendor Portal
            </h2>
            <p className="text-slate-500 mt-3 leading-relaxed">
              Find E-Rate leads, search schools by state, track Form 470/471 opportunities, manage serviced entities, and monitor competitive intelligence.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["School Search", "Form 470 Leads", "Predicted Leads", "471 Lookup", "Competitive Intel"].map(tag => (
                <span key={tag} className="px-3 py-1 bg-purple-50 text-purple-700 text-xs font-medium rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/consultant?tab=schools" className="flex flex-col items-center p-4 rounded-xl hover:bg-slate-50 transition group">
              <span className="text-2xl mb-2">🏫</span>
              <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">My Schools</span>
            </Link>
            <Link href="/consultant?tab=service-search" className="flex flex-col items-center p-4 rounded-xl hover:bg-slate-50 transition group">
              <span className="text-2xl mb-2">🔍</span>
              <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">Service Search</span>
            </Link>
            <Link href="/vendor?tab=470-leads" className="flex flex-col items-center p-4 rounded-xl hover:bg-slate-50 transition group">
              <span className="text-2xl mb-2">🎯</span>
              <span className="text-sm font-medium text-slate-700 group-hover:text-purple-600">Form 470 Leads</span>
            </Link>
            <Link href="/vendor?tab=search" className="flex flex-col items-center p-4 rounded-xl hover:bg-slate-50 transition group">
              <span className="text-2xl mb-2">🔎</span>
              <span className="text-sm font-medium text-slate-700 group-hover:text-purple-600">School Search</span>
            </Link>
            <Link href="/consultant?tab=frn-status" className="flex flex-col items-center p-4 rounded-xl hover:bg-slate-50 transition group">
              <span className="text-2xl mb-2">📈</span>
              <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">FRN Status</span>
            </Link>
            <Link href="/consultant?tab=appeals" className="flex flex-col items-center p-4 rounded-xl hover:bg-slate-50 transition group">
              <span className="text-2xl mb-2">📋</span>
              <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">Appeals</span>
            </Link>
            <Link href="/vendor?tab=predicted-leads" className="flex flex-col items-center p-4 rounded-xl hover:bg-slate-50 transition group">
              <span className="text-2xl mb-2">🔮</span>
              <span className="text-sm font-medium text-slate-700 group-hover:text-purple-600">Predicted Leads</span>
            </Link>
            <Link href="/vendor?tab=leads" className="flex flex-col items-center p-4 rounded-xl hover:bg-slate-50 transition group">
              <span className="text-2xl mb-2">💾</span>
              <span className="text-sm font-medium text-slate-700 group-hover:text-purple-600">Saved Leads</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
