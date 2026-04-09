import Link from 'next/link'
import { Sun, ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy — Sunrise Tennis',
}

export default function PrivacyPage() {
  return (
    <div className="gradient-sunrise min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-2xl bg-card/95 p-6 shadow-elevated backdrop-blur sm:p-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <Sun className="size-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Privacy Policy
          </h1>
        </div>

        <div className="prose prose-sm max-w-none text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">
          <p className="text-xs">Last updated: 19 March 2026</p>

          <h2>1. About this policy</h2>
          <p>
            Sunrise Tennis (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates a tennis coaching
            business based at Somerton Park Tennis Club, Adelaide, South Australia. This policy explains
            how we collect, use, store and disclose your personal information in accordance with the
            Australian Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs).
          </p>
          <p>
            Because we collect health information (such as injuries, medical conditions and physical
            limitations) to keep players safe during coaching sessions, we are covered by the Privacy
            Act regardless of our annual turnover.
          </p>

          <h2>2. Information we collect</h2>
          <h3>Personal information</h3>
          <ul>
            <li>Names and contact details (phone, email, address) of parents/guardians</li>
            <li>Player names, dates of birth and gender</li>
            <li>Account login credentials (email and password, managed by Supabase Auth)</li>
          </ul>

          <h3>Sensitive information (health data)</h3>
          <ul>
            <li>Medical notes — allergies, injuries, conditions relevant to physical activity</li>
            <li>Physical limitations or considerations for coaching</li>
          </ul>
          <p>
            We only collect health information that you voluntarily provide for the purpose of player
            safety during coaching sessions. We will ask for your explicit consent before collecting
            this information.
          </p>

          <h3>Payment information</h3>
          <p>
            Payments are processed by <strong>Stripe</strong> using client-side tokenisation. Your
            card details are sent directly to Stripe and never touch our servers. We only store
            transaction references, amounts and payment status.
          </p>

          <h3>Coaching and program data</h3>
          <ul>
            <li>Lesson notes, attendance records and coaching progress</li>
            <li>Program enrolments and booking history</li>
            <li>Team membership and availability responses</li>
          </ul>

          <h2>3. How we use your information</h2>
          <ul>
            <li><strong>Coaching delivery</strong> — managing lessons, tracking progress, planning sessions</li>
            <li><strong>Player safety</strong> — medical notes ensure coaches are aware of relevant conditions</li>
            <li><strong>Billing and payments</strong> — invoicing, payment tracking, balance management</li>
            <li><strong>Communication</strong> — session notifications, booking confirmations, team messages</li>
            <li><strong>Program management</strong> — enrolments, attendance, scheduling</li>
          </ul>
          <p>
            We do not use your information for marketing to third parties, sell your data, or share
            it with anyone outside the coaching operation.
          </p>

          <h2>4. Who can access your information</h2>
          <ul>
            <li><strong>Administrators</strong> — can access all data for business management</li>
            <li><strong>Coaches</strong> — can access player profiles and medical notes for players in their sessions</li>
            <li><strong>Parents/guardians</strong> — can view and edit only their own family&apos;s information</li>
          </ul>
          <p>
            Access is enforced at the database level using row-level security policies. No user can
            access another family&apos;s data through the application.
          </p>

          <h2>5. How we store and protect your information</h2>
          <ul>
            <li>All data is transmitted over HTTPS (encrypted in transit)</li>
            <li>Medical and physical notes are <strong>encrypted at rest</strong> using AES-256 encryption</li>
            <li>Access controls are enforced at the database level (row-level security)</li>
            <li>All changes to sensitive records are logged in an audit trail retained for 7 years</li>
            <li>Authentication uses secure, httpOnly session cookies with regular token refresh</li>
          </ul>

          <h3>Data location</h3>
          <p>
            Our database is hosted by <strong>Supabase</strong> in their Northeast Asia (Tokyo, Japan)
            data centre. Supabase is a trusted infrastructure provider with SOC 2 Type II certification.
            Under APP 8, we disclose that your personal information is stored on servers located in Japan.
            We have taken reasonable steps to ensure Supabase&apos;s data handling practices are consistent
            with the Australian Privacy Principles.
          </p>

          <h2>6. Children&apos;s data</h2>
          <p>
            Most of our players are children and young people. All data relating to minors is collected
            with the knowledge and consent of their parent or guardian, who manages the account on their
            behalf. Parents can view, edit, or request deletion of their children&apos;s data at any time
            through their portal or by contacting us directly.
          </p>

          <h2>7. Your rights</h2>
          <p>Under the Australian Privacy Principles, you have the right to:</p>
          <ul>
            <li><strong>Access</strong> your personal information — you can view your data in the parent portal at any time (APP 12)</li>
            <li><strong>Correct</strong> your personal information — you can update your details through the portal or by contacting us (APP 13)</li>
            <li><strong>Request deletion</strong> — contact us to request removal of your data, subject to any legal retention requirements</li>
            <li><strong>Complain</strong> — if you believe we have breached the APPs, contact us first. If unsatisfied, you may lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at <em>www.oaic.gov.au</em></li>
          </ul>

          <h2>8. Data retention</h2>
          <ul>
            <li>Active client records are kept while your family is enrolled</li>
            <li>Inactive records are archived (not deleted) and retained for a reasonable period in case you return</li>
            <li>Audit logs are retained for 7 years for compliance purposes</li>
            <li>You may request deletion of your data at any time by contacting us</li>
          </ul>

          <h2>9. Third-party services</h2>
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Purpose</th>
                <th>Data shared</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Supabase</td>
                <td>Database and authentication</td>
                <td>All application data (encrypted at rest)</td>
              </tr>
              <tr>
                <td>Stripe</td>
                <td>Payment processing</td>
                <td>Payment tokens and transaction data only</td>
              </tr>
              <tr>
                <td>Vercel</td>
                <td>Application hosting</td>
                <td>No persistent data storage</td>
              </tr>
            </tbody>
          </table>
          <p>
            We do not share your personal information with any other third parties.
          </p>

          <h2>10. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. Material changes will be communicated through
            the application. The &quot;last updated&quot; date at the top of this page indicates when
            the policy was last revised.
          </p>

          <h2>11. Contact us</h2>
          <p>
            If you have questions about this privacy policy or wish to make a complaint, contact:
          </p>
          <p>
            <strong>Maxim Sirota</strong><br />
            Sunrise Tennis<br />
            Somerton Park Tennis Club<br />
            40 Wilton Ave, Somerton Park SA 5044<br />
            Phone: 0431 368 752
          </p>
        </div>
      </div>
    </div>
  )
}
