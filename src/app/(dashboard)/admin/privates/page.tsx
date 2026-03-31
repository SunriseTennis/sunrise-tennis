import Link from 'next/link'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { formatTime } from '@/lib/utils/dates'
import { Clock, Calendar, DollarSign, Users } from 'lucide-react'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async function AdminPrivatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  await requireAdmin()
  const supabase = await createClient()

  const [
    { data: coaches },
    { data: availability },
    { data: pendingBookings, count: pendingCount },
  ] = await Promise.all([
    supabase.from('coaches').select('id, name, is_owner, pay_period, status').eq('status', 'active').order('name'),
    supabase.from('coach_availability').select('coach_id, day_of_week, start_time, end_time').order('day_of_week').order('start_time'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_type', 'private').eq('approval_status', 'pending'),
  ])

  // Group availability by coach
  const coachAvailability = new Map<string, typeof availability>()
  for (const a of availability ?? []) {
    const existing = coachAvailability.get(a.coach_id) ?? []
    existing.push(a)
    coachAvailability.set(a.coach_id, existing)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Private Lessons"
        description="Manage coach availability, bookings, and earnings"
      />

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

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/admin/privates/availability">
          <Card className="transition-colors hover:bg-accent/50">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-blue-100 p-2">
                <Clock className="size-5 text-blue-700" />
              </div>
              <div>
                <p className="text-sm font-medium">Availability</p>
                <p className="text-xs text-muted-foreground">Manage coach schedules</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/privates/bookings">
          <Card className="transition-colors hover:bg-accent/50">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-orange-100 p-2">
                <Calendar className="size-5 text-orange-700" />
              </div>
              <div>
                <p className="text-sm font-medium">Bookings</p>
                <p className="text-xs text-muted-foreground">
                  {(pendingCount ?? 0) > 0 ? `${pendingCount} pending` : 'No pending requests'}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/privates/earnings">
          <Card className="transition-colors hover:bg-accent/50">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-green-100 p-2">
                <DollarSign className="size-5 text-green-700" />
              </div>
              <div>
                <p className="text-sm font-medium">Earnings</p>
                <p className="text-xs text-muted-foreground">Coach pay tracking</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Coach availability overview */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Coach Availability</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(coaches ?? []).map((coach) => {
            const windows = coachAvailability.get(coach.id) ?? []
            return (
              <Card key={coach.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{coach.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {coach.pay_period === 'end_of_term' ? 'Term pay' : 'Weekly pay'}
                    </span>
                  </div>
                  {windows.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {windows.map((w, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          {DAY_NAMES[w.day_of_week]} {formatTime(w.start_time)} – {formatTime(w.end_time)}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No availability set</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
