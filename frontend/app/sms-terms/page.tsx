"use client";

import Link from "next/link";

export default function SmsTermsPage() {
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
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">SMS Terms &amp; Opt-In Disclosure</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: February 23, 2026</p>

        <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-li:text-slate-600 prose-a:text-purple-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-800">

          {/* ==================== SECTION 1 ==================== */}
          <h2>1. About SkyRate AI SMS Notifications</h2>
          <p>
            <strong>SkyRate AI</strong> (<a href="https://skyrate.ai">https://skyrate.ai</a>) is an E-Rate Funding
            Intelligence Platform that helps schools, libraries, E-Rate consultants, and technology vendors manage and
            maximize federal E-Rate program funding (administered by USAC/FCC). We offer optional SMS/text message
            notifications to keep our users informed about time-sensitive E-Rate funding events.
          </p>
          <p>
            Our SMS notifications include:
          </p>
          <ul>
            <li><strong>FRN Status Alerts</strong> — Real-time notifications when a Funding Request Number (FRN) status changes in the USAC system (e.g., from &quot;Pending&quot; to &quot;Funded Committed&quot;)</li>
            <li><strong>Denial Notifications</strong> — Alerts when an E-Rate funding request is denied or rejected</li>
            <li><strong>Deadline Reminders</strong> — Reminders for appeal filing windows, Form 471 deadlines, and other time-sensitive E-Rate milestones</li>
            <li><strong>Phone Verification Codes</strong> — One-time codes to verify your phone number during account setup</li>
            <li><strong>Account Notifications</strong> — Important account-related updates (e.g., subscription changes, security alerts)</li>
          </ul>

          {/* ==================== SECTION 2 ==================== */}
          <h2>2. How Users Opt In to SMS Notifications</h2>
          <p>
            SMS notifications are <strong>completely optional</strong>. Users opt in through a clear, affirmative action
            during or after account creation. SMS consent is <strong>not required as a condition of purchasing</strong>{" "}
            any SkyRate AI service or subscription. Users may purchase and use all SkyRate AI features without enabling
            SMS notifications.
          </p>

          <h3>2.1 Web Form Opt-In (Primary Method)</h3>
          <p>
            During the post-registration onboarding process on our website, users complete a multi-step wizard. In
            <strong> Step 2: Alert Preferences</strong>, users are presented with notification channel options:
          </p>

          {/* ---- VISUAL MOCKUP OF OPT-IN FORM ---- */}
          <div className="not-prose my-8 border-2 border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Mockup header */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Onboarding Step 2 — Alert Preferences
              </p>
            </div>
            <div className="p-6 sm:p-8 bg-white">
              <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
                How to receive alerts
              </h4>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="flex items-center gap-2 px-4 py-2 rounded-xl border border-purple-300 bg-purple-50 text-sm font-medium text-purple-700">
                  📧 Email
                </span>
                <span className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-500">
                  🔔 Push
                </span>
                <span className="flex items-center gap-2 px-4 py-2 rounded-xl border border-purple-300 bg-purple-50 text-sm font-medium text-purple-700">
                  📱 SMS
                </span>
              </div>
              <p className="text-xs text-amber-600 flex items-center gap-1 mb-6">
                📱 SMS alerts will be available once your phone number is verified
              </p>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  By enabling SMS notifications, you agree to receive text messages from SkyRate AI at the phone number
                  you provide. Message frequency varies based on your alert preferences. Message and data rates may apply.
                  Reply <strong>STOP</strong> to unsubscribe at any time. Reply <strong>HELP</strong> for assistance.
                  SMS consent is not required to purchase our service. See our{" "}
                  <span className="text-purple-600">Privacy Policy</span> and{" "}
                  <span className="text-purple-600">Terms of Service</span> for details.
                </p>
              </div>
            </div>
          </div>

          <p>
            When a user clicks the <strong>&quot;SMS&quot;</strong> button to enable SMS notifications, they are then
            directed to enter and verify their phone number. The verification process uses a one-time code sent via SMS
            to confirm the user owns the number. Only after successful phone verification are SMS notifications
            activated.
          </p>

          <h3>2.2 Account Settings Opt-In</h3>
          <p>
            Users who initially decline SMS during onboarding can enable it later from their{" "}
            <strong>Account Settings → Notification Preferences</strong> page. The same consent language and phone
            verification process applies.
          </p>

          <h3>2.3 Keyword Opt-In</h3>
          <p>
            Users can also opt in by texting the keyword <strong>START</strong> to our messaging number. Upon receiving
            the START keyword, we send a confirmation message explaining the service, message frequency, and how to
            opt out.
          </p>

          {/* ==================== SECTION 3 ==================== */}
          <h2>3. Consent Language</h2>
          <p>
            Before SMS notifications are activated, users see and agree to the following consent disclosure:
          </p>
          <blockquote className="border-l-4 border-purple-400 bg-purple-50/50 p-4 rounded-r-lg my-6">
            <p className="text-slate-700 text-sm leading-relaxed !my-0">
              &quot;By enabling SMS notifications, you agree to receive text messages from SkyRate AI at the phone
              number you provide. Messages include E-Rate FRN status alerts, denial notifications, deadline reminders,
              and account verification codes. Message frequency varies based on your alert preferences. Message and data
              rates may apply. Reply STOP to unsubscribe at any time. Reply HELP for assistance. SMS consent is not
              required to purchase our service. View our{" "}
              <a href="https://skyrate.ai/privacy">Privacy Policy</a> and{" "}
              <a href="https://skyrate.ai/terms">Terms of Service</a> for details.&quot;
            </p>
          </blockquote>

          {/* ==================== SECTION 4 ==================== */}
          <h2>4. Sample Messages</h2>
          <p>Below are examples of the types of SMS messages users receive:</p>

          <div className="not-prose my-6 space-y-3">
            {[
              {
                label: "FRN Status Change Alert",
                msg: 'SkyRate.AI Alert: FRN 2599047928 status changed from "Pending" to "Funded Committed". $45,000 committed for Category 1 services. View details at https://skyrate.ai',
              },
              {
                label: "Denial Notification",
                msg: "SkyRate.AI Alert: FRN 2401234567 has been DENIED. Reason: Missing Form 471 documentation. Appeal deadline: March 15, 2026. Generate appeal at https://skyrate.ai",
              },
              {
                label: "Deadline Reminder",
                msg: "SkyRate.AI Reminder: Form 471 filing window closes in 7 days (March 1, 2026). You have 3 applications pending submission. Review at https://skyrate.ai",
              },
              {
                label: "Phone Verification",
                msg: "SkyRate.AI: Your verification code is 847291. This code expires in 10 minutes. If you did not request this, please ignore.",
              },
            ].map((s) => (
              <div key={s.label} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">{s.label}</p>
                <p className="text-sm text-slate-700 leading-relaxed">{s.msg}</p>
              </div>
            ))}
          </div>

          {/* ==================== SECTION 5 ==================== */}
          <h2>5. Message Frequency</h2>
          <p>
            Message frequency varies based on the user&apos;s alert preferences and E-Rate activity. Users can configure
            their notification frequency during onboarding or in account settings:
          </p>
          <ul>
            <li><strong>Real-time</strong> — Immediate alerts as events occur (typically 0–5 messages per day)</li>
            <li><strong>Daily digest</strong> — One summary message per day</li>
            <li><strong>Weekly digest</strong> — One summary message per week</li>
            <li><strong>Critical only</strong> — Only denial notifications and deadline reminders</li>
          </ul>
          <p>
            Estimated monthly volume is approximately <strong>10–100 messages</strong> per user depending on their
            portfolio size and alert configuration. Verification codes are sent only when requested by the user.
          </p>

          {/* ==================== SECTION 6 ==================== */}
          <h2>6. Opt-Out Instructions</h2>
          <p>Users can opt out of SMS notifications at any time using any of these methods:</p>
          <ul>
            <li>
              <strong>Reply STOP</strong> — Text <strong>STOP</strong> to any message from SkyRate AI to immediately
              unsubscribe from all SMS notifications. You will receive a one-time confirmation message.
            </li>
            <li>
              <strong>Account Settings</strong> — Disable SMS notifications in your{" "}
              <strong>Account Settings → Notification Preferences</strong> page.
            </li>
            <li>
              <strong>Onboarding</strong> — Deselect the SMS channel during the onboarding process.
            </li>
          </ul>

          <h3>6.1 Keyword Commands</h3>
          <div className="not-prose my-6">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Keyword</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-600">
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-3 font-mono font-bold text-purple-700">STOP</td>
                  <td className="py-2 px-3">Unsubscribe from all SMS notifications immediately</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-3 font-mono font-bold text-purple-700">START</td>
                  <td className="py-2 px-3">Re-subscribe to SMS notifications</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-3 font-mono font-bold text-purple-700">HELP</td>
                  <td className="py-2 px-3">Receive help information and support contact details</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ==================== SECTION 7 ==================== */}
          <h2>7. Data Usage &amp; Privacy</h2>
          <ul>
            <li>Phone numbers collected for SMS notifications are used <strong>solely</strong> for delivering the notifications described above.</li>
            <li>We do <strong>not</strong> use phone numbers for marketing or promotional purposes beyond the opted-in alert categories.</li>
            <li>We do <strong>not</strong> share, sell, or transfer phone numbers, SMS opt-in data, or text messaging originator consent to any third parties or affiliates for marketing or promotional purposes.</li>
            <li>Mobile information will not be shared with third parties/affiliates for marketing/promotional purposes. The above excludes text messaging originator opt-in data and consent; this information will not be shared with any third parties.</li>
            <li>SMS messages are delivered through <a href="https://www.twilio.com">Twilio</a>, our messaging service provider, which processes phone numbers solely for message delivery.</li>
          </ul>
          <p>
            For complete details, see our <a href="https://skyrate.ai/privacy">Privacy Policy</a> (Section 4: SMS/Text Messaging).
          </p>

          {/* ==================== SECTION 8 ==================== */}
          <h2>8. Supported Carriers &amp; Disclaimer</h2>
          <p>
            SMS notifications are supported on all major U.S. carriers, including but not limited to:
          </p>
          <ul>
            <li>AT&amp;T, Verizon, T-Mobile, Sprint, U.S. Cellular</li>
            <li>Boost Mobile, Cricket Wireless, Metro by T-Mobile</li>
            <li>Google Fi, Mint Mobile, Visible, and other MVNOs</li>
          </ul>
          <p>
            Carriers are not liable for delayed or undelivered messages. Message and data rates may apply depending on
            your mobile plan. Contact your carrier for details about your text messaging plan.
          </p>

          {/* ==================== SECTION 9 ==================== */}
          <h2>9. Contact Us</h2>
          <p>For questions about our SMS notifications or to request assistance:</p>
          <ul>
            <li><strong>Email:</strong> <a href="mailto:support@skyrate.ai">support@skyrate.ai</a></li>
            <li><strong>Text:</strong> Reply <strong>HELP</strong> to any message from SkyRate AI</li>
            <li><strong>Website:</strong> <a href="https://skyrate.ai/contact">https://skyrate.ai/contact</a></li>
          </ul>

          {/* ==================== SECTION 10 ==================== */}
          <h2>10. Related Policies</h2>
          <ul>
            <li><a href="https://skyrate.ai/privacy">Privacy Policy</a> — Full data collection, usage, and protection practices</li>
            <li><a href="https://skyrate.ai/terms">Terms of Service</a> — Section 5: SMS/Text Messaging Terms</li>
          </ul>

          <hr className="my-8" />

          <p className="text-sm text-slate-500 italic">
            SkyRate AI is operated by SkyRate AI LLC. This SMS Terms &amp; Opt-In Disclosure page is publicly accessible
            and does not require a login or account to view. For questions regarding toll-free messaging verification,
            contact <a href="mailto:support@skyrate.ai">support@skyrate.ai</a>.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/images/logos/logo-icon-transparent.png" alt="" width={24} height={24} className="rounded" />
              <span className="text-white font-bold text-sm">SkyRate<span className="text-purple-400">.AI</span></span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
            </div>
            <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} SkyRate AI LLC. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
