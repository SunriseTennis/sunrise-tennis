'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/empty-state'
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  List,
  Pencil,
  Trash2,
  Users,
  XCircle,
  X,
} from 'lucide-react'
import { AdminPrivatesCalendar } from './admin-privates-calendar'
import { BookPrivateModal } from './book-private-modal'
import { ManagePrivateSessionModal } from '@/components/admin/manage-private-session-modal'
import {
  cancelPrivateSeries,
  modifyPrivateSeries,
  voidPrivateSeries,
} from './actions'

export type Booking = {
  id: string
  familyId: string
  playerId: string
  playerName: string
  playerFirstName: string
  familyDisplayId: string
  familyName: string
  coachId: string
  coachName: string
  coachIsOwner: boolean
  date: string
  startTime: string
  endTime: string
  sessionStatus: string
  status: string
  approvalStatus: string
  priceCents: number
  durationMinutes: number
  bookedAt: string | null
  isStanding: boolean
  standingParentId: string | null
  sharedWithBookingId: string | null
  sessionId: string | null
  partnerFirstName: string | null
  partnerLastName: string | null
  partnerFamilyName: string | null
}

type Tab = 'pending' | 'calendar' | 'series' | 'all'

type Series = {
  key: string
  parentBookingId: string
  primaryFamilyName: string
  primaryFamilyDisplayId: string
  primaryPlayerFirstName: string
  partnerPlayerFirstName: string | null
  partnerFamilyName: string | null
  coachName: string
  coachIsOwner: boolean
  coachId: string
  isShared: boolean
  isStanding: boolean
  durationMinutes: number
  startTime: string
  dayOfWeek: number | null
  pricePerSessionCents: number  // total for the session (sum of both halves when shared)
  totalCents: number            // sum of every booking's price across the whole series
  bookings: Booking[]
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function chainKey(b: Booking): string {
  // The standing-chain key for a single family. Standing children point at
  // their parent; standing parents point at themselves; one-offs at themselves.
  return b.standingParentId ?? b.id
}

function dayOfWeekFor(dateString: string): number | null {
  if (!dateString) return null
  const d = new Date(dateString + 'T12:00:00')
  return d.getDay()
}

// Union-find over chain keys: any two chains that share a session
// (i.e. any booking has shared_with_booking_id pointing into the other) get
// merged into a single series.
function buildSeries(bookings: Booking[]): Series[] {
  // First pass: bucket by single-family chain key.
  const chains = new Map<string, Booking[]>()
  for (const b of bookings) {
    const k = chainKey(b)
    const list = chains.get(k) ?? []
    list.push(b)
    chains.set(k, list)
  }

  // Union-find roots over chain keys.
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let cur = k
    while (parent.get(cur) && parent.get(cur) !== cur) cur = parent.get(cur)!
    return cur
  }
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b)
    if (ra === rb) return
    // Pick the smaller key as canonical so the result is deterministic.
    const [keep, drop] = ra < rb ? [ra, rb] : [rb, ra]
    parent.set(drop, keep)
  }
  // Initialise
  for (const k of chains.keys()) parent.set(k, k)

  // Second pass: merge any two chains whose bookings share a session via
  // shared_with_booking_id.
  const idToChainKey = new Map<string, string>()
  for (const [ck, list] of chains) for (const b of list) idToChainKey.set(b.id, ck)
  for (const [ck, list] of chains) {
    for (const b of list) {
      if (!b.sharedWithBookingId) continue
      const partnerChain = idToChainKey.get(b.sharedWithBookingId)
      if (partnerChain && partnerChain !== ck) union(ck, partnerChain)
    }
  }

  // Re-bucket by union-find root.
  const merged = new Map<string, Booking[]>()
  for (const [ck, list] of chains) {
    const root = find(ck)
    const acc = merged.get(root) ?? []
    for (const b of list) acc.push(b)
    merged.set(root, acc)
  }

  const series: Series[] = []
  for (const [, list] of merged) {
    // Distinct families in the merged group.
    const families = new Map<string, Booking>()
    for (const b of list) {
      const existing = families.get(b.familyId)
      if (!existing || (b.date ?? '') < (existing.date ?? '')) {
        families.set(b.familyId, b)
      }
    }
    const distinctFamilies = [...families.values()].sort((a, b) => a.familyId.localeCompare(b.familyId))
    const primary = distinctFamilies[0]
    const partner = distinctFamilies[1] ?? null
    const isShared = distinctFamilies.length > 1 || list.some(b => b.sharedWithBookingId !== null)

    // Pick a parent_booking_id for series-level actions. Prefer a row that has
    // standing_parent_id IS NULL AND is_standing = true (i.e. an actual chain
    // parent). For one-offs / non-standing pairs, the booking from primary's
    // family with the earliest date suffices.
    const standingParents = list.filter(b => !b.standingParentId && b.isStanding)
    let parentBookingId =
      standingParents.find(b => b.familyId === primary.familyId)?.id ??
      standingParents[0]?.id ??
      primary.id

    // Per-session price = SUM of all family bookings on that session.
    // Use the earliest scheduled session as a representative for the series
    // price (handles different family halves cleanly).
    const bySession = new Map<string, Booking[]>()
    for (const b of list) {
      const sid = b.sessionId ?? `solo-${b.id}`
      const arr = bySession.get(sid) ?? []
      arr.push(b)
      bySession.set(sid, arr)
    }
    const samplePrice = (() => {
      // Find the first scheduled session and sum its bookings' prices.
      const sample = [...bySession.values()].find(arr => arr.some(b => b.sessionStatus === 'scheduled'))
        ?? [...bySession.values()][0]
      return (sample ?? []).reduce((sum, b) => sum + (b.priceCents ?? 0), 0)
    })()

    // Display "bookings": one entry per real-world session. We pick a
    // representative row per session_id (preferring primary family's row so
    // status icons stay consistent with what admin already saw).
    const repBookings: Booking[] = []
    for (const arr of bySession.values()) {
      arr.sort((a, b) => (a.familyId === primary.familyId ? -1 : 1))
      repBookings.push(arr[0])
    }
    repBookings.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

    // Total = sum across every booking (both families, every session).
    const totalCents = list.reduce((sum, b) => sum + (b.priceCents ?? 0), 0)

    series.push({
      key: parentBookingId,
      parentBookingId,
      primaryFamilyName: primary.familyName,
      primaryFamilyDisplayId: primary.familyDisplayId,
      primaryPlayerFirstName: primary.playerFirstName,
      partnerPlayerFirstName: partner?.playerFirstName ?? null,
      partnerFamilyName: partner?.familyName ?? null,
      coachName: primary.coachName,
      coachIsOwner: primary.coachIsOwner,
      coachId: primary.coachId,
      isShared,
      isStanding: primary.isStanding,
      durationMinutes: primary.durationMinutes,
      startTime: primary.startTime,
      dayOfWeek: dayOfWeekFor(primary.date),
      pricePerSessionCents: samplePrice,
      totalCents,
      bookings: repBookings,
    })
  }

  // Sort: standing first by next scheduled date, then one-offs by date desc
  series.sort((a, b) => {
    const aNext = a.bookings.find(x => x.sessionStatus === 'scheduled')?.date ?? ''
    const bNext = b.bookings.find(x => x.sessionStatus === 'scheduled')?.date ?? ''
    if (aNext && bNext) return aNext.localeCompare(bNext)
    if (aNext) return -1
    if (bNext) return 1
    return (b.bookings[0]?.date ?? '').localeCompare(a.bookings[0]?.date ?? '')
  })

  return series
}

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
  const series = useMemo(() => buildSeries(bookings.filter(b => b.approvalStatus === 'approved')), [bookings])

  const [tab, setTab] = useState<Tab>(hasPending ? 'pending' : 'series')

  // Plan `velvety-whistling-boot`: Calendar tab + Series accordion both open
  // the attendance picker modal when admin clicks on a scheduled private
  // session. Same modal as the /admin overview calendar; replaces the
  // legacy "Convert to solo" flow.
  const [attendanceSessionId, setAttendanceSessionId] = useState<string | null>(null)
  const openAttendance = (sessionId: string) => setAttendanceSessionId(sessionId)

  const tabs: { key: Tab; label: string; icon: typeof List; badge?: number }[] = [
    { key: 'pending', label: 'Pending', icon: AlertCircle, badge: pendingBookings.length || undefined },
    { key: 'series', label: 'Series', icon: Users },
    { key: 'calendar', label: 'Calendar', icon: CalendarDays },
    { key: 'all', label: 'All', icon: List },
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <BookPrivateModal families={families} coaches={coaches} />
      </div>

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

      {tab === 'calendar' && (
        <div className="mt-4">
          <AdminPrivatesCalendar bookings={bookings} onMarkAttendance={openAttendance} />
        </div>
      )}

      {tab === 'series' && (
        <div className="mt-4 space-y-3">
          {series.length === 0 ? (
            <EmptyState icon={Calendar} title="No private series yet" description="Booked privates will appear grouped here." />
          ) : (
            series.map(s => (
              <SeriesAccordion
                key={s.key}
                series={s}
                families={families}
                coaches={coaches}
                onMarkAttendance={openAttendance}
              />
            ))
          )}
        </div>
      )}

      {/* Shared attendance modal for both Calendar + Series tabs. */}
      {attendanceSessionId && (
        <ManagePrivateSessionModal
          open
          sessionId={attendanceSessionId}
          onClose={() => setAttendanceSessionId(null)}
          deepLinkHref={`/admin/sessions/${attendanceSessionId}`}
        />
      )}

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

function BookingRow({ booking: b }: { booking: Booking }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm font-medium">
          {b.playerFirstName || b.playerName}
          <span className="ml-1.5 text-xs text-muted-foreground">({b.familyDisplayId})</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {b.date ? formatDate(b.date) : ''}
          {b.startTime && ` · ${formatTime(b.startTime)}`}
          {b.coachName && ` · ${b.coachName.split(' ')[0]}`}
          {b.priceCents > 0 && ` · ${formatCurrency(b.priceCents)}`}
        </p>
      </div>
      <StatusBadge status={b.status} />
    </div>
  )
}

// ── Series Accordion ────────────────────────────────────────────────────

function SeriesAccordion({
  series,
  families,
  coaches,
  onMarkAttendance,
}: {
  series: Series
  families: { id: string; display_id: string; family_name: string; players: { id: string; first_name: string; last_name: string }[] }[]
  coaches: { id: string; name: string; rate: number }[]
  onMarkAttendance: (sessionId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [modal, setModal] = useState<'cancel' | 'modify' | 'void' | null>(null)

  const scheduled = series.bookings.filter(b => b.sessionStatus === 'scheduled')
  const completed = series.bookings.filter(b => b.sessionStatus === 'completed')
  const cancelled = series.bookings.filter(b => b.sessionStatus === 'cancelled')

  const totalCents = series.totalCents

  const playerLabel = series.isShared && series.partnerPlayerFirstName
    ? `${series.primaryPlayerFirstName} / ${series.partnerPlayerFirstName}`
    : series.primaryPlayerFirstName

  const seriesShape = series.isShared ? 'Shared private' : 'Private'
  const dayLabel = series.dayOfWeek != null ? DOW[series.dayOfWeek] : ''
  const subtitle = [
    series.isStanding && dayLabel ? `${dayLabel}s` : (dayLabel ? `${dayLabel}` : null),
    series.startTime ? formatTime(series.startTime) : null,
    series.durationMinutes ? `${series.durationMinutes}min` : null,
    `${series.bookings.length} session${series.bookings.length === 1 ? '' : 's'}`,
    totalCents ? formatCurrency(totalCents) : null,
  ].filter(Boolean).join(' · ')

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                {playerLabel} <span className="text-xs font-normal text-muted-foreground">— {seriesShape} with {series.coachName.split(' ')[0]}</span>
              </p>
              {series.isShared && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">Shared</span>
              )}
              {series.isStanding && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">Standing</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {scheduled.length} scheduled · {completed.length} completed · {cancelled.length} cancelled
              {series.isShared && series.partnerFamilyName && (
                <> · families: <span className="font-medium">{series.primaryFamilyName}</span> + <span className="font-medium">{series.partnerFamilyName}</span></>
              )}
            </p>
          </div>
          {expanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        </button>

        {expanded && (
          <div className="border-t border-border bg-muted/20">
            {/* Per-session list */}
            <div className="divide-y divide-border/60">
              {series.bookings.map(b => (
                <SessionRow
                  key={b.id}
                  booking={b}
                  onMarkAttendance={onMarkAttendance}
                />
              ))}
            </div>

            {/* Series-level actions */}
            <div className="flex flex-wrap gap-2 border-t border-border bg-card px-4 py-3">
              <Button size="sm" variant="outline" onClick={() => setModal('cancel')} disabled={scheduled.length === 0}>
                <XCircle className="mr-1 size-3.5" />
                Cancel future ({scheduled.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setModal('modify')} disabled={scheduled.length === 0}>
                <Pencil className="mr-1 size-3.5" />
                Modify
              </Button>
              <Button size="sm" variant="outline" className="text-danger hover:text-danger" onClick={() => setModal('void')}>
                <Trash2 className="mr-1 size-3.5" />
                Void
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {modal === 'cancel' && (
        <CancelSeriesModal series={series} onClose={() => setModal(null)} />
      )}
      {modal === 'modify' && (
        <ModifySeriesModal series={series} families={families} coaches={coaches} onClose={() => setModal(null)} />
      )}
      {modal === 'void' && (
        <VoidSeriesModal series={series} onClose={() => setModal(null)} />
      )}
    </Card>
  )
}

function SessionRow({
  booking,
  onMarkAttendance,
}: {
  booking: Booking
  onMarkAttendance: (sessionId: string) => void
}) {
  const sessionStatus = booking.sessionStatus || 'scheduled'
  const statusIcon = sessionStatus === 'completed'
    ? <CheckCircle2 className="size-3.5 text-success" />
    : sessionStatus === 'cancelled'
      ? <XCircle className="size-3.5 text-danger" />
      : <Clock className="size-3.5 text-muted-foreground" />

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 text-sm">
      {statusIcon}
      <span className="text-foreground tabular-nums">{booking.date ? formatDate(booking.date) : '-'}</span>
      <span className="text-muted-foreground">{booking.startTime ? formatTime(booking.startTime) : ''}</span>
      <span className="ml-auto flex items-center gap-2">
        {sessionStatus === 'scheduled' && booking.sessionId && (
          <button
            type="button"
            onClick={() => onMarkAttendance(booking.sessionId!)}
            className="text-xs text-success hover:underline"
            title="Mark attendance for this session"
          >
            <ClipboardCheck className="inline size-3 mr-0.5" />
            Mark attendance
          </button>
        )}
        {booking.sessionId && (
          <Link
            href={`/admin/sessions/${booking.sessionId}`}
            className="text-xs text-primary hover:underline"
          >
            Open
          </Link>
        )}
      </span>
    </div>
  )
}

// ── Modals ─────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-3" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto animate-slide-up rounded-t-2xl sm:rounded-2xl bg-popover p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}

function CancelSeriesModal({ series, onClose }: { series: Series; onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const scheduledCount = series.bookings.filter(b => b.sessionStatus === 'scheduled').length

  function handle() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('parent_booking_id', series.parentBookingId)
      await cancelPrivateSeries(fd)
    })
  }

  return (
    <ModalShell title="Cancel future sessions" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        This cancels {scheduledCount} scheduled session{scheduledCount === 1 ? '' : 's'} in this series. Charges will be voided (full credit) and the famil{series.isShared ? 'ies' : 'y'} notified.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>Back</Button>
        <Button variant="destructive" size="sm" onClick={handle} disabled={pending || scheduledCount === 0}>
          {pending ? 'Cancelling…' : `Cancel ${scheduledCount} session${scheduledCount === 1 ? '' : 's'}`}
        </Button>
      </div>
    </ModalShell>
  )
}

function ModifySeriesModal({
  series,
  families,
  coaches,
  onClose,
}: {
  series: Series
  families: { id: string; display_id: string; family_name: string; players: { id: string; first_name: string; last_name: string }[] }[]
  coaches: { id: string; name: string; rate: number }[]
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const today = new Date().toISOString().split('T')[0]
  const [mode, setMode] = useState<'coach' | 'player'>('coach')
  const [newCoachId, setNewCoachId] = useState(series.coachId)
  const [familyId, setFamilyId] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [fromDate, setFromDate] = useState(today)

  const playersForFamily = useMemo(() => {
    return families.find(f => f.id === familyId)?.players ?? []
  }, [families, familyId])

  function handle() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('parent_booking_id', series.parentBookingId)
      fd.set('from_date', fromDate)
      if (mode === 'coach') {
        fd.set('new_coach_id', newCoachId)
      } else {
        fd.set('new_player_id', playerId)
      }
      await modifyPrivateSeries(fd)
    })
  }

  return (
    <ModalShell title="Modify series" onClose={onClose}>
      <div className="flex gap-1.5">
        <button
          onClick={() => setMode('coach')}
          className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'coach' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
        >
          Change coach
        </button>
        <button
          onClick={() => setMode('player')}
          className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'player' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
        >
          Change player
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {mode === 'coach' ? (
          <div>
            <Label htmlFor="modify_coach">New coach</Label>
            <select
              id="modify_coach"
              value={newCoachId}
              onChange={(e) => setNewCoachId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {coaches.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="modify_family">Family</Label>
              <select
                id="modify_family"
                value={familyId}
                onChange={(e) => { setFamilyId(e.target.value); setPlayerId('') }}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {families.map(f => (
                  <option key={f.id} value={f.id}>{f.display_id} {f.family_name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Pick the family side that should change. Use the partner family for shared privates if their player is changing.</p>
            </div>
            {familyId && (
              <div>
                <Label htmlFor="modify_player">New player</Label>
                <select
                  id="modify_player"
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {playersForFamily.map(p => (
                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <div>
          <Label htmlFor="modify_from">From date (applies to scheduled sessions on/after)</Label>
          <Input
            id="modify_from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>Back</Button>
        <Button
          size="sm"
          onClick={handle}
          disabled={pending || (mode === 'coach' ? !newCoachId : !playerId)}
        >
          {pending ? 'Saving…' : 'Apply'}
        </Button>
      </div>
    </ModalShell>
  )
}

function VoidSeriesModal({ series, onClose }: { series: Series; onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState('')
  const [includeCompleted, setIncludeCompleted] = useState(false)

  function handle() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('parent_booking_id', series.parentBookingId)
      fd.set('confirm', confirm)
      if (includeCompleted) fd.set('include_completed', 'on')
      await voidPrivateSeries(fd)
    })
  }

  return (
    <ModalShell title="Void series — destructive" onClose={onClose}>
      <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
        <p className="font-medium">This permanently deletes:</p>
        <ul className="mt-1 list-disc pl-5 text-xs">
          <li>Every scheduled booking in this series</li>
          <li>Their sessions, charges, payment allocations, and coach earnings</li>
          {series.isShared && <li>The paired family&apos;s rows on every shared session</li>}
        </ul>
        <p className="mt-2 text-xs">Use this only for test data or deliberate clean-up. Type <strong>DELETE</strong> to confirm.</p>
      </div>

      <div className="mt-4">
        <Label htmlFor="void_confirm">Type DELETE</Label>
        <Input id="void_confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1" />
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={includeCompleted}
          onChange={(e) => setIncludeCompleted(e.target.checked)}
          className="rounded border-border"
        />
        Also delete completed sessions (rare — usually keep history)
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>Back</Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handle}
          disabled={pending || confirm.trim().toUpperCase() !== 'DELETE'}
        >
          {pending ? 'Voiding…' : 'Void series'}
        </Button>
      </div>
    </ModalShell>
  )
}

