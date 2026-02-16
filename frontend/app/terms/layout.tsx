import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | SkyRate AI",
  description: "SkyRate AI Terms of Service. Read our terms and conditions for using the E-Rate intelligence platform.",
  robots: { index: true, follow: false },
  alternates: { canonical: "https://skyrate.ai/terms" },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
