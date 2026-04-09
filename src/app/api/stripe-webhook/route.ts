import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe/client'
import type Stripe from 'stripe'

/**
 * Stripe webhook handler.
 * Verifies the signature using the Stripe SDK (which uses timing-safe
 * comparison internally), then handles:
 *   - payment_intent.succeeded → flip payments.status pending → received
 *   - payment_intent.payment_failed → status overdue
 *   - charge.refunded → status refunded + balance debit
 *
 * Idempotent: only updates rows still in their pre-event state, so retries
 * are safe.
 */

// Stripe webhooks need the raw request body to verify the signature.
// Next.js App Router gives us the raw body via request.text().
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signingSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, signingSecret)
  } catch (e) {
    console.error('Stripe webhook signature verification failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Service role is required: webhook runs without a user session
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent
    const { data: updated } = await supabase
      .from('payments')
      .update({ status: 'received', received_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', intent.id)
      .eq('status', 'pending')
      .select('id, family_id, recorded_by')

    if (!updated?.length) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    // Recalculate the family balance via the same RPC the parent flow uses
    const familyId = updated[0].family_id
    if (familyId) {
      await supabase.rpc('recalculate_family_balance', { target_family_id: familyId })
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent
    await supabase
      .from('payments')
      .update({ status: 'overdue', notes: 'Payment failed via Stripe' })
      .eq('stripe_payment_intent_id', intent.id)
      .neq('status', 'overdue')
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const intentId = typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id
    if (!intentId) {
      return NextResponse.json({ received: true, ignored: 'no payment_intent' })
    }

    const { data: original } = await supabase
      .from('payments')
      .select('family_id, status')
      .eq('stripe_payment_intent_id', intentId)
      .single()

    if (!original || original.status === 'refunded') {
      return NextResponse.json({ received: true, duplicate: true })
    }

    await supabase
      .from('payments')
      .update({ status: 'refunded' })
      .eq('stripe_payment_intent_id', intentId)

    // Recalculate balance from ground truth (refunded payments excluded by RPC)
    if (original.family_id) {
      await supabase.rpc('recalculate_family_balance', { target_family_id: original.family_id })
    }
  }

  return NextResponse.json({ received: true })
}
