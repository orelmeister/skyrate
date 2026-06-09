import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password | SkyRate AI",
  description: "Create a new password for your SkyRate AI account.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
