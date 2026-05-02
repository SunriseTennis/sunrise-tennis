import { redirect } from 'next/navigation'
import { createClient, requireCoach } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Users, Check, X } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { confirmPrivateBooking, declinePrivateBooking } from '../actions'
import Link from 'next/link'

export default async function CoachPrivatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const { coachId } = await requireCoach()
  if (!coachId) return redirect('/coach?error=No+coach+profile+found') as never

  const supabase = await createClient()

  // Get all private bookings for this coach's sessions
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, player_id, family_id, status, approval_status,
      price_cents, duration_minutes, booked_at, session_id,
      shared_with_booking_id,
      sessions:session_id(id, date, start_time, end_time, status),
      players:player_id(first_name, last_name, ball_color),
      families:family_id(family_name, primary_contact)
    `)
    .eq('booking_type', 'private')
    .order('booked_at', { ascending: false })
    .limit(100)

  // Filter to only this coach's sessions (RLS handles it but let's be explicit)
  const coachBookings = (bookings ?? []).filter(b => {
    const session = b.sessions as unknown as { id: string; date: string; start_time: string; end_time: string; status: string } | null
    return session != null
  })

  // Group by session_id so shared privates surface once with both players.
  type BookingRow = (typeof coachBookings)[number]
  const sessionGroups = new Map<string, BookingRow[]>()
  for (const b of coachBookings) {
    if (!b.session_id) continue
    const list = sessionGroups.get(b.session_id) ?? []
    list.push(b)
    sessionGroups.set(b.session_id, list)
  }

  const groupedRows = [...sessionGroups.values()]
    .map(group => {
      // Stable order: bookings within a group sorted by family_id
      group.sort((a, b) => a.family_id.localeCompare(b.family_id))
      return {
        primary: group[0],
        partner: group[1] ?? null,
        isShared: group.length >= 2,
      }
    })

  const pending = groupedRows.filter(g => g.primary.approval_status === 'pending')
  const upcoming = groupedRows.filter(g => {
    const session = g.primary.sessions as unknown as { date: string; start_time: string; status: string }
    return g.primary.approval_status === 'approved' &&
      session.status === 'scheduled' &&
      new Date(`${session.date}T${session.start_time}`) > new Date()
  })
  const completed = groupedRows.filter(g => {
    const session = g.primary.sessions as unknown as { status: string }
    return session.status === 'completed'
  }).slice(0, 10)

  return (
    <div className="space-y-6">
      {/* -- Hero Banner -- */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Coach</p>
            <h1 className="text-2xl font-bold">Private Lessons</h1>
            <p className="mt-0.5 text-sm text-white/70">Manage your private lesson requests</p>
          </div>
          {pending.length > 0 && (
            <div className="text-right">
              <p className="text-xs font-medium text-white/70">Pending</p>
              <p className="text-2xl font-bold tabular-nums">{pending.length}</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decodeURIComponent(error)}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {decodeURIComponent(success)}
        </div>
      )}

      {/* -- Pending Requests -- */}
      {pending.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <h2 className="mb-2 text-lg font-semibold text-orange-700">
            Pending Requests ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((g, i) => {
              const b = g.primary
              const session = b.sessions as unknown as { date: string; start_time: string; end_time: string }
              const player = b.players as unknown as { first_name: string; last_name: string; ball_color: string }
              const partnerPlayer = g.partner?.players as unknown as { first_name: string; last_name: string } | null
              const family = b.families as unknown as { family_name: string; primary_contact: { name?: string; phone?: string } | null }
              return (
                <div key={b.id} className="animate-fade-up rounded-xl border border-orange-200 bg-orange-50/50 p-4 shadow-card" style={{ animationDelay: `${120 + i * 60}ms` }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-deep-navy">
                        {player?.first_name} {player?.last_name}
                        {partnerPlayer && (
                          <span className="text-slate-blue"> / {partnerPlayer.first_name} {partnerPlayer.last_name}</span>
                        )}
                        {player?.ball_color && !partnerPlayer && (
                          <span className="ml-1 text-xs capitalize text-slate-blue">({player.ball_color})</span>
                        )}
                        {g.isShared && (
                          <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">Shared</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-blue">
                        {formatDate(session.date)} &middot; {formatTime(session.start_time)} &ndash; {formatTime(session.end_time)} &middot; {b.duration_minutes}min
                      </p>
                      <p className="text-xs text-slate-blue">
                        {family?.family_name} &mdash; {family?.primary_contact?.phone ?? 'No phone'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <form action={confirmPrivateBooking.bind(null, b.id)}>
                        <Button type="submit" size="sm" className="h-7 gap-1 text-xs">
                          <Check className="size-3" /> Confirm
                        </Button>
                      </form>
                      <form action={declinePrivateBooking.bind(null, b.id)}>
                        <Button type="submit" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-red-600 hover:bg-red-50">
                          <X className="size-3" /> Decline
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* -- Upcoming -- */}
      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <h2 className="mb-2 text-lg font-semibold text-deep-navy">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState icon={Users} title="No upcoming privates" description="Confirmed bookings will appear here" compact />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] shadow-card">
            <div className="divide-y divide-[#F0B8B0]/30">
              {upcoming.map((g) => {
                const b = g.primary
                const session = b.sessions as unknown as { id: string; date: string; start_time: string; end_time: string }
                const player = b.players as unknown as { first_name: string; last_name: string; ball_color: string }
                const partnerPlayer = g.partner?.players as unknown as { first_name: string; last_name: string } | null
                return (
                  <Link key={b.id} href={`/coach/privates/${session.id}`} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#FFF6ED]">
                    <div>
                      <p className="text-sm font-medium text-deep-navy">
                        {player?.first_name} {player?.last_name}
                        {partnerPlayer && (
                          <span className="text-slate-blue"> / {partnerPlayer.first_name} {partnerPlayer.last_name}</span>
                        )}
                        {g.isShared && (
                          <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">Shared</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-blue">
                        {formatDate(session.date)} &middot; {formatTime(session.start_time)} &ndash; {formatTime(session.end_time)}
                      </p>
                    </div>
                    <StatusBadge status="confirmed" />
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* -- Recently Completed -- */}
      {completed.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '240ms' }}>
          <h2 className="mb-2 text-lg font-semibold text-deep-navy">Recently Completed</h2>
          <div className="overflow-hidden rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] shadow-card">
            <div className="divide-y divide-[#F0B8B0]/30">
              {completed.map((g) => {
                const b = g.primary
                const session = b.sessions as unknown as { id: string; date: string; start_time: string; end_time: string }
                const player = b.players as unknown as { first_name: string; last_name: string }
                const partnerPlayer = g.partner?.players as unknown as { first_name: string; last_name: string } | null
                return (
                  <Link key={b.id} href={`/coach/privates/${session.id}`} className="flex items-center justify-between px-4 py-3 opacity-70 transition-all hover:bg-[#FFF6ED] hover:opacity-100">
                    <div>
                      <p className="text-sm font-medium text-deep-navy">
                        {player?.first_name} {player?.last_name}
                        {partnerPlayer && (
                          <span className="text-slate-blue"> / {partnerPlayer.first_name} {partnerPlayer.last_name}</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-blue">
                        {formatDate(session.date)} &middot; {b.duration_minutes}min
                      </p>
                    </div>
                    <StatusBadge status="completed" />
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
