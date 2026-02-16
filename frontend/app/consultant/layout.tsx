import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Consultant Dashboard | SkyRate AI",
  description: "Manage your E-Rate consulting portfolio with AI-powered tools.",
  robots: { index: false, follow: false },
};

export default function ConsultantLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
