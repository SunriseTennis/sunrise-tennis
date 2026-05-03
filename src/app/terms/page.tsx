import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageShell, type LegalSection } from '@/components/legal-page-shell'
import { getAuthHomeContext } from '@/lib/auth/dashboard-url'

export const metadata: Metadata = {
  title: 'Terms and Conditions | Sunrise Tennis',
  description:
    'Terms and conditions for Sunrise Tennis PTY LTD coaching services, bookings, and payments.',
  alternates: { canonical: 'https://sunrisetennis.com.au/terms' },
}

const SECTIONS: LegalSection[] = [
  { id: 'about', label: '1. About this service' },
  { id: 'accounts', label: '2. Accounts' },
  { id: 'bookings', label: '3. Bookings & cancellation' },
  { id: 'payments', label: '4. Payments' },
  { id: 'media', label: '5. Media consent' },
  { id: 'acceptable-use', label: '6. Acceptable use' },
  { id: 'privacy', label: '7. Privacy' },
  { id: 'liability', label: '8. Limitation of liability' },
  { id: 'changes', label: '9. Changes to terms' },
  { id: 'law', label: '10. Governing law' },
  { id: 'contact', label: '11. Contact us' },
]

export default async function TermsPage() {
  const { homeHref, homeLabel } = await getAuthHomeContext()
  return (
    <LegalPageShell title="Terms of Service" lastUpdated="16 April 2026" sections={SECTIONS} homeHref={homeHref} homeLabel={homeLabel}>
      <h2 id="about">1. About this service</h2>
      <p>
        Sunrise Tennis provides an online platform for managing tennis coaching sessions, bookings,
        payments and team communication at Somerton Park Tennis Club, Adelaide, South Australia.
        The platform is operated by Sunrise Tennis PTY LTD (ACN 696 546 531, ABN 38 696 546 531),
        trading as Sunrise Tennis (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). Director: Maxim Paskalutsa.
      </p>

      <h2 id="accounts">2. Accounts</h2>
      <ul>
        <li>Accounts are created by invitation. You must be invited by an administrator to register.</li>
        <li>You are responsible for keeping your login credentials secure.</li>
        <li>Parent/guardian accounts manage data on behalf of their children (players).</li>
        <li>You must provide accurate information and keep it up to date.</li>
      </ul>

      <h2 id="bookings">3. Bookings &amp; cancellation</h2>
      <ul>
        <li>Session bookings and program enrolments are subject to availability and coach discretion.</li>
        <li>We reserve the right to cancel or reschedule sessions due to weather, court availability, or other operational reasons.</li>
        <li>
          <strong>Cancellation policy (private lessons):</strong>
          <ul>
            <li><strong>First cancellation per term, per child — waived</strong> (no charge), provided notice is given before the session starts.</li>
            <li><strong>Late cancellation (less than 24 hours before start) — 50% of the session fee.</strong></li>
            <li><strong>No-show — 100% of the session fee.</strong></li>
            <li>Sunrise Tennis may waive or adjust these fees at its discretion (e.g. illness, family emergency).</li>
          </ul>
        </li>
        <li>Rainouts and coach-initiated cancellations are not charged, and makeup sessions may be offered where practical.</li>
      </ul>

      <h2 id="payments">4. Payments</h2>
      <ul>
        <li>All prices are in Australian Dollars (AUD) and are inclusive of GST where applicable.</li>
        <li>Card payments are processed securely by <strong>Stripe</strong>. Your card details are handled directly by Stripe and never stored on our servers.</li>
        <li>Bank transfers and cash payments are recorded manually by the administrator.</li>
        <li>A heads-up push notification is sent roughly 10 days before sessions add to your family balance. You can opt out in your notification preferences.</li>
        <li>Outstanding balances are expected to be settled promptly. We may suspend bookings for accounts with overdue balances.</li>
        <li>Refunds are handled on a case-by-case basis. Contact us to discuss.</li>
      </ul>

      <h2 id="media">5. Media consent</h2>
      <p>
        We may take photos or videos during coaching sessions for coaching purposes (e.g. technique
        analysis). Media consent is managed per player and can be updated at any time through your
        account settings. We will not publish or share any media of players without active consent.
      </p>

      <h2 id="acceptable-use">6. Acceptable use</h2>
      <p>When using the platform, you agree not to:</p>
      <ul>
        <li>Share your account credentials with others</li>
        <li>Attempt to access another family&apos;s data</li>
        <li>Send abusive, threatening, or inappropriate content through team messages</li>
        <li>Use automated tools to access or scrape the platform</li>
      </ul>

      <h2 id="privacy">7. Privacy</h2>
      <p>
        Your use of this platform is also governed by our{' '}
        <Link href="/privacy">Privacy Policy</Link>
        , which explains how we collect, use, and protect your personal information.
      </p>

      <h2 id="liability">8. Limitation of liability</h2>
      <p>
        The platform is provided &quot;as is&quot;. While we take reasonable steps to ensure the
        platform is available and accurate, we do not guarantee uninterrupted access or that all
        information is error-free. We are not liable for any indirect or consequential loss arising
        from your use of the platform.
      </p>
      <p>Nothing in these terms limits any rights you may have under Australian Consumer Law.</p>

      <h2 id="changes">9. Changes to these terms</h2>
      <p>
        We may update these terms from time to time. Material changes will be communicated through
        the application. Continued use of the platform after changes are posted constitutes
        acceptance of the updated terms.
      </p>

      <h2 id="law">10. Governing law</h2>
      <p>
        These terms are governed by the laws of South Australia. Any disputes will be subject to
        the jurisdiction of the courts of South Australia.
      </p>

      <h2 id="contact">11. Contact us</h2>
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
