'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { StatusBadge } from '@/components/status-badge'
import { ChevronDown, ChevronRight, Receipt, Gift, MinusCircle } from 'lucide-react'

interface Charge {
  id: string
  type: string
  source_type: string
  description: string
  amount_cents: number
  status: string
  program_id: string | null
  session_id: string | null
  created_at: string | null
  program_name?: string | null
}

interface ChargeGroup {
  key: string
  label: string
  charges: Charge[]
  totalCents: number
  paidSessions: number
  totalSessions: number | null
}

function groupCharges(charges: Charge[]): { current: ChargeGroup[]; credits: Charge[] } {
  const credits: Charge[] = []
  const programMap = new Map<string, Charge[]>()
  const otherCharges: Charge[] = []

  for (const charge of charges) {
    if (charge.amount_cents < 0) {
      credits.push(charge)
      continue
    }
    if (charge.program_id) {
      const key = charge.program_id
      if (!programMap.has(key)) programMap.set(key, [])
      programMap.get(key)!.push(charge)
    } else {
      otherCharges.push(charge)
    }
  }

  const groups: ChargeGroup[] = []

  for (const [programId, programCharges] of programMap) {
    const label = programCharges[0]?.program_name || 'Program'
    const activeCharges = programCharges.filter(c => c.status !== 'voided')
    groups.push({
      key: programId,
      label,
      charges: programCharges,
      totalCents: activeCharges.reduce((sum, c) => sum + c.amount_cents, 0),
      paidSessions: activeCharges.filter(c => c.type === 'session' && c.status === 'confirmed').length,
      totalSessions: null,
    })
  }

  if (otherCharges.length > 0) {
    const activeOther = otherCharges.filter(c => c.status !== 'voided')
    groups.push({
      key: 'other',
      label: 'Other charges',
      charges: otherCharges,
      totalCents: activeOther.reduce((sum, c) => sum + c.amount_cents, 0),
      paidSessions: 0,
      totalSessions: null,
    })
  }

  return { current: groups, credits }
}

function ChargeGroupCard({ group }: { group: ChargeGroup }) {
  const [expanded, setExpanded] = useState(false)
  const activeCharges = group.charges.filter(c => c.status !== 'voided')

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Receipt className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">{group.label}</p>
            <p className="text-xs text-muted-foreground">
              {activeCharges.length} item{activeCharges.length !== 1 ? 's' : ''}
              {group.paidSessions > 0 && group.totalSessions
                ? ` - ${group.paidSessions}/${group.totalSessions} sessions`
                : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums text-foreground">
            {formatCurrency(group.totalCents)}
          </span>
          {expanded
            ? <ChevronDown className="size-4 text-muted-foreground" />
            : <ChevronRight className="size-4 text-muted-foreground" />
          }
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {group.charges.map((charge) => (
            <div
              key={charge.id}
              className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                charge.status === 'voided' ? 'opacity-40 line-through' : ''
              }`}
            >
              <div className="flex-1">
                <p className="text-foreground">{charge.description}</p>
                <p className="text-xs text-muted-foreground">
                  {charge.created_at ? formatDate(charge.created_at) : '-'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium text-foreground">
                  {formatCurrency(charge.amount_cents)}
                </span>
                <StatusBadge status={charge.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChargesList({
  charges,
}: {
  charges: Charge[]
}) {
  const activeCharges = charges.filter(c => c.status !== 'voided')
  const { current, credits } = groupCharges(activeCharges)

  if (charges.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Current Charges</h2>

      {current.length > 0 ? (
        <div className="space-y-3">
          {current.map((group) => (
            <ChargeGroupCard key={group.key} group={group} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No outstanding charges.</p>
      )}

      {/* Credits section */}
      {credits.length > 0 && (
        <div className="mt-4">
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
                    <p className="text-xs text-muted-foreground">{credit.created_at ? formatDate(credit.created_at) : '-'}</p>
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
