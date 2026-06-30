"use client";

import Link from "next/link";
import { SafeEmail } from "@/components/SafeEmail";

export default function SecurityPage() {
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
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Security &amp; Data Protection</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: June 30, 2026</p>

        <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-li:text-slate-600 prose-a:text-purple-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-800">

          <p>
            We know that the documents and funding data you entrust to SkyRate are sensitive. This page
            explains, in plain language, how we protect your information and how long we keep it. If you
            have a question that is not answered here, email us at{" "}
            <SafeEmail className="text-purple-600 hover:text-purple-700" /> and we will respond.
          </p>

          <h2>1. Encryption</h2>
          <ul>
            <li>
              <strong>In transit:</strong> All traffic to and from SkyRate is encrypted using TLS 1.2+ (HTTPS).
              We do not serve any part of the application over an unencrypted connection.
            </li>
            <li>
              <strong>At rest:</strong> Your account data and uploaded documents are stored on encrypted,
              access-controlled infrastructure.
            </li>
          </ul>

          <h2>2. Hosting &amp; Infrastructure</h2>
          <p>
            SkyRate runs on managed cloud infrastructure (DigitalOcean) in U.S. data centers. Application
            servers and databases are isolated, and administrative access is restricted to authorized
            personnel only. We apply security patches to our platform on an ongoing basis.
          </p>

          <h2>3. Authentication &amp; Access Control</h2>
          <ul>
            <li>Passwords are hashed using industry-standard one-way hashing — we never store them in plain text.</li>
            <li>Access to the platform is session-based, with role-based permissions separating Consultant, Vendor, Applicant, and Administrator capabilities.</li>
            <li>Multi-factor authentication (MFA) is available to add a second layer of protection to your account.</li>
            <li>Rate limiting protects authentication endpoints against automated abuse.</li>
          </ul>

          <h2>4. Payment Security</h2>
          <p>
            Payments are processed by Stripe, a PCI-DSS Level 1 certified provider. SkyRate never sees or
            stores your full credit card number or bank account details — that information is handled
            directly by Stripe.
          </p>

          <h2>5. Your Documents</h2>
          <p>
            Documents you upload (for example, Forms 470/471, bids, or supporting files for compliance
            review) are stored on encrypted, access-controlled storage and are visible only to your
            account and authorized SkyRate staff acting on your behalf. We do not sell your data and we do
            not share your documents with other customers.
          </p>

          <h2>6. Data Retention</h2>
          <ul>
            <li>We retain your account data and uploaded documents for as long as your account is active.</li>
            <li>If you delete your account, we remove your personal information and uploaded documents within 30 days, except where retention is required by law or for legitimate business purposes (for example, billing records).</li>
            <li>You may request export or deletion of your data at any time.</li>
            <li>Publicly available E-Rate program data sourced from USAC/FCC (FRN statuses, Form 470 filings, funding commitments) is public information and may be retained independently of your account.</li>
          </ul>

          <h2>7. Monitoring &amp; Reliability</h2>
          <p>
            We monitor our systems for errors and unusual activity, and maintain backups of customer data
            to support recovery. While we strive to protect your information, no method of electronic
            transmission or storage is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h2>8. Responsible Disclosure</h2>
          <p>
            If you believe you have found a security vulnerability in SkyRate, please report it to us at{" "}
            <SafeEmail className="text-purple-600 hover:text-purple-700" />. We appreciate responsible
            disclosure and will work with you to verify and address valid reports.
          </p>

          <h2>9. Questions</h2>
          <p>
            For any questions about our security or document-retention practices, contact us at{" "}
            <SafeEmail className="text-purple-600 hover:text-purple-700" /> or visit{" "}
            <a href="https://skyrate.ai">https://skyrate.ai</a>. See also our{" "}
            <Link href="/privacy">Privacy Policy</Link> and{" "}
            <Link href="/terms">Terms of Service</Link>.
          </p>
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
            <Link href="/security" className="text-purple-400">Security</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <span>&copy; {new Date().getFullYear()} SkyRate AI. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
