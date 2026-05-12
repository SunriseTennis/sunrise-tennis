'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { waiveChargeAction } from '@/app/(dashboard)/admin/payments/actions'
import { Receipt, X } from 'lucide-react'

interface Charge {
  id: string
  description: string
  amount_cents: number
  status: string
  type: string
  created_at: string | null
  /** Session date when this charge is tied to a specific session; preferred over `created_at` for display. */
  session_date?: string | null
}

export function WaiveChargeSection({ charges }: { charges: Charge[] }) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function handleWaive(chargeId: string) {
    setPending(true)
    try {
      await waiveChargeAction(chargeId, 'Admin waiver')
      router.refresh()
    } catch {
      // Action redirects on error
    } finally {
      setPending(false)
      setConfirmingId(null)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold text-foreground">Outstanding Charges</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {charges.length} active charge{charges.length !== 1 ? 's' : ''}. Waiving a charge removes it from the balance.
        </p>

        <div className="mt-4 space-y-2">
          {charges.map((charge) => (
            <div
              key={charge.id}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Receipt className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">{charge.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {charge.session_date
                      ? formatDate(charge.session_date)
                      : charge.created_at
                        ? formatDate(charge.created_at)
                        : '-'}
                    {' - '}
                    <span className="capitalize">{charge.type}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(charge.amount_cents)}
                </span>
                {confirmingId === charge.id ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => handleWaive(charge.id)}
                    >
                      {pending ? 'Waiving...' : 'Confirm'}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setConfirmingId(null)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-muted-foreground hover:text-danger"
                    onClick={() => setConfirmingId(charge.id)}
                  >
                    Waive
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
