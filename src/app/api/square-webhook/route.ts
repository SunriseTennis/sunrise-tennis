import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * Square webhook handler.
 * Receives payment.completed, payment.failed, refund.created events.
 * Verifies HMAC-SHA256 signature before processing.
 * Includes idempotency checks to prevent double-processing on retries.
 */
export async function POST(request: NextRequest) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!signatureKey) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // Read raw body for signature verification
  const body = await request.text()
  const signature = request.headers.get('x-square-hmacsha256-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  // Verify HMAC-SHA256 signature
  const url = request.url
  const hmac = crypto.createHmac('sha256', signatureKey)
  hmac.update(url + body)
  const expectedSignature = hmac.digest('base64')

  const sigBuffer = Buffer.from(signature, 'base64')
  const expectedBuffer = Buffer.from(expectedSignature, 'base64')
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body)
  const eventType = event.type

  // Use service role for webhook processing (no user context)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  if (eventType === 'payment.completed') {
    const squarePaymentId = event.data?.object?.payment?.id
    if (squarePaymentId) {
      // Idempotency: only update if still pending (prevents double-processing)
      const { data } = await supabase
        .from('payments')
        .update({ status: 'received', received_at: new Date().toISOString() })
        .eq('square_payment_id', squarePaymentId)
        .eq('status', 'pending')
        .select('id')

      if (!data?.length) {
        // Already processed or not found — return 200 to stop retries
        return NextResponse.json({ received: true, duplicate: true })
      }
    }
  } else if (eventType === 'payment.failed') {
    const squarePaymentId = event.data?.object?.payment?.id
    if (squarePaymentId) {
      await supabase
        .from('payments')
        .update({ status: 'overdue', notes: 'Payment failed via Square' })
        .eq('square_payment_id', squarePaymentId)
        .neq('status', 'overdue') // Idempotency: skip if already marked failed
    }
  } else if (eventType === 'refund.created') {
    const refund = event.data?.object?.refund
    const squarePaymentId = refund?.payment_id
    if (squarePaymentId) {
      // Idempotency: check if already refunded before processing
      const { data: originalPayment } = await supabase
        .from('payments')
        .select('family_id, status')
        .eq('square_payment_id', squarePaymentId)
        .single()

      if (originalPayment && originalPayment.status !== 'refunded') {
        const refundAmountCents = refund.amount_money?.amount ?? 0
        await supabase
          .from('payments')
          .update({ status: 'refunded' })
          .eq('square_payment_id', squarePaymentId)

        // Adjust family balance (debit back the refunded amount)
        const { data: balance } = await supabase
          .from('family_balance')
          .select('balance_cents')
          .eq('family_id', originalPayment.family_id)
          .single()

        if (balance) {
          await supabase
            .from('family_balance')
            .update({
              balance_cents: balance.balance_cents - refundAmountCents,
              last_updated: new Date().toISOString(),
            })
            .eq('family_id', originalPayment.family_id)
        }
      } else {
        // Already refunded — return 200 to stop retries
        return NextResponse.json({ received: true, duplicate: true })
      }
    }
  }

  return NextResponse.json({ received: true })
}
