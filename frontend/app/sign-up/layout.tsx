import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start Free Trial | SkyRate AI",
  description: "Sign up for SkyRate AI and start your 14-day free trial. AI-powered E-Rate management for consultants, vendors, and applicants.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/sign-up" },
};

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
