import type { Metadata } from "next";
import Script from "next/script";

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
  return (
    <>
      {/* Google Preferred Sources library */}
      <Script
        src="https://news.google.com/swg/js/v1/publisher.js"
        strategy="afterInteractive"
      />
      {children}
      {/* "Add SkyRate as a preferred source" button (Google Search / AI Overviews) */}
      <div className="flex justify-center py-8">
        <div {...{ "google-add-preferred-source-btn": "", "data-theme": "light" }} />
      </div>
    </>
  );
}
