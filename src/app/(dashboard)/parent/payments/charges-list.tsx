'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { Gift, MinusCircle, ChevronRight } from 'lucide-react'
import { formatDateFriendly } from '@/lib/utils/dates'
import { ChargeRow, type ChargeRowData, type ChargeBadge } from './charge-row'
import { usePayment } from './payment-context'
import { cn } from '@/lib/utils/cn'

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
}

function classifyBadge(c: Charge): ChargeBadge {
  const today = new Date().toISOString().split('T')[0]
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
  subtotalCents: number
  dueCount: number
  scheduledCount: number
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
      let dueCount = 0
      let scheduledCount = 0
      for (const c of sCharges) {
        if (c.session_date && c.session_date > today && c.session_status === 'scheduled') {
          scheduledCount++
        } else {
          dueCount++
        }
      }
      return { key, label, charges: sCharges, subtotalCents, dueCount, scheduledCount }
    })

    const subtotalCents = playerCharges.reduce((sum, c) => sum + c.outstanding_cents, 0)

    for (const c of playerCharges) {
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
  // A charge is "still owing" only when it has a positive remaining balance.
  // outstanding_cents handles partial-payment + webhook-race cases where
  // status is still 'confirmed' but allocations cover the full amount.
  const positive = active.filter(c => c.amount_cents > 0 && c.outstanding_cents > 0 && c.status !== 'paid' && c.status !== 'credited')
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
              {services.map(({ key, label, charges: sCharges, subtotalCents: sSubtotal, dueCount, scheduledCount }) => {
                const groupKey = `${playerName}-${key}`
                const isGroupExpanded = expandedGroups.has(groupKey)
                const statusParts: string[] = []
                if (dueCount > 0) statusParts.push(`${dueCount} due`)
                if (scheduledCount > 0) statusParts.push(`${scheduledCount} scheduled`)
                // Color subtotal amber if any charges are due
                const hasOwed = dueCount > 0

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
                          </p>
                        </div>
                        <span className={cn(
                          'text-sm font-bold tabular-nums shrink-0',
                          hasOwed ? 'text-amber-700' : 'text-foreground',
                        )}>
                          {formatCurrency(sSubtotal)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePaySubtotal(sSubtotal, `${label} - ${playerName}`)}
                        className="shrink-0 mr-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        Pay
                      </button>
                    </div>

                    {/* Expanded: individual charge rows */}
                    {isGroupExpanded && (
                      <div className="border-t border-border/20 bg-muted/5">
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
                    )}
                  </div>
                )
              })}

              {/* Player subtotal */}
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
                    <button
                      type="button"
                      onClick={() => handlePaySubtotal(subtotalCents, `All charges - ${playerName}`)}
                      className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                    >
                      Pay
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Grand totals */}
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
