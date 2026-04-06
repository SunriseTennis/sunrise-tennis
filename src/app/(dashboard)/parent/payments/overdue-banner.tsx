'use client'

import { AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateFriendly } from '@/lib/utils/dates'

export function OverdueBanner({
  amountCents,
  oldestChargeDate,
}: {
  amountCents: number
  oldestChargeDate: string | null
}) {
  const owedCents = Math.abs(amountCents)

  return (
    <div className="animate-fade-up rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <AlertTriangle className="size-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">
            Payment of {formatCurrency(-owedCents)} is overdue
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            {oldestChargeDate
              ? `Outstanding since ${formatDateFriendly(oldestChargeDate)}. `
              : ''}
            Please make a payment to keep your account in good standing.
          </p>
        </div>
      </div>
    </div>
  )
}
