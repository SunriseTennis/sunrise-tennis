'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { validateFormData, recordPaymentFormSchema, createInvoiceFormSchema } from '@/lib/utils/validation'
import { recalculateBalance, createCharge, allocatePayment, voidPayment as voidPaymentUtil, waiveCharge as waiveChargeUtil } from '@/lib/utils/billing'
import { sendNotificationToTarget } from '@/lib/push/send'
import { formatCurrency } from '@/lib/utils/currency'

// ── Record Payment ──────────────────────────────────────────────────────

export async function recordPayment(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, recordPaymentFormSchema)
  if (!parsed.success) {
    redirect('/admin/payments?error=' + encodeURIComponent(parsed.error))
  }

  const { family_id: familyId, amount_dollars: amountDollars, payment_method: paymentMethod, category, description, notes, status } = parsed.data

  const amountCents = Math.round(parseFloat(amountDollars) * 100)
  if (amountCents <= 0) {
    redirect('/admin/payments?error=' + encodeURIComponent('Amount must be greater than zero'))
  }

  const { error } = await supabase
    .from('payments')
    .insert({
      family_id: familyId,
      amount_cents: amountCents,
      payment_method: paymentMethod,
      status: status || 'received',
      category: category || null,
      description: description || null,
      notes: notes || null,
      received_at: (status || 'received') === 'received' ? new Date().toISOString() : null,
      recorded_by: user?.id,
    })

  if (error) {
    redirect('/admin/payments?error=' + encodeURIComponent(error.message))
  }

  // Recalculate family balance (single source of truth)
  await recalculateBalance(supabase, familyId)

  // Allocate payment to charges (FIFO)
  if ((status || 'received') === 'received') {
    const { data: newPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (newPayment) {
      await allocatePayment(supabase, newPayment.id)
    }

    // Send payment receipt notification to parent
    try {
      await sendNotificationToTarget({
        title: 'Payment Received',
        body: `Payment of ${formatCurrency(amountCents)} received - thank you!`,
        url: '/parent/payments',
        targetType: 'family',
        targetId: familyId,
      })
    } catch (e) {
      console.error('Failed to send payment receipt notification:', e)
    }
  }

  revalidatePath('/admin/payments')
  revalidatePath('/admin')
  revalidatePath(`/admin/families/${familyId}`)
  redirect('/admin/payments')
}

// ── Confirm Pending Payment ──────────────────────────────────────────────

export async function confirmPayment(paymentId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('family_id, amount_cents, status')
    .eq('id', paymentId)
    .single()

  if (fetchError || !payment) {
    redirect('/admin/payments?error=' + encodeURIComponent('Payment not found'))
  }

  if (payment.status === 'received') {
    redirect('/admin/payments?error=' + encodeURIComponent('Payment already confirmed'))
  }

  const { error } = await supabase
    .from('payments')
    .update({
      status: 'received',
      received_at: new Date().toISOString(),
    })
    .eq('id', paymentId)

  if (error) {
    redirect('/admin/payments?error=' + encodeURIComponent(error.message))
  }

  // Recalculate balance (single source of truth)
  await recalculateBalance(supabase, payment.family_id)

  // Allocate payment to charges (FIFO)
  await allocatePayment(supabase, paymentId)

  // Send payment receipt notification to parent
  try {
    await sendNotificationToTarget({
      title: 'Payment Received',
      body: `Payment of ${formatCurrency(payment.amount_cents)} received - thank you!`,
      url: '/parent/payments',
      targetType: 'family',
      targetId: payment.family_id,
    })
  } catch (e) {
    console.error('Failed to send payment receipt notification:', e)
  }

  revalidatePath('/admin/payments')
  revalidatePath('/admin')
  redirect('/admin/payments')
}

// ── Create Invoice ──────────────────────────────────────────────────────

export async function createInvoice(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, createInvoiceFormSchema)
  if (!parsed.success) {
    redirect('/admin/payments/invoices?error=' + encodeURIComponent(parsed.error))
  }

  const { family_id: familyId, amount_dollars: amountDollars, description, due_date: dueDate } = parsed.data

  const amountCents = Math.round(parseFloat(amountDollars) * 100)

  // Generate next invoice display_id
  const currentYear = new Date().getFullYear()
  const { data: lastInvoice } = await supabase
    .from('invoices')
    .select('display_id')
    .like('display_id', `INV-${currentYear}-%`)
    .order('display_id', { ascending: false })
    .limit(1)
    .single()

  let nextNum = 1
  if (lastInvoice?.display_id) {
    const match = lastInvoice.display_id.match(/INV-\d{4}-(\d+)/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  const displayId = `INV-${currentYear}-${String(nextNum).padStart(3, '0')}`

  const items = description ? [{ description, amount_cents: amountCents }] : []

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      display_id: displayId,
      family_id: familyId,
      amount_cents: amountCents,
      status: 'sent',
      due_date: dueDate || null,
      items,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    redirect('/admin/payments/invoices?error=' + encodeURIComponent(error.message))
  }

  // Create a corresponding charge row linked to this invoice
  await createCharge(supabase, {
    familyId,
    type: 'adjustment',
    sourceType: 'admin',
    description: description || `${displayId} charge`,
    amountCents,
    status: 'pending',
    invoiceId: invoice.id,
    createdBy: user.id,
  })

  // Balance is recalculated inside createCharge — no manual math needed

  revalidatePath('/admin/payments')
  revalidatePath('/admin/payments/invoices')
  revalidatePath('/admin')
  redirect('/admin/payments/invoices')
}

// ── Generate Invoice from Unbilled Charges ─────────────────────────────

export async function generateInvoiceFromCharges(familyId: string, dueDate?: string) {
  const user = await requireAdmin()
  const supabase = await createClient()

  // Get all unbilled pending/confirmed charges for this family
  const { data: unbilledCharges, error: fetchError } = await supabase
    .from('charges')
    .select('id, description, amount_cents, status')
    .eq('family_id', familyId)
    .is('invoice_id', null)
    .in('status', ['pending', 'confirmed'])
    .gt('amount_cents', 0)
    .order('created_at', { ascending: true })

  if (fetchError || !unbilledCharges || unbilledCharges.length === 0) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent('No unbilled charges found')}`)
  }

  const totalCents = unbilledCharges.reduce((sum, c) => sum + c.amount_cents, 0)
  const items = unbilledCharges.map(c => ({
    description: c.description,
    amount_cents: c.amount_cents,
  }))

  // Generate next invoice display_id
  const currentYear = new Date().getFullYear()
  const { data: lastInvoice } = await supabase
    .from('invoices')
    .select('display_id')
    .like('display_id', `INV-${currentYear}-%`)
    .order('display_id', { ascending: false })
    .limit(1)
    .single()

  let nextNum = 1
  if (lastInvoice?.display_id) {
    const match = lastInvoice.display_id.match(/INV-\d{4}-(\d+)/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  const displayId = `INV-${currentYear}-${String(nextNum).padStart(3, '0')}`

  const { data: invoice, error: insertError } = await supabase
    .from('invoices')
    .insert({
      display_id: displayId,
      family_id: familyId,
      amount_cents: totalCents,
      status: 'sent',
      due_date: dueDate || null,
      items,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !invoice) {
    redirect(`/admin/families/${familyId}?error=${encodeURIComponent(insertError?.message || 'Failed to create invoice')}`)
  }

  // Link all unbilled charges to this invoice
  const chargeIds = unbilledCharges.map(c => c.id)
  await supabase
    .from('charges')
    .update({ invoice_id: invoice.id })
    .in('id', chargeIds)

  // No balance change — charges already exist, we're just grouping them into an invoice

  revalidatePath('/admin/payments')
  revalidatePath('/admin/payments/invoices')
  revalidatePath(`/admin/families/${familyId}`)
  redirect('/admin/payments/invoices')
}

// ── Send Overdue Payment Reminders ─────────────────────────────────────

export async function sendOverdueReminders() {
  await requireAdmin()
  const supabase = await createClient()

  // Find families with negative balance (they owe money)
  const { data: overdueBalances } = await supabase
    .from('family_balance')
    .select('family_id, balance_cents')
    .lt('balance_cents', 0)

  if (!overdueBalances || overdueBalances.length === 0) {
    redirect('/admin/payments?success=' + encodeURIComponent('No overdue balances found'))
  }

  let sentCount = 0

  for (const entry of overdueBalances) {
    const amountOwed = Math.abs(entry.balance_cents)
    const dollars = (amountOwed / 100).toFixed(2)

    try {
      await sendNotificationToTarget({
        title: 'Payment Reminder',
        body: `You have an outstanding balance of $${dollars}. Please make a payment at your earliest convenience.`,
        url: '/parent/payments',
        targetType: 'family',
        targetId: entry.family_id,
      })
      sentCount++
    } catch (e) {
      console.error(`Failed to send reminder to family ${entry.family_id}:`, e)
    }
  }

  redirect('/admin/payments?success=' + encodeURIComponent(`Sent ${sentCount} overdue reminder(s)`))
}

// ── Void (Soft-Delete) a Payment ──────────────────────────────────────

export async function voidPaymentAction(paymentId: string) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('family_id, amount_cents, status')
    .eq('id', paymentId)
    .single()

  if (fetchError || !payment) {
    redirect('/admin/payments?error=' + encodeURIComponent('Payment not found'))
  }

  if (payment.status === 'voided') {
    redirect('/admin/payments?error=' + encodeURIComponent('Payment already voided'))
  }

  await voidPaymentUtil(supabase, paymentId, payment.family_id, user.id)

  revalidatePath('/admin/payments')
  revalidatePath('/admin')
  revalidatePath(`/admin/families/${payment.family_id}`)
  redirect('/admin/payments?success=' + encodeURIComponent('Payment voided'))
}

// ── Waive a Charge ────────────────────────────────────────────────────

export async function waiveChargeAction(chargeId: string, reason?: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: charge, error: fetchError } = await supabase
    .from('charges')
    .select('family_id, description, amount_cents, status')
    .eq('id', chargeId)
    .single()

  if (fetchError || !charge) {
    redirect('/admin/payments?error=' + encodeURIComponent('Charge not found'))
  }

  if (charge.status === 'voided') {
    redirect('/admin/payments?error=' + encodeURIComponent('Charge already voided'))
  }

  await waiveChargeUtil(supabase, chargeId, charge.family_id, reason)

  revalidatePath('/admin/payments')
  revalidatePath('/admin')
  revalidatePath(`/admin/families/${charge.family_id}`)
}
