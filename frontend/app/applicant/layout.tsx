import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Applicant Dashboard | SkyRate AI",
  description: "Track your E-Rate applications and funding status.",
  robots: { index: false, follow: false },
};

export default function ApplicantLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
