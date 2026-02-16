import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Welcome | SkyRate AI",
  description: "Set up your SkyRate AI account and configure E-Rate monitoring.",
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
