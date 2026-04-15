'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { Gift, MinusCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDateFriendly } from '@/lib/utils/dates'
import { ChargeRow, type ChargeRowData, type ChargeBadge } from './charge-row'

interface Charge {
  id: string
  type: string
  source_type: string
  description: string
  amount_cents: number
  status: string
  program_id: string | null
  session_id: string | null
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
    playerName: c.player_name ?? null,
    date: c.session_date ?? c.created_at ?? null,
    badge: classifyBadge(c),
  }
}

function chargeSortKey(c: Charge): string {
  // Sort by session date when present, else created_at. Descending (most recent first).
  return (c.session_date ?? c.created_at ?? '')
}

export function ChargesList({ charges }: { charges: Charge[] }) {
  const [showPaid, setShowPaid] = useState(false)

  const active = charges.filter(c => c.status !== 'voided')
  const positive = active.filter(c => c.amount_cents > 0)
  const credits = active.filter(c => c.amount_cents < 0)
  const paid = active.filter(c => c.status === 'paid' || c.status === 'credited')

  // Chronological: most recent (or most-imminent future) first by session date.
  const sorted = [...positive].sort((a, b) => chargeSortKey(b).localeCompare(chargeSortKey(a)))

  const rows = sorted.map(toRowData)

  if (charges.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-foreground">Charges</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div className="divide-y divide-border/50">
            {rows.map((row) => (
              <ChargeRow key={row.id} charge={row} />
            ))}
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
                className="flex items-center justify-between rounded-lg border border-success/20 bg-success/5 px-4 py-2.5 text-sm"
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

      {/* Paid history (collapsed) */}
      {paid.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPaid(!showPaid)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-muted-foreground hover:bg-muted/20"
          >
            {showPaid ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            History ({paid.length})
          </button>
          {showPaid && (
            <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
              <div className="divide-y divide-border/50">
                {paid.map(c => (
                  <ChargeRow
                    key={c.id}
                    charge={{ ...toRowData(c), badge: 'paid' }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
