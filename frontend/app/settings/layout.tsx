import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings | SkyRate AI",
  description: "Manage your SkyRate AI account settings.",
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
