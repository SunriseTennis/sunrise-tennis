'use client'

import { useState, useMemo } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { EmptyState } from '@/components/empty-state'
import { CreditCard, ChevronDown, CheckCircle2, Clock, CloudRain, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { PricingBreakdownPanel, type PricingBreakdownData } from '@/components/pricing-breakdown-panel'

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
  programId?: string | null
  bookingId?: string | null
  programName?: string | null
  /** Itemised breakdown from charges.pricing_breakdown when present (e.g. term enrolment with discount). */
  pricingBreakdown?: PricingBreakdownData | null
}

interface AllocationBundle {
  /** Group key: bookingId when present, else `program-${programId}`, else `single-${idx}`. */
  key: string
  /** Program name for the header (when grouped). */
  programName: string | null
  /** Sum of allocation amounts in this bundle (cents). */
  totalCents: number
  /** Sum of (subtotal − total) across allocation breakdowns — i.e. total saved. */
  savingsCents: number
  /** Allocation rows in this bundle, sorted by session date ascending. */
  allocations: Allocation[]
}

function groupAllocations(allocations: Allocation[]): AllocationBundle[] {
  const groups = new Map<string, AllocationBundle>()
  allocations.forEach((a, idx) => {
    // Group by booking_id when set (term enrol / standing weekly), else by
    // program_id (looser fallback), else treat each row as its own bundle.
    const key = a.bookingId
      ? `booking-${a.bookingId}`
      : a.programId
        ? `program-${a.programId}`
        : `single-${idx}`
    const existing = groups.get(key)
    const breakdown = a.pricingBreakdown
    const rowSavings = breakdown && breakdown.subtotal_cents != null
      ? Math.max(0, breakdown.subtotal_cents - breakdown.total_cents)
      : 0
    if (existing) {
      existing.totalCents += a.amountCents
      existing.savingsCents += rowSavings
      existing.allocations.push(a)
    } else {
      groups.set(key, {
        key,
        programName: a.programName ?? null,
        totalCents: a.amountCents,
        savingsCents: rowSavings,
        allocations: [a],
      })
    }
  })
  for (const g of groups.values()) {
    g.allocations.sort((x, y) => {
      const a = x.sessionDate ?? ''
      const b = y.sessionDate ?? ''
      return a.localeCompare(b)
    })
  }
  return [...groups.values()]
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
          <div className="space-y-4">
            {groupAllocations(payment.allocations).map((bundle) => {
              const isSingle = bundle.allocations.length === 1
              if (isSingle) {
                const alloc = bundle.allocations[0]
                return (
                  <div key={bundle.key} className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2 text-xs">
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
                    {alloc.pricingBreakdown && (
                      <PricingBreakdownPanel
                        breakdown={alloc.pricingBreakdown}
                        heading={null}
                        className="rounded-md border border-border/40 bg-card/50 px-3 py-2"
                      />
                    )}
                  </div>
                )
              }
              // Bundle of >1 allocations — render header + itemised rows
              return (
                <div key={bundle.key} className="rounded-lg border border-border/40 bg-card/40 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-border/30 bg-muted/20 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        {bundle.programName ?? cleanDescription(bundle.allocations[0].chargeDescription)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {bundle.allocations.length} sessions
                        {bundle.savingsCents > 0 && (
                          <> · <span className="text-success">You saved {formatCurrency(bundle.savingsCents)}</span></>
                        )}
                      </p>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-foreground shrink-0">
                      {formatCurrency(bundle.totalCents)}
                    </span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {bundle.allocations.map((alloc, i) => {
                      const breakdown = alloc.pricingBreakdown
                      const grossCents =
                        breakdown && breakdown.subtotal_cents != null && breakdown.subtotal_cents > breakdown.total_cents
                          ? breakdown.subtotal_cents
                          : null
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <SessionStatusIcon status={alloc.sessionStatus} />
                            <span className="text-muted-foreground tabular-nums">
                              {alloc.sessionDate ? formatDate(alloc.sessionDate) : '-'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                            {grossCents !== null && (
                              <span className="text-[11px] text-muted-foreground line-through">
                                {formatCurrency(grossCents)}
                              </span>
                            )}
                            <span className="text-foreground">
                              {formatCurrency(alloc.amountCents)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
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
