import { NextResponse } from "next/server";

// Short link used in outbound emails (e.g. denial-hunter outreach).
// Redirects to Ari's Google Calendar booking page so prospects can self-book a demo.
const CALENDAR_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  "https://calendar.app.google/edkn1FDx2mBngFGs9";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.redirect(CALENDAR_URL, 302);
}
