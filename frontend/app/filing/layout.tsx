import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Filing Journey — Your E-Rate Game Plan",
  description:
    "A step-by-step E-Rate filing board: see exactly what's needed to file your Form 470, what's blocking it, and complete each task in a click.",
  robots: { index: false, follow: false },
};

export default function FilingLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
