'use client'

import { useState, useMemo } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { EmptyState } from '@/components/empty-state'
import { CreditCard, ChevronDown, CheckCircle2, Clock, CloudRain, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

// SA school terms 2026 (approximate)
const TERMS: { label: string; start: string; end: string }[] = [
  { label: 'Term 1 2026', start: '2026-01-27', end: '2026-04-11' },
  { label: 'Term 2 2026', start: '2026-04-28', end: '2026-07-04' },
  { label: 'Term 3 2026', start: '2026-07-21', end: '2026-09-26' },
  { label: 'Term 4 2026', start: '2026-10-13', end: '2026-12-12' },
  { label: 'Term 4 2025', start: '2025-10-13', end: '2025-12-12' },
]

function getTermForDate(dateStr: string): string {
  const d = dateStr.slice(0, 10)
  for (const t of TERMS) {
    if (d >= t.start && d <= t.end) return t.label
  }
  for (const t of TERMS) {
    if (d < t.start) return t.label
  }
  return 'Other'
}

function getCurrentTerm(): string {
  const now = new Date().toISOString().slice(0, 10)
  return getTermForDate(now)
}

interface Allocation {
  amountCents: number
  chargeDescription: string
  sessionDate: string | null
  sessionStatus: string | null
}

interface Payment {
  id: string
  date: string
  description: string
  method: string
  amountCents: number
  status: string
  allocations: Allocation[]
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

function cleanDescription(desc: string): string {
  return desc.replace(/\s*-\s*\d{4}-\d{2}-\d{2}\s*$/, '')
}

function methodLabel(method: string): string {
  return method.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function PaymentCard({ payment }: { payment: Payment }) {
  const [expanded, setExpanded] = useState(false)
  const allocCount = payment.allocations.length
  const hasAllocations = allocCount > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => hasAllocations && setExpanded(!expanded)}
        disabled={!hasAllocations}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
          hasAllocations && 'hover:bg-muted/20 cursor-pointer',
          expanded && 'bg-muted/10',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground tabular-nums">
              {payment.date ? formatDate(payment.date) : '-'}
            </span>
            <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {methodLabel(payment.method)}
            </span>
            {hasAllocations && (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                Applied to {allocCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-foreground break-words">
            {payment.description}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="tabular-nums font-semibold text-success">
            {formatCurrency(payment.amountCents)}
          </span>
          {hasAllocations && (
            <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          )}
        </div>
      </button>

      {expanded && hasAllocations && (
        <div className="border-t border-border/30 bg-muted/5 px-4 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
            Applied to
          </p>
          <div className="space-y-1.5">
            {payment.allocations.map((alloc, i) => (
              <div key={i} className="flex items-start justify-between gap-2 text-xs">
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <span className="mt-0.5 shrink-0">
                    <SessionStatusIcon status={alloc.sessionStatus} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-foreground break-words">{cleanDescription(alloc.chargeDescription)}</p>
                    {alloc.sessionDate && (
                      <p className="text-muted-foreground tabular-nums">
                        {formatDate(alloc.sessionDate)}
                      </p>
                    )}
                  </div>
                </div>
                <span className="tabular-nums text-foreground shrink-0">
                  {formatCurrency(alloc.amountCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function PaymentHistory({ payments }: { payments: Payment[] }) {
  const availableTerms = useMemo(() => {
    const termSet = new Set<string>()
    for (const p of payments) {
      if (p.date) termSet.add(getTermForDate(p.date))
    }
    const ordered = TERMS.filter(t => termSet.has(t.label)).map(t => t.label)
    if (termSet.has('Other')) ordered.push('Other')
    return ordered
  }, [payments])

  const currentTerm = getCurrentTerm()
  const defaultTerm = availableTerms.includes(currentTerm) ? currentTerm : availableTerms[0] ?? ''
  const [selectedTerm, setSelectedTerm] = useState(defaultTerm)

  const filtered = useMemo(() => {
    if (!selectedTerm) return payments
    return payments.filter(p => p.date && getTermForDate(p.date) === selectedTerm)
  }, [payments, selectedTerm])

  const termTotal = filtered.reduce((sum, p) => sum + p.amountCents, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Payment History</h2>
        {availableTerms.length > 1 && (
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          >
            {availableTerms.map((term) => (
              <option key={term} value={term}>{term}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {selectedTerm || 'All'} - {filtered.length} payment{filtered.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs font-semibold text-foreground tabular-nums">
              {formatCurrency(termTotal)}
            </span>
          </div>
          <div className="divide-y divide-border/50">
            {filtered.map((payment) => (
              <PaymentCard key={payment.id} payment={payment} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={CreditCard}
          title="No payments this term"
          description="Payments will appear here once recorded."
          compact
        />
      )}
    </div>
  )
}
