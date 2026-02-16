"use client";

import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-white font-bold text-xl">SkyRate<span className="text-purple-400">.AI</span></span>
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white transition-colors">
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: February 16, 2026</p>

        <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-li:text-slate-600 prose-a:text-purple-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-800">

          <h2>1. Introduction</h2>
          <p>
            SkyRate AI (&quot;SkyRate,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the website{" "}
            <a href="https://skyrate.ai">skyrate.ai</a> and provides an E-Rate funding intelligence platform
            (the &quot;Service&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard
            your information when you visit our website or use our Service.
          </p>

          <h2>2. Information We Collect</h2>

          <h3>2.1 Account Information</h3>
          <p>When you register for an account, we collect:</p>
          <ul>
            <li>Name and email address</li>
            <li>Company or organization name</li>
            <li>Role type (Consultant, Vendor, or Applicant)</li>
            <li>USAC identifiers: CRN (Consultant Registration Number), SPIN (Service Provider Identification Number), or BEN (Billed Entity Number)</li>
            <li>Phone number (optional, for SMS alerts)</li>
          </ul>

          <h3>2.2 E-Rate Data</h3>
          <p>
            We access publicly available E-Rate program data from the Universal Service Administrative Company
            (USAC) and the Federal Communications Commission (FCC), including FRN (Funding Request Number)
            statuses, Form 470 filings, and funding commitment data. This data is publicly available through
            the USAC Open Data platform.
          </p>

          <h3>2.3 Usage Information</h3>
          <p>We automatically collect:</p>
          <ul>
            <li>Browser type and version</li>
            <li>Pages visited and features used</li>
            <li>Search queries within the platform</li>
            <li>Device information and IP address</li>
            <li>Cookies and similar tracking technologies</li>
          </ul>

          <h3>2.4 Payment Information</h3>
          <p>
            Payment processing is handled by Stripe. We do not store your credit card numbers or banking
            details on our servers. Stripe&apos;s privacy policy governs the handling of payment data.
          </p>

          <h2>3. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve the Service</li>
            <li>Monitor E-Rate funding requests and send status alerts</li>
            <li>Generate AI-powered denial analysis and appeal letters</li>
            <li>Send notifications via email, push notifications, or SMS based on your preferences</li>
            <li>Process payments and manage subscriptions</li>
            <li>Provide customer support</li>
            <li>Analyze usage patterns to improve our platform</li>
            <li>Comply with legal obligations</li>
          </ul>

          <h2>4. SMS/Text Messaging</h2>
          <p>
            If you opt in to SMS notifications during onboarding or in your account settings, you consent
            to receive text messages from SkyRate AI at the phone number you provide.
          </p>

          <h3>4.1 Opt-In</h3>
          <p>
            You may opt in to SMS notifications by completing the phone verification step during
            onboarding on our website, enabling SMS alerts in your account settings, or by texting the
            keyword <strong>START</strong> to our messaging number. By opting in, you agree to receive the
            message types described below.
          </p>

          <h3>4.2 Message Types</h3>
          <ul>
            <li>Phone number verification codes</li>
            <li>FRN status change alerts</li>
            <li>Funding denial notifications</li>
            <li>Appeal deadline reminders</li>
            <li>Important account notifications</li>
          </ul>

          <h3>4.3 Message Frequency &amp; Rates</h3>
          <p>
            <strong>Message frequency varies</strong> based on your alert preferences (real-time, every 6 hours, daily,
            or weekly). Message and data rates may apply depending on your mobile carrier and plan.
            SMS consent is not required as a condition of purchasing the Service.
          </p>

          <h3>4.4 Opt-Out &amp; Help Keywords</h3>
          <p>
            You can manage SMS notifications with these keywords:
          </p>
          <ul>
            <li><strong>STOP</strong> — Reply STOP to any message to unsubscribe from all SMS notifications</li>
            <li><strong>START</strong> — Text START to re-subscribe to SMS notifications</li>
            <li><strong>HELP</strong> — Reply HELP for assistance. You will receive a message with support contact information</li>
          </ul>
          <p>
            You may also disable SMS in your <a href="https://skyrate.ai/settings">account settings</a> at
            any time.
          </p>

          <h3>4.5 SMS Data Usage</h3>
          <p>
            We will not use your phone number for marketing purposes. SMS is used solely for account
            verification and the alert notifications you have opted into. We do not share your phone number
            with third parties for their marketing purposes.
          </p>

          <h3>4.6 Carrier Disclaimer</h3>
          <p>
            Supported carriers include but are not limited to AT&amp;T, T-Mobile, Verizon, and all major
            US carriers. Carriers are not liable for delayed or undelivered messages.
          </p>

          <h2>5. Information Sharing</h2>
          <p>We do not sell your personal information. We may share information with:</p>
          <ul>
            <li><strong>Service providers:</strong> Stripe (payments), Twilio (SMS), Google Workspace (email), and cloud hosting providers that help us operate the Service</li>
            <li><strong>AI providers:</strong> We send anonymized or de-identified E-Rate data to AI services (DeepSeek, Google Gemini, Anthropic Claude) for denial analysis and appeal generation. We do not send your personal contact information to AI providers.</li>
            <li><strong>Legal requirements:</strong> When required by law, subpoena, or legal process</li>
            <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
          </ul>

          <h2>6. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your data, including:
          </p>
          <ul>
            <li>Encrypted data transmission (TLS/HTTPS)</li>
            <li>Hashed passwords using bcrypt</li>
            <li>JWT-based authentication with secure token management</li>
            <li>Rate limiting on authentication endpoints</li>
            <li>Regular security audits and monitoring</li>
          </ul>
          <p>
            While we strive to protect your information, no method of electronic transmission or storage
            is 100% secure. We cannot guarantee absolute security.
          </p>

          <h2>7. Data Retention</h2>
          <p>
            We retain your account data for as long as your account is active. If you delete your account,
            we will remove your personal information within 30 days, except where retention is required by
            law or for legitimate business purposes (e.g., billing records).
          </p>
          <p>
            E-Rate program data sourced from USAC is publicly available and may be retained independently
            of your account.
          </p>

          <h2>8. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li><strong>Access</strong> the personal information we hold about you</li>
            <li><strong>Correct</strong> inaccurate or incomplete information</li>
            <li><strong>Delete</strong> your account and associated personal data</li>
            <li><strong>Opt out</strong> of email, SMS, or push notifications at any time</li>
            <li><strong>Export</strong> your data in a portable format</li>
            <li><strong>Withdraw consent</strong> for data processing where consent is the legal basis</li>
          </ul>
          <p>
            To exercise these rights, contact us at{" "}
            <a href="mailto:support@skyrate.ai">support@skyrate.ai</a>.
          </p>

          <h2>9. Cookies</h2>
          <p>
            We use essential cookies to maintain your authentication session and remember your preferences.
            We do not use third-party advertising cookies. You can configure your browser to reject cookies,
            though this may affect the functionality of the Service.
          </p>

          <h2>10. Children&apos;s Privacy</h2>
          <p>
            The Service is not directed to individuals under 18 years of age. We do not knowingly collect
            personal information from children. If we become aware that a child has provided us with
            personal information, we will take steps to delete such information.
          </p>

          <h2>11. California Privacy Rights (CCPA)</h2>
          <p>
            California residents have additional rights under the CCPA, including the right to know what
            personal information is collected, request deletion, and opt out of the sale of personal
            information. We do not sell personal information. To exercise your CCPA rights, contact us
            at <a href="mailto:support@skyrate.ai">support@skyrate.ai</a>.
          </p>

          <h2>12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes
            by posting the updated policy on this page and updating the &quot;Last updated&quot; date. Your
            continued use of the Service after changes constitutes acceptance of the revised policy.
          </p>

          <h2>13. Contact Us</h2>
          <p>If you have questions about this Privacy Policy or our data practices, contact us at:</p>
          <ul>
            <li>Email: <a href="mailto:support@skyrate.ai">support@skyrate.ai</a></li>
            <li>Website: <a href="https://skyrate.ai">https://skyrate.ai</a></li>
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={24} height={24} className="rounded" />
            <span className="text-white font-semibold text-sm">SkyRate<span className="text-purple-400">.AI</span></span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/privacy" className="text-purple-400">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <span>&copy; {new Date().getFullYear()} SkyRate AI. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
