import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | SkyRate AI",
  description: "SkyRate AI Dashboard — AI-powered E-Rate intelligence.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
