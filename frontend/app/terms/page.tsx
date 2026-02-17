"use client";

import Link from "next/link";
import { SafeEmail } from "@/components/SafeEmail";

export default function TermsPage() {
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
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: February 16, 2026</p>

        <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-li:text-slate-600 prose-a:text-purple-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-800">

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using the SkyRate AI platform at{" "}
            <a href="https://skyrate.ai">skyrate.ai</a> (the &quot;Service&quot;), you agree to be bound by
            these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not use
            the Service. These Terms constitute a legally binding agreement between you and SkyRate AI
            (&quot;SkyRate,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
          </p>

          <h2>2. Description of Service</h2>
          <p>
            SkyRate AI is an E-Rate funding intelligence platform that provides tools for E-Rate consultants,
            service providers (vendors), and applicants (schools and libraries) to:
          </p>
          <ul>
            <li>Monitor FRN (Funding Request Number) statuses from USAC</li>
            <li>Receive alerts on status changes, denials, and deadlines</li>
            <li>Generate AI-powered denial analysis and appeal letters</li>
            <li>Discover Form 470 leads and track SPIN status (vendors)</li>
            <li>Manage school portfolios and funding applications</li>
          </ul>
          <p>
            The Service utilizes publicly available data from the Universal Service Administrative Company
            (USAC) and the Federal Communications Commission (FCC). SkyRate AI is not affiliated with,
            endorsed by, or sponsored by USAC or the FCC.
          </p>

          <h2>3. Account Registration</h2>
          <p>
            To use the Service, you must create an account and provide accurate, complete information.
            You are responsible for:
          </p>
          <ul>
            <li>Maintaining the confidentiality of your account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Notifying us immediately of any unauthorized access</li>
            <li>Ensuring your USAC identifiers (CRN, SPIN, or BEN) are accurate</li>
          </ul>
          <p>
            You must be at least 18 years old and have the legal authority to enter into these Terms on
            behalf of yourself or the organization you represent.
          </p>

          <h2>4. Subscription and Payment</h2>

          <h3>4.1 Pricing</h3>
          <p>The Service is offered on a subscription basis with the following plans:</p>
          <ul>
            <li><strong>Consultant:</strong> $300/month or $3,000/year</li>
            <li><strong>Vendor:</strong> $199/month or $1,999/year</li>
            <li><strong>Applicant:</strong> $200/month or $2,000/year</li>
          </ul>
          <p>All prices are in US dollars and are subject to change with 30 days&apos; notice.</p>

          <h3>4.2 Free Trial</h3>
          <p>
            New accounts receive a 14-day free trial. During the trial, you have full access to Service
            features. You will not be charged until you subscribe to a paid plan.
          </p>

          <h3>4.3 Billing</h3>
          <p>
            Payments are processed through Stripe. Subscriptions automatically renew at the end of each
            billing period unless canceled. You may cancel your subscription at any time; access continues
            through the end of the current billing period.
          </p>

          <h3>4.4 Refunds</h3>
          <p>
            Refunds are available within 14 days of initial payment if you are not satisfied with the
            Service. To request a refund, contact <SafeEmail className="text-purple-600 hover:text-purple-700" />.
            Refunds are not available for partial billing periods after the 14-day window.
          </p>

          <h2>5. SMS/Text Messaging Terms</h2>
          <p>
            By opting in to SMS notifications, you consent to receive text messages from SkyRate AI at the
            phone number you provide. By texting the keyword <strong>START</strong> or opting in through our
            web form during onboarding, you agree to the following:
          </p>
          <ul>
            <li>You will receive account notifications including FRN status alerts, denial notifications, deadline reminders, and verification codes</li>
            <li>Message frequency varies based on your selected notification preferences (real-time, every 6 hours, daily, or weekly)</li>
            <li>Message and data rates may apply depending on your mobile carrier</li>
            <li>SMS consent is not required as a condition of purchasing the Service</li>
            <li>You can opt out at any time by replying <strong>STOP</strong> to any message</li>
            <li>Reply <strong>HELP</strong> for assistance or contact <SafeEmail className="text-purple-600 hover:text-purple-700" /></li>
          </ul>
          <p>
            Supported carriers include but are not limited to AT&amp;T, T-Mobile, Verizon, Sprint, and all
            major US carriers. We are not responsible for delayed or undelivered messages caused by carrier
            issues.
          </p>

          <h2>6. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose or in violation of any applicable law</li>
            <li>Attempt to gain unauthorized access to other accounts or our systems</li>
            <li>Scrape, harvest, or extract data from the Service by automated means beyond normal API usage</li>
            <li>Interfere with or disrupt the Service or its infrastructure</li>
            <li>Use AI-generated appeal letters as legal advice (see Section 8)</li>
            <li>Share your account credentials with unauthorized users</li>
            <li>Resell or redistribute data obtained through the Service</li>
            <li>Submit false or misleading information, including fraudulent USAC identifiers</li>
          </ul>

          <h2>7. Intellectual Property</h2>
          <p>
            The Service, including its design, code, features, and branding, is the intellectual property
            of SkyRate AI and is protected by copyright and other intellectual property laws.
          </p>
          <p>
            Content you generate through the Service (e.g., AI-generated appeal letters) is owned by you,
            subject to any rights of the underlying AI service providers. We retain a non-exclusive license
            to use anonymized and aggregated data to improve the Service.
          </p>

          <h2>8. Disclaimer Regarding Legal and Regulatory Advice</h2>
          <p>
            <strong>The Service does not provide legal, regulatory, or professional advice.</strong> AI-generated
            denial analysis and appeal letters are provided as informational tools only. You should:
          </p>
          <ul>
            <li>Review all AI-generated content before submission to USAC or the FCC</li>
            <li>Consult with qualified E-Rate legal counsel for complex appeals</li>
            <li>Verify all regulatory references (e.g., FCC Order citations) for accuracy</li>
            <li>Not rely solely on AI-generated content for compliance decisions</li>
          </ul>
          <p>
            SkyRate AI is not responsible for the outcome of any appeal, funding request, or regulatory
            matter arising from use of the Service.
          </p>

          <h2>9. Data Accuracy</h2>
          <p>
            While we strive to provide accurate and timely E-Rate data, the Service relies on publicly
            available data from USAC and other sources. We do not guarantee the accuracy, completeness,
            or timeliness of this data. USAC data may be delayed or contain errors. Always verify critical
            information directly with USAC.
          </p>

          <h2>10. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, SKYRATE AI SHALL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF
            FUNDING, MISSED DEADLINES, OR DENIED APPEALS, ARISING FROM YOUR USE OF THE SERVICE.
          </p>
          <p>
            Our total liability to you for any claims arising from the Service shall not exceed the amount
            you paid to us in the twelve (12) months preceding the claim.
          </p>

          <h2>11. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless SkyRate AI, its officers, employees, and agents from
            any claims, damages, losses, or expenses (including reasonable attorney&apos;s fees) arising
            from your use of the Service or violation of these Terms.
          </p>

          <h2>12. Service Availability</h2>
          <p>
            We strive to maintain high availability but do not guarantee uninterrupted access to the
            Service. We may perform maintenance, updates, or experience downtime. We will make reasonable
            efforts to provide advance notice of planned maintenance.
          </p>

          <h2>13. Termination</h2>
          <p>
            We may suspend or terminate your account if you violate these Terms or engage in fraudulent
            activity. You may terminate your account at any time by contacting us. Upon termination:
          </p>
          <ul>
            <li>Your access to the Service will be revoked</li>
            <li>Your personal data will be handled according to our <Link href="/privacy" className="text-purple-600">Privacy Policy</Link></li>
            <li>Any outstanding payments remain due</li>
          </ul>

          <h2>14. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the State of California, without regard to its conflict
            of laws principles. Any disputes arising under these Terms shall be resolved in the courts
            located in Los Angeles County, California.
          </p>

          <h2>15. Changes to Terms</h2>
          <p>
            We may modify these Terms at any time. Material changes will be communicated via email or
            through the Service at least 30 days before taking effect. Continued use of the Service after
            changes constitutes acceptance of the revised Terms.
          </p>

          <h2>16. Contact Us</h2>
          <p>For questions about these Terms, contact us at:</p>
          <ul>
            <li>Email: <SafeEmail className="text-purple-600 hover:text-purple-700" /></li>
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
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-purple-400">Terms of Service</Link>
            <span>&copy; {new Date().getFullYear()} SkyRate AI. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
