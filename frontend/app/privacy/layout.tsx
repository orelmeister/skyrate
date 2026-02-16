import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | SkyRate AI",
  description: "SkyRate AI Privacy Policy. Learn how we collect, use, and protect your data on our E-Rate intelligence platform.",
  robots: { index: true, follow: false },
  alternates: { canonical: "https://skyrate.ai/privacy" },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
