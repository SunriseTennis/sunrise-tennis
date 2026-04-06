import { NextResponse } from 'next/server'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { recalculateBalance, allocatePayment } from '@/lib/utils/billing'
import { sendNotificationToTarget } from '@/lib/push/send'
import { formatCurrency } from '@/lib/utils/currency'

interface PaymentEntry {
  familyId: string
  amountCents: number
  paymentMethod: string
  notes: string | null
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const supabase = await createClient()

    const body = await request.json()
    const payments: PaymentEntry[] = body.payments

    if (!payments || payments.length === 0) {
      return NextResponse.json({ error: 'No payments provided' }, { status: 400 })
    }

    if (payments.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 payments per batch' }, { status: 400 })
    }

    let successCount = 0
    let totalCents = 0

    for (const p of payments) {
      if (!p.familyId || p.amountCents <= 0) continue

      const { data: payment, error } = await supabase
        .from('payments')
        .insert({
          family_id: p.familyId,
          amount_cents: p.amountCents,
          payment_method: p.paymentMethod,
          status: 'received',
          notes: p.notes,
          received_at: new Date().toISOString(),
          recorded_by: user.id,
        })
        .select('id')
        .single()

      if (error || !payment) {
        console.error(`Bulk payment failed for family ${p.familyId}:`, error?.message)
        continue
      }

      // Recalculate balance and allocate
      await recalculateBalance(supabase, p.familyId)
      await allocatePayment(supabase, payment.id)

      // Send receipt notification
      try {
        await sendNotificationToTarget({
          title: 'Payment Received',
          body: `Payment of ${formatCurrency(p.amountCents)} received - thank you!`,
          url: '/parent/payments',
          targetType: 'family',
          targetId: p.familyId,
        })
      } catch {
        // Non-critical
      }

      successCount++
      totalCents += p.amountCents
    }

    return NextResponse.json({ count: successCount, totalCents })
  } catch (e) {
    console.error('Bulk payment error:', e)
    return NextResponse.json({ error: 'Unauthorized or server error' }, { status: 401 })
  }
}
