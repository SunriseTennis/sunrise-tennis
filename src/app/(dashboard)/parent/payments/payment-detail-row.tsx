'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { StatusBadge } from '@/components/status-badge'
import { ChevronDown, ChevronRight, CheckCircle2, Clock, CloudRain, XCircle } from 'lucide-react'

interface Allocation {
  amountCents: number
  chargeDescription: string
  sessionDate: string | null
  sessionStatus: string | null
}

function SessionStatusIcon({ status }: { status: string | null }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-success" />
    case 'scheduled':
      return <Clock className="size-3.5 text-primary" />
    case 'rained_out':
      return <CloudRain className="size-3.5 text-warning" />
    case 'cancelled':
      return <XCircle className="size-3.5 text-danger" />
    default:
      return null
  }
}

export function PaymentDetailRow({
  payment,
  allocations,
}: {
  payment: {
    id: string
    date: string
    description: string
    method: string
    amountCents: number
    status: string
  }
  allocations: Allocation[]
}) {
  const [expanded, setExpanded] = useState(false)
  const hasAllocations = allocations.length > 0

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <button
        onClick={() => hasAllocations && setExpanded(!expanded)}
        className={`flex w-full items-center justify-between p-4 text-left ${
          hasAllocations ? 'hover:bg-muted/30 cursor-pointer' : 'cursor-default'
        } transition-colors`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground tabular-nums">
              {payment.date ? formatDate(payment.date) : '-'}
            </p>
            <StatusBadge status={payment.status} />
          </div>
          <p className="mt-0.5 text-sm text-foreground truncate">
            {payment.description}
          </p>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">
            {payment.method.replace('_', ' ')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="text-lg font-bold tabular-nums text-success">
            {formatCurrency(payment.amountCents)}
          </span>
          {hasAllocations && (
            expanded
              ? <ChevronDown className="size-4 text-muted-foreground" />
              : <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && allocations.length > 0 && (
        <div className="border-t border-border bg-muted/20">
          <p className="px-4 pt-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Applied to
          </p>
          {allocations.map((alloc, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-4 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <SessionStatusIcon status={alloc.sessionStatus} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">{alloc.chargeDescription}</p>
                  {alloc.sessionDate && (
                    <p className="text-xs text-muted-foreground">
                      {formatDate(alloc.sessionDate)}
                      {alloc.sessionStatus && (
                        <span className="ml-1.5 capitalize">
                          ({alloc.sessionStatus.replace('_', ' ')})
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
              <span className="tabular-nums font-medium text-foreground shrink-0 ml-3">
                {formatCurrency(alloc.amountCents)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
