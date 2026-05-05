'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { validateFormData } from '@/lib/utils/validation'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { getStripe } from '@/lib/stripe/client'
import { getOrCreateStripeCustomerForFamily } from '@/lib/stripe/customer'

const createPaymentIntentSchema = z.object({
  family_id: z.string().uuid('Invalid family'),
  amount_dollars: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Valid amount is required'),
  description: z.string().max(500).optional().or(z.literal('')),
  invoice_id: z.string().uuid().optional().or(z.literal('')),
})

export type CreatePaymentIntentResult =
  | { ok: true; clientSecret: string; paymentIntentId: string; amountCents: number }
  | { ok: false; error: string }

/**
 * Create a Stripe PaymentIntent for a parent-initiated payment.
 * Inserts a `payments` row in `pending` state with the PaymentIntent id.
 * The Stripe webhook flips it to `received` on `payment_intent.succeeded`.
 *
 * Returns the client secret to the browser, which uses it to confirm the
 * payment via Stripe Elements without the card data ever touching our servers.
 */
export async function createPaymentIntent(formData: FormData): Promise<CreatePaymentIntentResult> {
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const parsed = validateFormData(formData, createPaymentIntentSchema)
  if (!parsed.success) {
    return { ok: false, error: parsed.error }
  }

  const { family_id: familyId, amount_dollars: amountDollars, description, invoice_id: invoiceId } = parsed.data

  // Verify the authenticated user owns this family before charging
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  if (!userRole || userRole.family_id !== familyId) {
    return { ok: false, error: 'Unauthorized' }
  }

  // Plan 15 Phase C — gate on approval status. Pending families can't pay.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: famGate } = await (supabase as any)
    .from('families')
    .select('approval_status')
    .eq('id', familyId)
    .single()
  if (famGate?.approval_status !== 'approved') {
    return { ok: false, error: 'Your account is awaiting approval. You can pay once it has been approved.' }
  }

  // Rate limit: 3 payment attempts per minute per user
  if (!checkRateLimit(`payment:${user.id}`, 3, 60_000)) {
    return { ok: false, error: 'Too many payment attempts. Please wait a minute.' }
  }

  const amountCents = Math.round(parseFloat(amountDollars) * 100)
  if (amountCents < 100) {
    return { ok: false, error: 'Minimum payment is $1.00' }
  }

  const stripe = getStripe()

  let customerId: string
  try {
    customerId = await getOrCreateStripeCustomerForFamily(supabase, familyId)
  } catch (e) {
    console.error('Stripe customer lookup/create failed:', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Payment could not be initialised. Please try again.' }
  }

  let intent
  try {
    intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'aud',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      description: description || 'Sunrise Tennis payment',
      metadata: {
        family_id: familyId,
        user_id: user.id,
        invoice_id: invoiceId || '',
      },
    })
  } catch (e) {
    console.error('Stripe createPaymentIntent failed:', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Payment could not be initialised. Please try again.' }
  }

  // Record pending payment in our DB. Webhook will flip status to 'received'.
  const { error } = await supabase
    .from('payments')
    .insert({
      family_id: familyId,
      amount_cents: amountCents,
      payment_method: 'stripe',
      status: 'pending',
      stripe_payment_intent_id: intent.id,
      invoice_id: invoiceId || null,
      description: description || null,
      category: null,
      recorded_by: user.id,
    })

  if (error) {
    console.error('Payment row insert failed (intent created on Stripe):', error.message, 'PI:', intent.id)
    return { ok: false, error: 'Payment could not be recorded. Please contact admin.' }
  }

  if (!intent.client_secret) {
    return { ok: false, error: 'Payment could not be initialised.' }
  }

  return { ok: true, clientSecret: intent.client_secret, paymentIntentId: intent.id, amountCents }
}

/**
 * Called by the client component after Stripe.confirmPayment() returns
 * successfully but BEFORE the webhook arrives. Lets us refresh the page
 * with optimistic UI; the webhook is the source of truth for the actual
 * status flip from 'pending' → 'received'.
 */
export async function paymentRedirectAfterSuccess() {
  revalidatePath('/parent/payments')
  revalidatePath('/parent')
  redirect('/parent/payments?success=Payment+processed+successfully')
}
