'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { StatusBadge } from '@/components/status-badge'
import {
  ChevronDown,
  ChevronRight,
  Receipt,
  Gift,
  MinusCircle,
  Users,
  User,
  Trophy,
  CalendarDays,
  Settings,
  CheckCircle2,
  Clock,
  CloudRain,
  XCircle,
} from 'lucide-react'

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

interface CategoryGroup {
  category: Category
  label: string
  icon: typeof Receipt
  charges: Charge[]
  totalCents: number
  playerGroups: { playerName: string; charges: Charge[]; totalCents: number }[]
}

const CATEGORY_CONFIG: Record<Category, { label: string; icon: typeof Receipt }> = {
  groups: { label: 'Groups & Squads', icon: Users },
  privates: { label: 'Private Lessons', icon: User },
  competitions: { label: 'Competitions', icon: Trophy },
  events: { label: 'Events', icon: CalendarDays },
  other: { label: 'Other', icon: Settings },
}

function categoriseCharge(c: Charge): Category {
  if (c.type === 'private' || c.program_type === 'private') return 'privates'
  if (c.type === 'event') return 'events'
  if (c.program_type === 'competition') return 'competitions'
  if (c.program_type === 'group' || c.program_type === 'squad' || c.program_type === 'school') return 'groups'
  if (c.source_type === 'enrollment' || c.source_type === 'attendance') return 'groups'
  return 'other'
}

function groupChargesByCategory(charges: Charge[]): { categories: CategoryGroup[]; credits: Charge[] } {
  const credits: Charge[] = []
  const categoryMap = new Map<Category, Charge[]>()

  for (const charge of charges) {
    if (charge.amount_cents < 0) {
      credits.push(charge)
      continue
    }
    const cat = categoriseCharge(charge)
    if (!categoryMap.has(cat)) categoryMap.set(cat, [])
    categoryMap.get(cat)!.push(charge)
  }

  const categories: CategoryGroup[] = []

  // Maintain consistent ordering
  const order: Category[] = ['groups', 'privates', 'competitions', 'events', 'other']
  for (const cat of order) {
    const catCharges = categoryMap.get(cat)
    if (!catCharges || catCharges.length === 0) continue

    const config = CATEGORY_CONFIG[cat]
    const activeCharges = catCharges.filter(c => c.status !== 'voided')
    const totalCents = activeCharges.reduce((sum, c) => sum + c.amount_cents, 0)

    // Sub-group by player
    const playerMap = new Map<string, Charge[]>()
    for (const c of catCharges) {
      const key = c.player_name ?? 'General'
      if (!playerMap.has(key)) playerMap.set(key, [])
      playerMap.get(key)!.push(c)
    }

    const playerGroups = [...playerMap.entries()].map(([playerName, pCharges]) => ({
      playerName,
      charges: pCharges,
      totalCents: pCharges.filter(c => c.status !== 'voided').reduce((sum, c) => sum + c.amount_cents, 0),
    }))

    categories.push({
      category: cat,
      label: config.label,
      icon: config.icon,
      charges: catCharges,
      totalCents,
      playerGroups,
    })
  }

  return { categories, credits }
}

function SessionStatusIcon({ status }: { status: string | null | undefined }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="size-3.5 shrink-0 text-success" />
    case 'scheduled':
      return <Clock className="size-3.5 shrink-0 text-primary" />
    case 'rained_out':
      return <CloudRain className="size-3.5 shrink-0 text-warning" />
    case 'cancelled':
      return <XCircle className="size-3.5 shrink-0 text-danger" />
    default:
      return null
  }
}

function CategoryCard({ group }: { group: CategoryGroup }) {
  const [expanded, setExpanded] = useState(false)
  const activeCharges = group.charges.filter(c => c.status !== 'voided')
  const Icon = group.icon
  const hasMultiplePlayers = group.playerGroups.length > 1

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">{group.label}</p>
            <p className="text-xs text-muted-foreground">
              {activeCharges.length} item{activeCharges.length !== 1 ? 's' : ''}
              {hasMultiplePlayers && ` across ${group.playerGroups.length} players`}
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
          {group.playerGroups.map((pg) => (
            <div key={pg.playerName}>
              {hasMultiplePlayers && (
                <div className="flex items-center justify-between bg-muted/30 px-4 py-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{pg.playerName}</span>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {formatCurrency(pg.totalCents)}
                  </span>
                </div>
              )}
              {pg.charges.map((charge) => (
                <div
                  key={charge.id}
                  className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                    charge.status === 'voided' ? 'opacity-40 line-through' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <SessionStatusIcon status={charge.session_status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground">{charge.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {charge.session_date
                          ? formatDate(charge.session_date)
                          : charge.created_at
                            ? formatDate(charge.created_at)
                            : '-'}
                        {!hasMultiplePlayers && charge.player_name && (
                          <span className="ml-1.5">- {charge.player_name}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="tabular-nums font-medium text-foreground">
                      {formatCurrency(charge.amount_cents)}
                    </span>
                    <StatusBadge status={charge.status} />
                  </div>
                </div>
              ))}
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
  const { categories, credits } = groupChargesByCategory(activeCharges)

  if (charges.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Current Charges</h2>

      {categories.length > 0 ? (
        <div className="space-y-3">
          {categories.map((group) => (
            <CategoryCard key={group.category} group={group} />
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
