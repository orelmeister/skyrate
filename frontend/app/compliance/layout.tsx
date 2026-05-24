import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Compliance \u2014 USAC Document Review | SkyRate AI",
  description: "AI-powered USAC compliance review for Forms 470, 471, 472, 474, 486, 500, 498 and more. Identify risks before submission.",
  robots: { index: false, follow: false },
};

export default function ComplianceLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}>{children}</Suspense>;
}
