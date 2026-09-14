import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book a Free SkyRate Demo — E-Rate Software for Consultants, Schools & Vendors | SkyRate AI",
  description:
    "Book a free 20-minute live SkyRate walkthrough on your real USAC data. See FRN, Form 470 & 471 tracking across your whole E-Rate portfolio. No commitment.",
  alternates: { canonical: "https://skyrate.ai/book-demo" },
  openGraph: {
    title: "Book a Free SkyRate Demo — E-Rate Software for Consultants, Schools & Vendors | SkyRate AI",
    description:
      "Book a free 20-minute live SkyRate walkthrough on your real USAC data. See FRN, Form 470 & 471 tracking across your whole E-Rate portfolio. No commitment.",
    url: "https://skyrate.ai/book-demo",
    siteName: "SkyRate AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Book a Free SkyRate Demo | SkyRate AI",
    description:
      "Book a free 20-minute live SkyRate walkthrough on your real USAC data. See FRN, Form 470 & 471 tracking across your whole E-Rate portfolio.",
  },
  robots: { index: true, follow: true },
};

export default function BookDemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
