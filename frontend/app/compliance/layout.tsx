import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance \u2014 USAC Document Review | SkyRate AI",
  description: "AI-powered USAC compliance review for Forms 470, 471, 472, 474, 486, 500, 498 and more. Identify risks before submission.",
  robots: { index: false, follow: false },
};

export default function ComplianceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
