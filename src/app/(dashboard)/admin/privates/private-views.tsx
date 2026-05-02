'use client'

import { useMemo, useState } from 'react'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { AlertCircle, Calendar, CalendarDays, List, Users } from 'lucide-react'
import { AdminPrivatesCalendar } from './admin-privates-calendar'
import { BookPrivateModal } from './book-private-modal'

type Booking = {
  id: string
  familyId: string
  playerId: string
  playerName: string
  familyDisplayId: string
  familyName: string
  coachId: string
  coachName: string
  date: string
  startTime: string
  endTime: string
  sessionStatus: string
  status: string
  approvalStatus: string
  priceCents: number
  durationMinutes: number
  bookedAt: string | null
}

type Tab = 'pending' | 'calendar' | 'by-coach' | 'all'

export function PrivateViews({
  bookings,
  families,
  coaches,
}: {
  bookings: Booking[]
  families: { id: string; display_id: string; family_name: string; primary_contact: { name?: string } | null; players: { id: string; first_name: string; last_name: string }[] }[]
  coaches: { id: string; name: string; rate: number }[]
}) {
  const pendingBookings = useMemo(() => bookings.filter(b => b.approvalStatus === 'pending'), [bookings])
  const hasPending = pendingBookings.length > 0

  const [tab, setTab] = useState<Tab>(hasPending ? 'pending' : 'calendar')

  // Group by coach
  const byCoach = useMemo(() => {
    const map = new Map<string, { name: string; bookings: Booking[] }>()
    for (const b of bookings) {
      if (!b.coachName) continue
      const key = b.coachId || b.coachName
      const existing = map.get(key) ?? { name: b.coachName, bookings: [] }
      existing.bookings.push(b)
      map.set(key, existing)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [bookings])

  const tabs: { key: Tab; label: string; icon: typeof List; badge?: number }[] = [
    { key: 'pending', label: 'Pending', icon: AlertCircle, badge: pendingBookings.length || undefined },
    { key: 'calendar', label: 'Calendar', icon: CalendarDays },
    { key: 'by-coach', label: 'By Coach', icon: Users },
    { key: 'all', label: 'All Bookings', icon: List },
  ]

  return (
    <div>
      {/* Top action bar */}
      <div className="mb-4 flex items-center justify-end">
        <BookPrivateModal families={families} coaches={coaches} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {tabs.map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-3.5" />
            {label}
            {badge && badge > 0 && (
              <span className="ml-1 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Pending tab */}
      {tab === 'pending' && (
        <div className="mt-4">
          {pendingBookings.length === 0 ? (
            <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {pendingBookings.map(b => (
                    <BookingRow key={b.id} booking={b} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Confirm or decline pending bookings from the{' '}
            <a href="/admin/privates/bookings" className="text-primary hover:underline">bookings management page</a>.
          </p>
        </div>
      )}

      {/* Calendar tab */}
      {tab === 'calendar' && (
        <div className="mt-4">
          <AdminPrivatesCalendar bookings={bookings} />
        </div>
      )}

      {/* By Coach tab */}
      {tab === 'by-coach' && (
        <div className="mt-4 space-y-4">
          {byCoach.length === 0 ? (
            <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No private bookings yet.</p>
          ) : (
            byCoach.map(group => {
              const confirmed = group.bookings.filter(b => b.status === 'confirmed')
              const upcoming = confirmed.filter(b => b.sessionStatus === 'scheduled')
              const completed = confirmed.filter(b => b.sessionStatus === 'completed')
              return (
                <div key={group.name}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{group.name.split(' ')[0]}</h3>
                    <span className="text-xs text-muted-foreground">
                      {upcoming.length} upcoming · {completed.length} completed · {group.bookings.length} total
                    </span>
                  </div>
                  <Card>
                    <CardContent className="p-0">
                      <div className="divide-y divide-border">
                        {group.bookings.slice(0, 10).map(b => (
                          <BookingRow key={b.id} booking={b} showCoach={false} />
                        ))}
                        {group.bookings.length > 10 && (
                          <div className="px-4 py-2 text-xs text-muted-foreground">
                            +{group.bookings.length - 10} more
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* All Bookings tab */}
      {tab === 'all' && (
        <div className="mt-4">
          {bookings.length === 0 ? (
            <EmptyState icon={Calendar} title="No bookings" description="Private lesson bookings will appear here" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {bookings.map(b => (
                    <BookingRow key={b.id} booking={b} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function BookingRow({ booking: b, showCoach = true }: { booking: Booking; showCoach?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm font-medium">
          {b.playerName}
          <span className="ml-1.5 text-xs text-muted-foreground">({b.familyDisplayId})</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {b.date ? formatDate(b.date) : ''}
          {b.startTime && ` · ${formatTime(b.startTime)}`}
          {showCoach && b.coachName && ` · ${b.coachName.split(' ')[0]}`}
          {b.priceCents > 0 && ` · ${formatCurrency(b.priceCents)}`}
        </p>
      </div>
      <StatusBadge status={b.status} />
    </div>
  )
}
