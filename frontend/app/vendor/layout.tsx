import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vendor Dashboard | SkyRate AI",
  description: "Find E-Rate Form 470 opportunities and track vendor intelligence.",
  robots: { index: false, follow: false },
};

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
