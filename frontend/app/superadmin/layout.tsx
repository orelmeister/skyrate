import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mail Campaigns | SkyRate Superadmin",
  description: "Mail campaign operations dashboard for mail.skyrate.ai.",
  robots: { index: false, follow: false },
};

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
