import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "E-Rate Blog | SkyRate AI — Funding Intelligence & Tips",
  description:
    "Expert insights, guides, and news to help schools and libraries maximize E-Rate funding. AI-powered analysis, appeal strategies, and compliance tips.",
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
