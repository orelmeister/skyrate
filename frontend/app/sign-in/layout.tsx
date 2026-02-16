import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | SkyRate AI",
  description: "Sign in to your SkyRate AI account to access your E-Rate intelligence dashboard.",
  robots: { index: false, follow: false },
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
