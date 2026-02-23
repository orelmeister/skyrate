import { Metadata } from "next";

export const metadata: Metadata = {
  title: "SMS Terms & Opt-In Disclosure | SkyRate AI",
  description:
    "SkyRate AI SMS Terms, Opt-In Disclosure, and Text Messaging Policy. Learn how we collect consent for SMS notifications about E-Rate funding status changes.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/sms-terms" },
};

export default function SmsTermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
