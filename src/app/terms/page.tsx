import Link from 'next/link'
import { Sun, ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Terms of Service — Sunrise Tennis',
}

export default function TermsPage() {
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
            Terms of Service
          </h1>
        </div>

        <div className="prose prose-sm max-w-none text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">
          <p className="text-xs">Last updated: 19 March 2026</p>

          <h2>1. About this service</h2>
          <p>
            Sunrise Tennis provides an online platform for managing tennis coaching sessions, bookings,
            payments and team communication at Somerton Park Tennis Club, Adelaide, South Australia.
            The platform is operated by Maxim Sirota (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
          </p>

          <h2>2. Accounts</h2>
          <ul>
            <li>Accounts are created by invitation. You must be invited by an administrator to register.</li>
            <li>You are responsible for keeping your login credentials secure.</li>
            <li>Parent/guardian accounts manage data on behalf of their children (players).</li>
            <li>You must provide accurate information and keep it up to date.</li>
          </ul>

          <h2>3. Bookings and enrolments</h2>
          <ul>
            <li>Session bookings and program enrolments are subject to availability and coach discretion.</li>
            <li>We reserve the right to cancel or reschedule sessions due to weather, court availability, or other operational reasons.</li>
            <li>Cancellation policies are communicated at the time of booking. Makeup sessions may be offered at our discretion.</li>
          </ul>

          <h2>4. Payments</h2>
          <ul>
            <li>All prices are in Australian Dollars (AUD) and are inclusive of GST where applicable.</li>
            <li>Card payments are processed securely by <strong>Stripe</strong>. Your card details are handled directly by Stripe and never stored on our servers.</li>
            <li>Bank transfers and cash payments are recorded manually by the administrator.</li>
            <li>Outstanding balances are expected to be settled promptly. We may suspend bookings for accounts with overdue balances.</li>
            <li>Refunds are handled on a case-by-case basis. Contact us to discuss.</li>
          </ul>

          <h2>5. Media consent</h2>
          <p>
            We may take photos or videos during coaching sessions for coaching purposes (e.g. technique
            analysis). Media consent is managed per player and can be updated at any time through your
            account settings. We will not publish or share any media of players without active consent.
          </p>

          <h2>6. Acceptable use</h2>
          <p>When using the platform, you agree not to:</p>
          <ul>
            <li>Share your account credentials with others</li>
            <li>Attempt to access another family&apos;s data</li>
            <li>Send abusive, threatening, or inappropriate content through team messages</li>
            <li>Use automated tools to access or scrape the platform</li>
          </ul>

          <h2>7. Privacy</h2>
          <p>
            Your use of this platform is also governed by our{' '}
            <Link href="/privacy" className="text-primary hover:text-primary/80">
              Privacy Policy
            </Link>
            , which explains how we collect, use, and protect your personal information.
          </p>

          <h2>8. Limitation of liability</h2>
          <p>
            The platform is provided &quot;as is&quot;. While we take reasonable steps to ensure the
            platform is available and accurate, we do not guarantee uninterrupted access or that all
            information is error-free. We are not liable for any indirect or consequential loss arising
            from your use of the platform.
          </p>
          <p>
            Nothing in these terms limits any rights you may have under Australian Consumer Law.
          </p>

          <h2>9. Changes to these terms</h2>
          <p>
            We may update these terms from time to time. Material changes will be communicated through
            the application. Continued use of the platform after changes are posted constitutes
            acceptance of the updated terms.
          </p>

          <h2>10. Governing law</h2>
          <p>
            These terms are governed by the laws of South Australia. Any disputes will be subject to
            the jurisdiction of the courts of South Australia.
          </p>

          <h2>11. Contact us</h2>
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
