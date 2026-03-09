import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Super Dashboard | SkyRate AI",
  description: "Full access to both Consultant and Vendor portals.",
  robots: { index: false, follow: false },
};

export default function SuperLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
