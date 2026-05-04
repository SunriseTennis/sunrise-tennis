/**
 * Plan 18 — Branded invitation email via Resend REST API.
 *
 * Called from `createInvitation` and `resendInvitationEmail` server
 * actions. Looks up the invitation by id, formats a brand-styled email
 * with the signup CTA, and fires via the existing `sendBrandedEmail`
 * helper. Fire-and-forget — failures are logged, never thrown, so the
 * admin redirect always completes.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { sendBrandedEmail } from './send-email'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://sunrisetennis.com.au'

interface SendInvitationEmailArgs {
  invitationId: string
}

export async function sendInvitationEmail({ invitationId }: SendInvitationEmailArgs): Promise<void> {
  const service = createServiceClient()

  const { data: inv, error } = await service
    .from('invitations')
    .select('id, family_id, email, token, status, expires_at')
    .eq('id', invitationId)
    .single()

  if (error || !inv) {
    console.error('[invitation-email] lookup failed:', error)
    return
  }

  if (inv.status !== 'pending') {
    console.warn('[invitation-email] skipping non-pending invitation', invitationId, inv.status)
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: family } = await (service as any)
    .from('families')
    .select('family_name')
    .eq('id', inv.family_id)
    .single()

  const familyName: string = family?.family_name ?? 'your family'
  const inviteUrl = `${SITE_URL.replace(/\/$/, '')}/signup?invite=${encodeURIComponent(inv.token)}`

  const expiresAt = inv.expires_at
    ? new Date(inv.expires_at as string).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  const subject = `Welcome to Sunrise Tennis — finish setting up your account`
  const preheader = `Your ${familyName} family account is ready. Tap to finish.`
  const expiryLine = expiresAt
    ? `\n\nThis link expires on ${expiresAt}. If it stops working, just reply to this email and we'll send a fresh one.`
    : `\n\nIf the link stops working, just reply to this email and we'll send a fresh one.`

  const bodyMarkdown = `Maxim has set up a Sunrise Tennis account for the ${familyName} family.

Tap the button below to finish setting up your login. It takes about a minute — confirm your contact details, check your players, enable notifications, and you're done.${expiryLine}

If you weren't expecting this, you can safely ignore the email.`

  await sendBrandedEmail({
    to: inv.email,
    subject,
    preheader,
    bodyMarkdown,
    ctaLabel: 'Finish setting up',
    ctaUrl: inviteUrl,
  })
}
