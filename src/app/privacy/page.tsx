import type { Metadata } from 'next'
import { LegalPageShell, type LegalSection } from '@/components/legal-page-shell'
import { getAuthHomeContext } from '@/lib/auth/dashboard-url'

export const metadata: Metadata = {
  title: 'Privacy Policy | Sunrise Tennis',
  description:
    'How Sunrise Tennis collects, uses, and protects your personal information.',
  alternates: { canonical: 'https://sunrisetennis.com.au/privacy' },
}

const SECTIONS: LegalSection[] = [
  { id: 'about', label: '1. About this policy' },
  { id: 'information', label: '2. Information we collect' },
  { id: 'use', label: '3. How we use your information' },
  { id: 'access', label: '4. Who can access' },
  { id: 'storage', label: '5. Storage & protection' },
  { id: 'children', label: "6. Children's data" },
  { id: 'rights', label: '7. Your rights' },
  { id: 'retention', label: '8. Data retention' },
  { id: 'third-party', label: '9. Third-party services' },
  { id: 'changes', label: '10. Changes to policy' },
  { id: 'contact', label: '11. Contact us' },
]

export default async function PrivacyPage() {
  const { homeHref, homeLabel } = await getAuthHomeContext()
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="16 April 2026" sections={SECTIONS} homeHref={homeHref} homeLabel={homeLabel}>
      <h2 id="about">1. About this policy</h2>
      <p>
        Sunrise Tennis PTY LTD (ACN 696 546 531, ABN 38 696 546 531) — trading as Sunrise Tennis
        (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) — operates a tennis coaching business based at Somerton Park
        Tennis Club, Adelaide, South Australia. This policy explains how we collect, use, store and
        disclose your personal information in accordance with the Australian Privacy Act 1988 (Cth)
        and the Australian Privacy Principles (APPs).
      </p>
      <p>
        Because we collect health information (such as injuries, medical conditions and physical
        limitations) to keep players safe during coaching sessions, we are covered by the Privacy
        Act regardless of our annual turnover.
      </p>

      <h2 id="information">2. Information we collect</h2>
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

      <h2 id="use">3. How we use your information</h2>
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

      <h2 id="access">4. Who can access your information</h2>
      <ul>
        <li><strong>Administrators</strong> — can access all data for business management</li>
        <li><strong>Coaches</strong> — can access player profiles and medical notes for players in their sessions</li>
        <li><strong>Parents/guardians</strong> — can view and edit only their own family&apos;s information</li>
      </ul>
      <p>
        Access is enforced at the database level using row-level security policies. No user can
        access another family&apos;s data through the application.
      </p>

      <h2 id="storage">5. How we store and protect your information</h2>
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

      <h2 id="children">6. Children&apos;s data</h2>
      <p>
        Most of our players are children and young people. All data relating to minors is collected
        with the knowledge and consent of their parent or guardian, who manages the account on their
        behalf. Parents can view, edit, or request deletion of their children&apos;s data at any time
        through their portal or by contacting us directly.
      </p>

      <h2 id="rights">7. Your rights</h2>
      <p>Under the Australian Privacy Principles, you have the right to:</p>
      <ul>
        <li><strong>Access</strong> your personal information — you can view your data in the parent portal at any time (APP 12)</li>
        <li><strong>Correct</strong> your personal information — you can update your details through the portal or by contacting us (APP 13)</li>
        <li><strong>Request deletion</strong> — contact us to request removal of your data, subject to any legal retention requirements</li>
        <li><strong>Complain</strong> — if you believe we have breached the APPs, contact us first. If unsatisfied, you may lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at <em>www.oaic.gov.au</em></li>
      </ul>

      <h2 id="retention">8. Data retention</h2>
      <ul>
        <li>Active client records are kept while your family is enrolled</li>
        <li>Inactive records are archived (not deleted) and retained for a reasonable period in case you return</li>
        <li>Audit logs are retained for 7 years for compliance purposes</li>
        <li>You may request deletion of your data at any time by contacting us</li>
      </ul>

      <h2 id="third-party">9. Third-party services</h2>
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
          <tr>
            <td>Upstash</td>
            <td>Rate limiting (abuse protection)</td>
            <td>IP addresses and request counts, short retention</td>
          </tr>
          <tr>
            <td>Google (Gemini)</td>
            <td>Sports voucher OCR (on upload)</td>
            <td>Uploaded voucher image only, not retained by Google</td>
          </tr>
        </tbody>
      </table>
      <p>We do not share your personal information with any other third parties.</p>

      <h2 id="changes">10. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be communicated through
        the application. The &quot;last updated&quot; date at the top of this page indicates when
        the policy was last revised.
      </p>

      <h2 id="contact">11. Contact us</h2>
      <p>If you have questions about this privacy policy or wish to make a complaint, contact:</p>
      <p>
        <strong>Maxim Paskalutsa</strong> (Director, Head Coach)<br />
        Sunrise Tennis PTY LTD<br />
        Somerton Park Tennis Club<br />
        40 Wilton Ave, Somerton Park SA 5044<br />
        Phone: <a href="tel:0431368752">0431 368 752</a><br />
        Email: <a href="mailto:info@sunrisetennis.com.au">info@sunrisetennis.com.au</a>
      </p>
    </LegalPageShell>
  )
}
