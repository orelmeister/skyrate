import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance — Form 470 Pre-Review | SkyRate AI",
  description: "AI-powered Form 470 compliance pre-review. Identify USAC issue risks before submission.",
  robots: { index: false, follow: false },
};

export default function ComplianceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
