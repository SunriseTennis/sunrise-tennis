'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateFriendly } from '@/lib/utils/dates'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type ChargeBadge = 'due' | 'scheduled' | 'paid'

export interface ChargeRowData {
  id: string
  description: string
  amountCents: number
  playerName: string | null
  date: string | null
  badge: ChargeBadge
}

const BADGE_STYLES: Record<ChargeBadge, string> = {
  due: 'bg-amber-100 text-amber-900 border border-amber-200',
  scheduled: 'bg-slate-100 text-slate-600 border border-slate-200',
  paid: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
}

const BADGE_LABELS: Record<ChargeBadge, string> = {
  due: 'Due now',
  scheduled: 'Scheduled',
  paid: 'Paid',
}

export function ChargeRow({ charge }: { charge: ChargeRowData }) {
  const displayDate = charge.date ? formatDateFriendly(charge.date) : null

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
            BADGE_STYLES[charge.badge],
          )}>
            {BADGE_LABELS[charge.badge]}
          </span>
          {displayDate && (
            <span className="text-xs text-muted-foreground tabular-nums">{displayDate}</span>
          )}
          {charge.playerName && (
            <span className="text-xs text-muted-foreground">· {charge.playerName}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-foreground line-clamp-2">{charge.description}</p>
        <Link
          href={`/parent/messages?compose=charge:${charge.id}`}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <MessageCircle className="size-3" />
          Question about this charge?
        </Link>
      </div>
      <span className={cn(
        'tabular-nums font-semibold shrink-0',
        charge.badge === 'paid' ? 'text-muted-foreground line-through' :
        charge.amountCents < 0 ? 'text-success' :
        'text-foreground',
      )}>
        {formatCurrency(charge.amountCents)}
      </span>
    </div>
  )
}
