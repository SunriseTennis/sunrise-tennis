import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { ChevronLeft, Clock, Users, User, DollarSign } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { PrivateSessionActionCard } from './private-session-action-card'

export default async function AdminSessionLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ rainout?: string; error?: string }>
}) {
  const { sessionId } = await params
  const { rainout, error } = await searchParams
  await requireAdmin()
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, session_type, program_id, date, start_time, end_time, status, duration_minutes, cancellation_reason, coaches:coach_id(id, name)')
    .eq('id', sessionId)
    .single()

  if (!session) {
    // No session — fall through to programs index
    redirect('/admin/programs')
  }

  // Group sessions still go through the program detail page (existing flow).
  if (session.session_type !== 'private') {
    if (session.program_id) {
      const rainParam = rainout ? '?rainout=1' : ''
      redirect(`/admin/programs/${session.program_id}/sessions/${sessionId}${rainParam}`)
    }
    redirect('/admin/programs')
  }

  // ── Private session detail ────────────────────────────────────────────
  const coach = session.coaches as unknown as { id: string; name: string } | null

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, family_id, player_id, status, approval_status,
      price_cents, duration_minutes, shared_with_booking_id, is_standing,
      players:player_id(first_name, last_name),
      families:family_id(family_name, display_id, primary_contact)
    `)
    .eq('session_id', sessionId)
    .eq('booking_type', 'private')

  type BookingRow = {
    id: string
    family_id: string
    player_id: string
    status: string
    approval_status: string | null
    price_cents: number | null
    duration_minutes: number | null
    shared_with_booking_id: string | null
    is_standing: boolean | null
    players: { first_name: string; last_name: string } | null
    families: { family_name: string; display_id: string; primary_contact: { name?: string; phone?: string } | null } | null
  }
  const rows = (bookings ?? []) as unknown as BookingRow[]
  const activeRows = rows.filter(r => r.status !== 'cancelled')
  const cancelledRows = rows.filter(r => r.status === 'cancelled')
  const isShared = activeRows.length >= 2

  // Charges per family for this session
  const familyIds = [...new Set(rows.map(r => r.family_id))]
  const { data: charges } = familyIds.length > 0
    ? await supabase
        .from('charges')
        .select('id, family_id, booking_id, amount_cents, status, description')
        .eq('session_id', sessionId)
        .in('family_id', familyIds)
    : { data: [] }

  const totalCents = activeRows.reduce((sum, r) => sum + (r.price_cents ?? 0), 0)

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/admin/privates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Privates
      </Link>

      <div className="rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <p className="text-sm font-medium text-white/80">{isShared ? 'Shared private session' : 'Private session'}</p>
        <h1 className="text-2xl font-bold leading-tight">
          {activeRows.map(r => r.players?.first_name).filter(Boolean).join(' / ') || 'Private session'}
        </h1>
        <p className="mt-1 text-sm text-white/80">
          {session.date ? formatDate(session.date) : ''}
          {session.start_time ? ` · ${formatTime(session.start_time)}` : ''}
          {coach?.name ? ` · with ${coach.name.split(' ')[0]}` : ''}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          {decodeURIComponent(error)}
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge status={session.status} />
          </div>
          {session.start_time && session.end_time && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="size-3.5 shrink-0" />
              <span>{formatTime(session.start_time)} – {formatTime(session.end_time)}</span>
              <span className="ml-auto text-foreground font-medium">{session.duration_minutes ?? ''}min</span>
            </div>
          )}
          {coach && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="size-3.5 shrink-0" />
              <span>{coach.name}</span>
            </div>
          )}
          {totalCents > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="size-3.5 shrink-0" />
              <span className="font-semibold text-foreground">{formatCurrency(totalCents)} total</span>
              {isShared && (
                <span className="text-xs">
                  · {activeRows.map(r => formatCurrency(r.price_cents ?? 0)).join(' + ')}
                </span>
              )}
            </div>
          )}
          {session.status === 'cancelled' && session.cancellation_reason && (
            <div className="text-xs text-danger">Reason: {session.cancellation_reason}</div>
          )}
        </CardContent>
      </Card>

      {/* Players + families */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Users className="size-4" />
            {isShared ? 'Players (shared)' : 'Player'}
          </h2>
          <div className="mt-3 space-y-3">
            {activeRows.map((r, idx) => (
              <div key={r.id} className={idx > 0 ? 'border-t border-border pt-3' : ''}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{r.players?.first_name} {r.players?.last_name}</p>
                  {r.price_cents != null && (
                    <p className="text-sm font-semibold">{formatCurrency(r.price_cents)}</p>
                  )}
                </div>
                {r.families && (
                  <p className="text-xs text-muted-foreground">
                    {r.families.family_name} ({r.families.display_id})
                    {r.families.primary_contact?.phone && (
                      <> · <a href={`tel:${r.families.primary_contact.phone}`} className="text-primary hover:underline">{r.families.primary_contact.phone}</a></>
                    )}
                  </p>
                )}
                {r.is_standing && (
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Standing</p>
                )}
              </div>
            ))}
            {cancelledRows.length > 0 && (
              <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                Cancelled: {cancelledRows.map(r => r.players?.first_name).filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Charges */}
      {(charges ?? []).length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold">Charges</h2>
            <div className="mt-2 divide-y divide-border text-sm">
              {(charges ?? []).map(c => (
                <div key={c.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{c.description}</p>
                    <p className="text-xs text-muted-foreground">{c.status}</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(c.amount_cents)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan `velvety-whistling-boot`: scheduled privates now expose the
          per-player attendance picker inline. Replaces the generic
          <SessionActions> Mark Complete + Cancel card. */}
      {session.status === 'scheduled' && activeRows.length > 0 && (
        <PrivateSessionActionCard
          sessionId={sessionId}
          bookings={activeRows.map(r => ({
            id: r.id,
            playerId: r.player_id,
            playerFirstName: r.players?.first_name ?? 'Player',
            playerLastName: r.players?.last_name ?? null,
            familyId: r.family_id,
            priceCents: r.price_cents ?? 0,
          }))}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/privates">Back to Privates</Link>
        </Button>
        {coach && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/coaches/${coach.id}`}>Coach detail</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
