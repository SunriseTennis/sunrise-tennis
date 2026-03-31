import { createClient, requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Calendar } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { AdminBookForm } from './admin-book-form'
import { SharedPrivateForm } from './shared-private-form'

export default async function AdminPrivateBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  await requireAdmin()
  const supabase = await createClient()

  const [
    { data: bookings },
    { data: families },
    { data: coaches },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, family_id, player_id, status, approval_status,
        price_cents, duration_minutes, booked_at, auto_approved,
        sessions:session_id(date, start_time, end_time, status,
          coaches:coach_id(name)
        ),
        players:player_id(first_name, last_name),
        families:family_id(display_id, family_name)
      `)
      .eq('booking_type', 'private')
      .order('booked_at', { ascending: false })
      .limit(50),
    supabase
      .from('families')
      .select('id, display_id, family_name')
      .eq('status', 'active')
      .order('family_name'),
    supabase
      .from('coaches')
      .select('id, name, is_owner, hourly_rate')
      .eq('status', 'active')
      .order('name'),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Private Bookings"
        description="View and manage all private lesson bookings"
        breadcrumbs={[{ label: 'Privates', href: '/admin/privates' }]}
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

      {/* Admin book form */}
      <AdminBookForm
        families={(families ?? []).map(f => ({ id: f.id, display_id: f.display_id, family_name: f.family_name }))}
        coaches={(coaches ?? []).map(c => ({
          id: c.id, name: c.name,
          rate: (c.hourly_rate as { private_rate_cents?: number } | null)?.private_rate_cents ?? 0,
        }))}
      />

      <SharedPrivateForm
        families={(families ?? []).map(f => ({ id: f.id, display_id: f.display_id, family_name: f.family_name }))}
        coaches={(coaches ?? []).map(c => ({
          id: c.id, name: c.name,
          rate: (c.hourly_rate as { private_rate_cents?: number } | null)?.private_rate_cents ?? 0,
        }))}
      />

      {/* Bookings list */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">All Bookings</h2>
        {(bookings ?? []).length === 0 ? (
          <EmptyState icon={Calendar} title="No bookings" description="Private lesson bookings will appear here" />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(bookings ?? []).map(b => {
                  const session = b.sessions as unknown as { date: string; start_time: string; end_time: string; status: string; coaches: { name: string } | null } | null
                  const player = b.players as unknown as { first_name: string; last_name: string } | null
                  const family = b.families as unknown as { display_id: string; family_name: string } | null
                  let displayStatus = b.status
                  if (b.approval_status === 'pending') displayStatus = 'pending'
                  if (b.approval_status === 'declined') displayStatus = 'declined'
                  return (
                    <div key={b.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {player?.first_name} {player?.last_name}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ({family?.display_id})
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session ? `${formatDate(session.date)} · ${session.start_time ? formatTime(session.start_time) : ''} · ${session.coaches?.name ?? ''}` : ''}
                          {b.price_cents != null && ` · $${(b.price_cents / 100).toFixed(2)}`}
                        </p>
                      </div>
                      <StatusBadge status={displayStatus} />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
