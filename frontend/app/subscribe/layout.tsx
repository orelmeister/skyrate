import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscribe | SkyRate AI",
  description: "Choose your SkyRate AI plan. E-Rate management software for consultants, vendors, and school applicants.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/subscribe" },
};

export default function SubscribeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
