"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

type PlanType = "monthly" | "yearly";

interface PricingPlan {
  type: PlanType;
  name: string;
  price: number;
  interval: string;
  description: string;
  savings?: string;
  features: string[];
}

const CONSULTANT_PLANS: PricingPlan[] = [
  {
    type: "monthly",
    name: "Monthly",
    price: 300,
    interval: "month",
    description: "Flexible monthly billing",
    features: [
      "Unlimited school tracking",
      "C2 funding analysis",
      "Denial analysis & appeals",
      "Natural language queries",
      "Email support",
    ],
  },
  {
    type: "yearly",
    name: "Annual",
    price: 3000,
    interval: "year",
    description: "Best value - Save $600/year",
    savings: "Save 17%",
    features: [
      "Everything in Monthly",
      "Priority support",
      "Advanced AI analysis",
      "Custom reports",
      "API access",
    ],
  },
];

const VENDOR_PLANS: PricingPlan[] = [
  {
    type: "monthly",
    name: "Monthly",
    price: 300,
    interval: "month",
    description: "Flexible monthly billing",
    features: [
      "Lead discovery",
      "School search",
      "Funding status tracking",
      "Basic analytics",
      "Email support",
    ],
  },
  {
    type: "yearly",
    name: "Annual",
    price: 3000,
    interval: "year",
    description: "Best value - Save $600/year",
    savings: "Save 17%",
    features: [
      "Everything in Monthly",
      "Priority support",
      "Advanced lead scoring",
      "Export capabilities",
      "API access",
    ],
  },
];

export default function SubscribePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("yearly");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponSuccess, setCouponSuccess] = useState("");
  const [isRedeemingCoupon, setIsRedeemingCoupon] = useState(false);

  const plans = user?.role === "vendor" ? VENDOR_PLANS : CONSULTANT_PLANS;
  const selectedPlanDetails = plans.find((p) => p.type === selectedPlan)!;

  // Check if user is authenticated and needs payment setup
  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!isAuthenticated) {
        router.push("/sign-in");
        return;
      }

      try {
        const response = await api.getPaymentStatus();
        if (response.success && response.data && !response.data.requires_payment_setup) {
          // User already has payment set up, redirect to dashboard
          if (user?.role === "vendor") {
            router.push("/vendor");
          } else {
            router.push("/consultant");
          }
        }
      } catch (err) {
        // If error checking status, continue showing subscription page
        console.error("Error checking payment status:", err);
      } finally {
        setCheckingStatus(false);
      }
    };

    if (!authLoading) {
      checkPaymentStatus();
    }
  }, [isAuthenticated, authLoading, user, router]);

  const handleSubscribe = async () => {
    setIsProcessing(true);
    setError("");

    try {
      const baseUrl = window.location.origin;
      const successUrl = user?.role === "vendor" 
        ? `${baseUrl}/vendor` 
        : `${baseUrl}/consultant`;
      const cancelUrl = `${baseUrl}/subscribe`;

      const response = await api.createCheckoutSession({
        plan: selectedPlan,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      // Redirect to Stripe Checkout
      if (response.success && response.data?.checkout_url) {
        window.location.href = response.data.checkout_url;
      } else {
        throw new Error(response.error || "No checkout URL received");
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      setError(
        err.message || 
        "Unable to start checkout. Please try again."
      );
      setIsProcessing(false);
    }
  };

  const handleRedeemCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError("Please enter a coupon code");
      return;
    }

    setIsRedeemingCoupon(true);
    setCouponError("");
    setCouponSuccess("");

    try {
      const response = await api.redeemCoupon(couponCode.trim());
      
      if (response.success && response.data?.success) {
        setCouponSuccess(response.data.message || "Coupon redeemed successfully!");
        // Redirect after a short delay
        setTimeout(() => {
          if (response.data?.redirect_url) {
            router.push(response.data.redirect_url);
          } else {
            router.push(user?.role === "vendor" ? "/vendor" : "/consultant");
          }
        }, 1500);
      } else {
        setCouponError(response.error || response.data?.message || "Invalid coupon code");
      }
    } catch (err: any) {
      console.error("Coupon redemption error:", err);
      setCouponError(err.message || "Failed to redeem coupon. Please try again.");
    } finally {
      setIsRedeemingCoupon(false);
    }
  };

  // Show loading while checking auth and payment status
  if (authLoading || checkingStatus) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <span className="text-xl font-bold text-white">S</span>
            </div>
            <span className="text-xl font-semibold text-white">SkyRate AI</span>
          </Link>
          <div className="text-sm text-white/60">
            Welcome, {user?.first_name || user?.email}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 rounded-full text-green-400 text-sm font-medium mb-6">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              14-Day Free Trial
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Start Your Free Trial
            </h1>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              Get full access to SkyRate AI for 14 days. Your card will only be charged after the trial ends.
            </p>
          </div>

          {/* Plan Selector */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-white/10 rounded-xl p-1">
              {plans.map((plan) => (
                <button
                  key={plan.type}
                  onClick={() => setSelectedPlan(plan.type)}
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${
                    selectedPlan === plan.type
                      ? "bg-white text-slate-900 shadow-lg"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  {plan.name}
                  {plan.savings && (
                    <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                      {plan.savings}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing Card */}
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              {/* Price Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-8 text-white text-center">
                <p className="text-indigo-200 mb-2">{selectedPlanDetails.description}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-2xl">$</span>
                  <span className="text-6xl font-bold">{selectedPlanDetails.price}</span>
                  <span className="text-xl text-indigo-200">/{selectedPlanDetails.interval}</span>
                </div>
                <p className="mt-4 text-indigo-200">
                  {user?.role === "consultant" ? "Consultant" : "Vendor"} Plan
                </p>
              </div>

              {/* Trial Banner */}
              <div className="bg-green-50 border-b border-green-100 px-8 py-4">
                <div className="flex items-center justify-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-xl">🎉</span>
                  </div>
                  <div>
                    <p className="font-semibold text-green-800">14-Day Free Trial</p>
                    <p className="text-sm text-green-600">No charge until trial ends</p>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="px-8 py-6">
                <ul className="space-y-4">
                  {selectedPlanDetails.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="text-slate-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mx-8 mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {/* CTA Button */}
              <div className="px-8 pb-8">
                <button
                  onClick={handleSubscribe}
                  disabled={isProcessing}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Redirecting to checkout...
                    </span>
                  ) : (
                    <>Start 14-Day Free Trial →</>
                  )}
                </button>

                <p className="text-center text-sm text-slate-500 mt-4">
                  🔒 Secure checkout powered by Stripe • Pay with card or bank account (ACH)
                </p>

                {/* Coupon Code Section */}
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <p className="text-center text-sm text-slate-600 mb-3">Have a coupon code?</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        setCouponError("");
                        setCouponSuccess("");
                      }}
                      placeholder="Enter code"
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent uppercase"
                      disabled={isRedeemingCoupon}
                    />
                    <button
                      onClick={handleRedeemCoupon}
                      disabled={isRedeemingCoupon || !couponCode.trim()}
                      className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      {isRedeemingCoupon ? (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        "Apply"
                      )}
                    </button>
                  </div>
                  {couponError && (
                    <p className="mt-2 text-sm text-red-600">{couponError}</p>
                  )}
                  {couponSuccess && (
                    <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {couponSuccess}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Trust Indicators */}
            <div className="mt-8 text-center">
              <p className="text-white/60 text-sm mb-4">Trusted by E-Rate professionals nationwide</p>
              <div className="flex items-center justify-center gap-6 text-white/40 text-sm">
                <span>✓ Cancel anytime</span>
                <span>✓ SOC 2 Compliant</span>
                <span>✓ FERPA Ready</span>
              </div>
            </div>

            {/* FAQ Link */}
            <div className="mt-8 text-center">
              <p className="text-white/60 text-sm">
                Questions?{" "}
                <a href="mailto:support@skyrate.ai" className="text-indigo-400 hover:text-indigo-300 underline">
                  Contact our team
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
