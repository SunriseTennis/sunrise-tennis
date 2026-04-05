'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateFriendly } from '@/lib/utils/dates'
import {
  Gift,
  MinusCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

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

type Category = 'groups' | 'privates' | 'competitions' | 'events' | 'other'

const CATEGORY_LABELS: Record<Category, string> = {
  groups: 'Groups & Squads',
  privates: 'Private Lessons',
  competitions: 'Competitions',
  events: 'Events',
  other: 'Other',
}

const CATEGORY_ORDER: Category[] = ['groups', 'privates', 'competitions', 'events', 'other']

function categoriseCharge(c: Charge): Category {
  if (c.type === 'private' || c.program_type === 'private') return 'privates'
  if (c.type === 'event') return 'events'
  if (c.program_type === 'competition') return 'competitions'
  if (c.program_type === 'group' || c.program_type === 'squad' || c.program_type === 'school') return 'groups'
  if (c.source_type === 'enrollment' || c.source_type === 'attendance') return 'groups'
  return 'other'
}

/** Strip trailing date pattern like " - 2026-04-06" from description */
function cleanDescription(desc: string): string {
  return desc.replace(/\s*-\s*\d{4}-\d{2}-\d{2}\s*$/, '')
}

/** Group key for collapsing sessions under a program or coach */
function getGroupKey(c: Charge): string {
  if (c.program_id) return c.program_id
  return cleanDescription(c.description)
}

function getGroupLabel(c: Charge): string {
  if (c.program_name) return c.program_name
  return cleanDescription(c.description)
}

function statusLabel(status: string | null | undefined): { text: string; className: string } {
  switch (status) {
    case 'completed':
      return { text: 'Completed', className: 'text-success' }
    case 'scheduled':
      return { text: 'Scheduled', className: 'text-primary' }
    case 'rained_out':
      return { text: 'Rained out', className: 'text-warning' }
    case 'cancelled':
      return { text: 'Cancelled', className: 'text-danger' }
    default:
      return { text: '', className: '' }
  }
}

export function ChargesList({ charges }: { charges: Charge[] }) {
  const activeCharges = charges.filter(c => c.status !== 'voided')
  const positiveCharges = activeCharges.filter(c => c.amount_cents > 0)
  const credits = activeCharges.filter(c => c.amount_cents < 0)

  // Group by category, then by program/coach within each category
  const grouped = new Map<Category, Map<string, { label: string; charges: Charge[]; total: number }>>()
  for (const c of positiveCharges) {
    const cat = categoriseCharge(c)
    if (!grouped.has(cat)) grouped.set(cat, new Map())
    const catGroups = grouped.get(cat)!
    const key = getGroupKey(c)
    if (!catGroups.has(key)) catGroups.set(key, { label: getGroupLabel(c), charges: [], total: 0 })
    const group = catGroups.get(key)!
    group.charges.push(c)
    group.total += c.amount_cents
  }

  if (charges.length === 0) return null

  const totalCents = positiveCharges.reduce((sum, c) => sum + c.amount_cents, 0)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Current Charges</h2>

      {positiveCharges.length > 0 ? (
        <div className="space-y-3">
          {CATEGORY_ORDER.map((cat) => {
            const catGroups = grouped.get(cat)
            if (!catGroups || catGroups.size === 0) return null
            const catTotal = Array.from(catGroups.values()).reduce((sum, g) => sum + g.total, 0)

            return (
              <div key={cat} className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
                {/* Category header */}
                <div className="flex items-center justify-between bg-muted/30 px-4 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-foreground">
                    {formatCurrency(catTotal)}
                  </span>
                </div>

                {/* Program/coach groups */}
                <div className="divide-y divide-border/50">
                  {Array.from(catGroups.values()).map((group) => (
                    <ChargeGroup key={group.label} group={group} />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Grand total */}
          <div className="flex items-center justify-between rounded-xl border-2 border-border bg-muted/30 px-4 py-3">
            <span className="font-semibold text-foreground">Total</span>
            <span className="tabular-nums text-lg font-bold text-foreground">
              {formatCurrency(totalCents)}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No outstanding charges.</p>
      )}

      {/* Credits */}
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
                    <p className="text-foreground">{cleanDescription(credit.description)}</p>
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

function ChargeGroup({ group }: { group: { label: string; charges: Charge[]; total: number } }) {
  const [expanded, setExpanded] = useState(false)
  const count = group.charges.length

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors"
      >
        {count > 1 ? (
          expanded ? <ChevronDown className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground line-clamp-1">{group.label}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {count} session{count !== 1 ? 's' : ''}
          </span>
        </div>
        <span className="tabular-nums text-sm font-semibold text-foreground shrink-0">
          {formatCurrency(group.total)}
        </span>
      </button>

      {/* Expanded session rows */}
      {expanded && count > 1 && (
        <div className="border-t border-border/30 bg-muted/10 px-4 py-1">
          {group.charges.map((c) => {
            const displayDate = c.session_date
              ? formatDateFriendly(c.session_date)
              : c.created_at
                ? formatDateFriendly(c.created_at)
                : '-'
            const ss = statusLabel(c.session_status)

            return (
              <div key={c.id} className="flex items-center justify-between py-1.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground tabular-nums">{displayDate}</span>
                  {c.player_name && <span className="text-muted-foreground">· {c.player_name}</span>}
                  {ss.text && <span className={cn('font-medium', ss.className)}>{ss.text}</span>}
                </div>
                <span className="tabular-nums font-medium text-foreground shrink-0 ml-2">
                  {formatCurrency(c.amount_cents)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Single charge — show date inline */}
      {count === 1 && (() => {
        const c = group.charges[0]
        const displayDate = c.session_date
          ? formatDateFriendly(c.session_date)
          : c.created_at
            ? formatDateFriendly(c.created_at)
            : null
        const ss = statusLabel(c.session_status)
        return displayDate || ss.text ? (
          <div className="px-4 pb-2 -mt-1">
            <span className="text-[11px] text-muted-foreground">
              {displayDate}
              {c.player_name && <> · {c.player_name}</>}
              {ss.text && <> · <span className={ss.className}>{ss.text}</span></>}
            </span>
          </div>
        ) : null
      })()}
    </div>
  )
}
