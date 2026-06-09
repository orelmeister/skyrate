import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify Email | SkyRate AI",
  description: "Confirm your email address to activate your SkyRate AI account.",
  robots: { index: false, follow: false },
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
