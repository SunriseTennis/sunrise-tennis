'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { Gift, MinusCircle, ChevronRight } from 'lucide-react'
import { formatDateFriendly } from '@/lib/utils/dates'
import { ChargeRow, type ChargeRowData, type ChargeBadge, type PricingBreakdownData } from './charge-row'
import { usePayment } from './payment-context'
import { cn } from '@/lib/utils/cn'
import { PricingBreakdownPanel, aggregateBundleBreakdown } from '@/components/pricing-breakdown-panel'

interface Charge {
  id: string
  type: string
  source_type: string
  description: string
  amount_cents: number
  /** Sum of payment allocations applied to this charge (cents, always >= 0). */
  paid_cents: number
  /** Remaining balance after allocations: amount_cents - paid_cents (clamped >= 0).
   *  Credits (negative amount_cents) pass through unchanged. */
  outstanding_cents: number
  status: string
  program_id: string | null
  session_id: string | null
  booking_id: string | null
  player_id: string | null
  created_at: string | null
  program_name?: string | null
  program_type?: string | null
  player_name?: string | null
  session_date?: string | null
  session_status?: string | null
  pricing_breakdown?: PricingBreakdownData | null
}

function classifyBadge(c: Charge): ChargeBadge {
  const today = new Date().toISOString().split('T')[0]
  // A charge is "paid" when allocations cover the full gross amount and the
  // status is one of the settled-money statuses. Show Paid badge regardless
  // of whether the underlying session is past or future.
  if (c.amount_cents > 0 && c.outstanding_cents <= 0) return 'paid'
  if (c.session_date && c.session_date > today && c.session_status === 'scheduled') {
    return 'scheduled'
  }
  return 'due'
}

function toRowData(c: Charge): ChargeRowData {
  return {
    id: c.id,
    description: c.description,
    amountCents: c.amount_cents,
    paidCents: c.paid_cents,
    outstandingCents: c.outstanding_cents,
    playerName: c.player_name ?? null,
    date: c.session_date ?? c.created_at ?? null,
    badge: classifyBadge(c),
    sessionId: c.session_id,
    programId: c.program_id,
    bookingId: c.booking_id,
    programType: c.program_type ?? null,
    pricingBreakdown: c.pricing_breakdown ?? null,
  }
}

function serviceKey(c: Charge): string {
  if (c.program_type === 'private') {
    const match = c.description?.match(/with\s+(\S+)/i)
    return `private-${match?.[1] ?? 'coach'}`
  }
  if (c.program_id) return `program-${c.program_id}`
  return 'other'
}

function serviceLabel(c: Charge): string {
  if (c.program_type === 'private') {
    const match = c.description?.match(/with\s+(\S+)/i)
    return `Private with ${match?.[1] ?? 'Coach'}`
  }
  return c.program_name ?? c.description ?? 'Other'
}

interface PlayerGroup {
  playerName: string
  services: ServiceGroup[]
  subtotalCents: number
}

interface ServiceGroup {
  key: string
  label: string
  charges: Charge[]
  /** Sum of outstanding (still-owed) cents across this group's charges. Paid rows contribute 0. */
  subtotalCents: number
  /** Sum of (subtotal − total) across charges' pricing_breakdown — i.e. amount saved across this group. */
  savingsCents: number
  dueCount: number
  scheduledCount: number
  paidCount: number
}

function buildGroups(charges: Charge[]): { playerGroups: PlayerGroup[]; dueTotalCents: number; scheduledTotalCents: number; totalCents: number } {
  const today = new Date().toISOString().split('T')[0]

  const byPlayer = new Map<string, Charge[]>()
  for (const c of charges) {
    const name = c.player_name ?? 'Unknown'
    const existing = byPlayer.get(name)
    if (existing) existing.push(c)
    else byPlayer.set(name, [c])
  }

  let dueTotalCents = 0
  let scheduledTotalCents = 0

  const playerGroups: PlayerGroup[] = [...byPlayer.entries()].map(([playerName, playerCharges]) => {
    const byService = new Map<string, { label: string; charges: Charge[] }>()
    for (const c of playerCharges) {
      const key = serviceKey(c)
      const existing = byService.get(key)
      if (existing) existing.charges.push(c)
      else byService.set(key, { label: serviceLabel(c), charges: [c] })
    }

    const services: ServiceGroup[] = [...byService.entries()].map(([key, { label, charges: sCharges }]) => {
      sCharges.sort((a, b) => {
        const dateA = a.session_date ?? a.created_at ?? ''
        const dateB = b.session_date ?? b.created_at ?? ''
        return dateA.localeCompare(dateB)
      })
      const subtotalCents = sCharges.reduce((sum, c) => sum + c.outstanding_cents, 0)
      const savingsCents = sCharges.reduce((sum, c) => {
        const b = c.pricing_breakdown
        if (b && b.subtotal_cents != null && b.subtotal_cents > b.total_cents) {
          return sum + (b.subtotal_cents - b.total_cents)
        }
        return sum
      }, 0)
      let dueCount = 0
      let scheduledCount = 0
      let paidCount = 0
      for (const c of sCharges) {
        if (c.amount_cents > 0 && c.outstanding_cents <= 0) {
          paidCount++
        } else if (c.session_date && c.session_date > today && c.session_status === 'scheduled') {
          scheduledCount++
        } else {
          dueCount++
        }
      }
      return { key, label, charges: sCharges, subtotalCents, savingsCents, dueCount, scheduledCount, paidCount }
    })

    const subtotalCents = playerCharges.reduce((sum, c) => sum + c.outstanding_cents, 0)

    for (const c of playerCharges) {
      // Paid rows don't contribute to either due/scheduled totals — they are
      // shown for transparency only.
      if (c.amount_cents > 0 && c.outstanding_cents <= 0) continue
      if (c.session_date && c.session_date > today && c.session_status === 'scheduled') {
        scheduledTotalCents += c.outstanding_cents
      } else {
        dueTotalCents += c.outstanding_cents
      }
    }

    return { playerName, services, subtotalCents }
  })

  return { playerGroups, dueTotalCents, scheduledTotalCents, totalCents: dueTotalCents + scheduledTotalCents }
}

export function ChargesList({ charges }: { charges: Charge[] }) {
  const [expandedChargeId, setExpandedChargeId] = useState<string | null>(null)
  // Track which service groups are expanded (collapsed by default)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const payment = usePayment()

  const active = charges.filter(c => c.status !== 'voided')
  // Phase F: include both still-owing charges AND paid scheduled future
  // per-session charges. The latter render with a "Paid" badge so the parent
  // sees what has been pre-paid for upcoming sessions, but no Pay button.
  // Past-completed paid charges stay out of the list (they live in PaymentHistory).
  const today = new Date().toISOString().split('T')[0]
  const positive = active.filter(c => {
    if (c.amount_cents <= 0) return false
    if (c.status === 'credited') return false
    const isFullyPaid = c.outstanding_cents <= 0
    const isFutureScheduled =
      !!c.session_date && c.session_date >= today && c.session_status === 'scheduled'
    if (isFullyPaid) {
      // Only keep paid rows for upcoming scheduled sessions — past payments
      // belong in PaymentHistory, not in the "current commitment" list.
      return isFutureScheduled
    }
    // Outstanding-but-not-paid: keep.
    return c.outstanding_cents > 0
  })
  const credits = active.filter(c => c.amount_cents < 0)

  const { playerGroups, dueTotalCents, scheduledTotalCents, totalCents } = buildGroups(positive)

  if (charges.length === 0) return null

  const hasMultiplePlayers = playerGroups.length > 1

  function toggleGroup(groupKey: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  function handlePaySubtotal(amountCents: number, label: string) {
    payment?.requestPayment(amountCents, label)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Charges</h2>

      {playerGroups.length > 0 ? (
        <div className="space-y-4">
          {playerGroups.map(({ playerName, services, subtotalCents }) => (
            <div key={playerName} className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
              {/* Player header */}
              {hasMultiplePlayers && (
                <div className="border-b border-border/50 bg-gradient-to-r from-muted/30 to-muted/10 px-4 py-3">
                  <h3 className="text-sm font-bold text-foreground">{playerName}</h3>
                </div>
              )}

              {/* Service groups — collapsed by default */}
              {services.map(({ key, label, charges: sCharges, subtotalCents: sSubtotal, savingsCents: sSavings, dueCount, scheduledCount, paidCount }) => {
                const groupKey = `${playerName}-${key}`
                const isGroupExpanded = expandedGroups.has(groupKey)
                const statusParts: string[] = []
                if (dueCount > 0) statusParts.push(`${dueCount} due`)
                if (scheduledCount > 0) statusParts.push(`${scheduledCount} scheduled`)
                if (paidCount > 0) statusParts.push(`${paidCount} paid`)
                // Color subtotal amber if any charges are due
                const hasOwed = dueCount > 0
                const grossSubtotal = sSavings > 0 ? sSubtotal + sSavings : null
                // Hide Pay on a group that's fully paid (subtotal=0 = no outstanding)
                const showGroupPayButton = sSubtotal > 0
                // When everything in the group is paid, show "All paid" badge
                // instead of a $0 number that reads as "nothing owed for $0".
                const isFullyPaidGroup = paidCount > 0 && dueCount === 0 && scheduledCount === 0

                return (
                  <div key={key} className="border-b border-border/20 last:border-b-0">
                    {/* Service group summary — always visible, tappable to expand */}
                    <div className="flex items-center gap-0">
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupKey)}
                        className="flex flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-muted/10 transition-colors"
                      >
                        <ChevronRight className={cn(
                          'size-4 text-muted-foreground shrink-0 transition-transform',
                          isGroupExpanded && 'rotate-90',
                        )} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground">
                            {sCharges.length} session{sCharges.length !== 1 ? 's' : ''}
                            {statusParts.length > 0 && ` · ${statusParts.join(', ')}`}
                            {sSavings > 0 && (
                              <> · <span className="text-success">You save {formatCurrency(sSavings)}</span></>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isFullyPaidGroup ? (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                              All paid
                            </span>
                          ) : (
                            <>
                              {grossSubtotal !== null && (
                                <span className="text-xs tabular-nums text-muted-foreground line-through">
                                  {formatCurrency(grossSubtotal)}
                                </span>
                              )}
                              <span className={cn(
                                'text-sm font-bold tabular-nums',
                                hasOwed ? 'text-amber-700' : 'text-foreground',
                              )}>
                                {formatCurrency(sSubtotal)}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                      {showGroupPayButton && (
                        <button
                          type="button"
                          onClick={() => handlePaySubtotal(sSubtotal, `${label} - ${playerName}`)}
                          className="shrink-0 mr-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                          Pay
                        </button>
                      )}
                    </div>

                    {/* Expanded: term-level breakdown (when applicable) + individual charge rows */}
                    {isGroupExpanded && (() => {
                      // Synthesize a term-level breakdown across the whole
                      // service group so the parent sees "8 sessions × $30,
                      // − Multi-group, − Early Bird, Total" once at the top
                      // — instead of having to expand each session row to
                      // reconstruct the math themselves.
                      const aggregated = aggregateBundleBreakdown(sCharges.map(c => c.pricing_breakdown))
                      const showAggregate =
                        aggregated != null &&
                        sCharges.length > 1 &&
                        ((aggregated.subtotal_cents ?? 0) > aggregated.total_cents ||
                          (aggregated.sessions ?? 0) > 1)
                      return (
                        <div className="border-t border-border/20 bg-muted/5">
                          {showAggregate && aggregated && (
                            <PricingBreakdownPanel
                              breakdown={aggregated}
                              heading="Term breakdown"
                              className="border-b border-border/20 bg-card/40 px-4 py-2.5"
                            />
                          )}
                          <div className="divide-y divide-border/20">
                            {sCharges.map(c => (
                              <ChargeRow
                                key={c.id}
                                charge={toRowData(c)}
                                compact
                                isExpanded={expandedChargeId === c.id}
                                onToggle={() => setExpandedChargeId(expandedChargeId === c.id ? null : c.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}

              {/* Player subtotal — hide Pay button when nothing outstanding */}
              {hasMultiplePlayers && (
                <div className="border-t border-border/50 bg-gradient-to-r from-muted/20 to-transparent px-4 py-3 flex justify-between items-center">
                  <span className="text-sm font-semibold text-muted-foreground">{playerName} total</span>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'text-sm font-bold tabular-nums',
                      services.some(s => s.dueCount > 0) ? 'text-amber-700' : 'text-foreground',
                    )}>
                      {formatCurrency(subtotalCents)}
                    </span>
                    {subtotalCents > 0 && (
                      <button
                        type="button"
                        onClick={() => handlePaySubtotal(subtotalCents, `All charges - ${playerName}`)}
                        className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        Pay
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Grand totals — only render when there's something outstanding to pay.
              Pure-paid views (everything pre-paid for the term) skip this card. */}
          {totalCents > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
            <div className="divide-y divide-border/50">
              {dueTotalCents > 0 && (
                <div className="flex justify-between items-center px-4 py-3.5">
                  <span className="text-sm font-semibold text-amber-700">Currently owed</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold tabular-nums text-amber-700">
                      {formatCurrency(dueTotalCents)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePaySubtotal(dueTotalCents, 'Currently owed')}
                      className="rounded-lg border border-amber-400/50 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                    >
                      Pay
                    </button>
                  </div>
                </div>
              )}
              {scheduledTotalCents > 0 && (
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm font-medium text-muted-foreground">Upcoming</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold tabular-nums text-muted-foreground">{formatCurrency(scheduledTotalCents)}</span>
                    <button
                      type="button"
                      onClick={() => handlePaySubtotal(scheduledTotalCents, 'Upcoming charges')}
                      className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      Pay
                    </button>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center px-4 py-3.5 bg-muted/10">
                <span className="text-base font-bold text-foreground">Total</span>
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold tabular-nums text-foreground">
                    {formatCurrency(totalCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePaySubtotal(totalCents, 'Total balance')}
                    className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
                  >
                    Pay all
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No outstanding charges.</p>
      )}

      {/* Credits */}
      {credits.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Gift className="size-4 text-success" />
            Credits
          </h3>
          <div className="mt-2 space-y-2">
            {credits.map((credit) => (
              <div
                key={credit.id}
                className="flex items-center justify-between rounded-xl border border-success/20 bg-success/5 px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <MinusCircle className="size-4 text-success" />
                  <div>
                    <p className="text-foreground">{credit.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {credit.session_date
                        ? formatDateFriendly(credit.session_date)
                        : credit.created_at
                          ? formatDateFriendly(credit.created_at)
                          : '-'}
                    </p>
                  </div>
                </div>
                <span className="tabular-nums font-medium text-success">
                  {formatCurrency(credit.amount_cents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
