'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { adminBatchConfirm, adminBatchDecline } from '../actions'

interface PendingBooking {
  id: string
  player_name: string
  family_id: string
  family_display_id: string
  coach_name: string
  date: string
  start_time: string
  end_time: string
  duration_minutes: number
  price_cents: number
}

function ActionButton({ variant, children }: { variant: 'confirm' | 'decline'; children: React.ReactNode }) {
  const { pending } = useFormStatus()
  const isConfirm = variant === 'confirm'
  return (
    <Button
      type="submit"
      size="sm"
      variant={isConfirm ? 'default' : 'outline'}
      className={isConfirm ? '' : 'text-red-600 border-red-200 hover:bg-red-50'}
      disabled={pending}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
      {children}
    </Button>
  )
}

export function PendingBookings({ bookings }: { bookings: PendingBooking[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (bookings.length === 0) return null

  const allSelected = selected.size === bookings.length
  const someSelected = selected.size > 0

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(bookings.map(b => b.id)))
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Pending Requests
          <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {bookings.length}
          </span>
        </h2>

        {someSelected && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <form action={adminBatchConfirm}>
              {Array.from(selected).map(id => (
                <input key={id} type="hidden" name="booking_ids" value={id} />
              ))}
              <ActionButton variant="confirm">
                <CheckCircle className="size-3.5 mr-1" />
                Confirm {selected.size > 1 ? `(${selected.size})` : ''}
              </ActionButton>
            </form>
            <form action={adminBatchDecline}>
              {Array.from(selected).map(id => (
                <input key={id} type="hidden" name="booking_ids" value={id} />
              ))}
              <ActionButton variant="decline">
                <XCircle className="size-3.5 mr-1" />
                Decline {selected.size > 1 ? `(${selected.size})` : ''}
              </ActionButton>
            </form>
          </div>
        )}
      </div>

      <Card className="overflow-hidden rounded-xl shadow-card">
        <CardContent className="p-0">
          {/* Select all header */}
          <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="size-3.5 rounded border-border"
            />
            <span className="text-xs font-medium text-muted-foreground">
              {allSelected ? 'Deselect all' : 'Select all'}
            </span>
          </div>

          <div className="divide-y divide-border">
            {bookings.map(b => (
              <label
                key={b.id}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(b.id)}
                  onChange={() => toggleOne(b.id)}
                  className="size-3.5 rounded border-border"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{b.player_name}</p>
                    <span className="text-xs text-muted-foreground">({b.family_display_id})</span>
                    <StatusBadge status="pending" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(b.date)} · {formatTime(b.start_time)} · {b.duration_minutes}min · {b.coach_name} · ${(b.price_cents / 100).toFixed(2)}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
