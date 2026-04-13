"use client";

import { useEffect } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import clarity from "@microsoft/clarity";

function ClarityInit() {
  useEffect(() => {
    const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID;
    if (clarityId) {
      clarity.init(clarityId);
    }
  }, []);
  return null;
}

export default function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <>
      {gaId && <GoogleAnalytics gaId={gaId} />}
      <ClarityInit />
    </>
  );
}
