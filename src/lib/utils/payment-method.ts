// Central label map for payment_method values. Used by admin/payments table,
// /admin/families/[id]/statement, parent payment history, and the record-
// payment form's option labels. The Zod source of truth is
// paymentMethodSchema in validation.ts.
//
// square_ftd is an external pre-Sunrise credit (Square payments to Foundation
// Tennis Development honoured on Sunrise accounts). It counts toward family
// balance like any other payment but is filtered out of /admin/payments and
// /admin/reports totals so it never appears as Sunrise revenue.

const LABELS: Record<string, string> = {
  stripe: 'Card',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  direct_debit: 'Direct debit',
  square_ftd: 'Square (FTD)',
}

export function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return '-'
  return LABELS[method] ?? method.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
