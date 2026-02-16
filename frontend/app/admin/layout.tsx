import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | SkyRate AI",
  description: "SkyRate AI Administration Panel.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
