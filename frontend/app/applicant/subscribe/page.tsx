"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Applicant Subscription Page
 * 
 * Quick payment flow - "Sign up → Enter BEN → Pay → BOOM"
 * This is the payment step before they see their dashboard.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export default function ApplicantSubscribePage() {
  const router = useRouter();
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<{
    ben: string;
    organization_name: string;
    sync_status: string;
  } | null>(null);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/applicant/sign-up');
      return;
    }

    // Fetch profile to show sync status
    fetchProfile(token);
  }, []);

  const fetchProfile = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/applicant/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setProfile({
          ben: data.profile.ben,
          organization_name: data.profile.organization_name || 'Your Organization',
          sync_status: data.profile.sync_status,
        });
      }
    } catch (e) {
      console.error('Profile fetch error:', e);
    }
  };

  const handleSubscribe = async () => {
    setIsLoading(true);
    
    // TODO: Integrate with Stripe checkout
    // For now, redirect to dashboard (trial mode)
    
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    router.push('/applicant');
  };

  const pricing = {
    monthly: { price: 200, label: '/month' },
    yearly: { price: 2000, label: '/year', savings: 400 },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="p-8 text-center border-b border-slate-100">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <img src="/images/logos/logo-icon-transparent.png" alt="SkyRate AI" width={40} height={40} className="rounded-lg" />
            <span className="text-xl font-bold text-slate-900">SkyRate AI</span>
          </Link>
          
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Almost There! 🚀
          </h1>
          <p className="text-slate-600">
            Start your 14-day free trial - no credit card required
          </p>
          
          {/* Sync Status */}
          {profile && (
            <div className="mt-4 p-3 bg-emerald-50 rounded-lg text-left">
              <div className="flex items-center gap-3">
                {profile.sync_status === 'syncing' ? (
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                ) : profile.sync_status === 'completed' ? (
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">✓</div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">⏳</div>
                )}
                <div>
                  <div className="text-sm font-medium text-slate-900">{profile.organization_name}</div>
                  <div className="text-xs text-emerald-600">
                    {profile.sync_status === 'syncing' ? 'Fetching your E-Rate data...' :
                     profile.sync_status === 'completed' ? 'Your data is ready!' :
                     'Preparing your dashboard...'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Plan Selection */}
        <div className="p-8">
          <div className="flex gap-3 mb-8">
            <button
              onClick={() => setPlan('monthly')}
              className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                plan === 'monthly'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-2xl font-bold text-slate-900">${pricing.monthly.price}</div>
              <div className="text-sm text-slate-500">per month</div>
            </button>
            <button
              onClick={() => setPlan('yearly')}
              className={`flex-1 p-4 rounded-xl border-2 transition-all relative ${
                plan === 'yearly'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-emerald-500 text-white text-xs font-medium rounded">
                Save ${pricing.yearly.savings}
              </div>
              <div className="text-2xl font-bold text-slate-900">${pricing.yearly.price}</div>
              <div className="text-sm text-slate-500">per year</div>
            </button>
          </div>

          {/* Features */}
          <div className="mb-8">
            <div className="text-sm font-medium text-slate-700 mb-3">What's included:</div>
            <div className="space-y-2">
              {[
                'Automatic tracking of all your FRNs',
                'Real-time status change alerts',
                'AI-generated appeal letters for denials',
                'Deadline tracking & reminders',
                'Unlimited appeal refinements',
                'Email & dashboard notifications',
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="text-emerald-500">✓</span>
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={handleSubscribe}
            disabled={isLoading}
            className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </span>
            ) : (
              'Start 14-Day Free Trial'
            )}
          </button>

          <p className="text-xs text-slate-500 text-center mt-4">
            Pay with credit card or bank account (ACH). Cancel anytime during trial.
          </p>
        </div>

        {/* Skip for now */}
        <div className="px-8 pb-8">
          <button
            onClick={() => router.push('/applicant')}
            className="w-full py-3 text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors"
          >
            Continue with Free Trial →
          </button>
        </div>
      </div>
    </div>
  );
}
