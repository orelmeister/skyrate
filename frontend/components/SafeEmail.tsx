'use client';

import { useEffect, useState } from 'react';

interface SafeEmailProps {
  user?: string;
  domain?: string;
  className?: string;
  subject?: string;
  /** If provided, renders this as the link text instead of the email */
  children?: React.ReactNode;
  /** Fallback text shown during SSR (before hydration) */
  fallback?: string;
}

/**
 * Client-side-only email link component.
 * 
 * Prevents Cloudflare Email Address Obfuscation from breaking React hydration.
 * Cloudflare replaces email addresses in server-rendered HTML with <span> elements,
 * which causes React error #300 ("Objects are not valid as a React child").
 * 
 * This component only renders the email after client-side hydration,
 * so Cloudflare never sees the email in the HTML response.
 */
export function SafeEmail({
  user = 'support',
  domain = 'skyrate.ai',
  className,
  subject,
  children,
  fallback,
}: SafeEmailProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // During SSR, render fallback text (no email pattern for Cloudflare to detect)
    return (
      <span className={className}>
        {fallback || children || 'contact us'}
      </span>
    );
  }

  const email = `${user}@${domain}`;
  const href = subject
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${email}`;

  return (
    <a href={href} className={className} suppressHydrationWarning>
      {children || email}
    </a>
  );
}

/**
 * Dynamic email link for variable email addresses (e.g., vendor contacts).
 * Use when the email is not known at build time.
 */
export function DynamicEmailLink({
  email,
  className,
  subject,
  children,
}: {
  email: string;
  className?: string;
  subject?: string;
  children?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span className={className} suppressHydrationWarning>
        {children || 'contact'}
      </span>
    );
  }

  const href = subject
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${email}`;

  return (
    <a href={href} className={className} suppressHydrationWarning>
      {children || email}
    </a>
  );
}
