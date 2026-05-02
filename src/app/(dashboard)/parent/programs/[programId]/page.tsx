import { redirect, notFound } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateFriendly, formatTime } from '@/lib/utils/dates'
import { EnrolForm } from './enrol-form'
import Link from 'next/link'
import { ImageHero } from '@/components/image-hero'
import { WarmToast } from '@/components/warm-toast'
import { Calendar, MapPin, DollarSign, Users, CheckCircle } from 'lucide-react'
import { UnenrolButton } from './unenrol-button'
import { isEligible } from '@/lib/utils/eligibility'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_PREFIXES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const LEVEL_BAR: Record<string, string> = {
  blue: 'bg-ball-blue',
  red: 'bg-ball-red',
  orange: 'bg-ball-orange',
  green: 'bg-ball-green',
  yellow: 'bg-ball-yellow',
  advanced: 'bg-primary',
  elite: 'bg-foreground',
}

function stripDayPrefix(name: string, type: string): string {
  const lower = name.toLowerCase()
  for (const prefix of DAY_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      const stripped = name.slice(prefix.length + 1)
      const suffix = type === 'group' ? ' Group' : type === 'squad' ? ' Squad' : ''
      return stripped + suffix
    }
  }
  return name
}

export default async function ParentProgramDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { programId } = await params
  const { error, success } = await searchParams
  const supabase = await createClient()

  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  const familyId = userRole?.family_id
  if (!familyId) redirect('/parent')

  // Fetch program, family players, and roster in parallel
  const [
    { data: program },
    { data: players },
    { data: roster },
    { data: upcomingSessions },
    { data: balance },
  ] = await Promise.all([
    supabase.from('programs').select('*, venues:venue_id(name, address)').eq('id', programId).single(),
    supabase.from('players').select('id, first_name, last_name, ball_color, level, status, gender, classifications, track').eq('family_id', familyId).eq('status', 'active').order('first_name'),
    supabase.from('program_roster').select('id, player_id, status').eq('program_id', programId),
    supabase.from('sessions').select('id, date, start_time, end_time, status')
      .eq('program_id', programId)
      .gte('date', new Date().toISOString().split('T')[0])
      .eq('status', 'scheduled')
      .order('date'),
    supabase.from('family_balance').select('confirmed_balance_cents').eq('family_id', familyId).single(),
  ])

  if (!program) notFound()

  const confirmedCreditCents = Math.max(0, balance?.confirmed_balance_cents ?? 0)

  const venue = program.venues as unknown as { name: string; address: string | null } | null
  const enrolledPlayerIds = new Set(
    roster?.filter(r => r.status === 'enrolled').map(r => r.player_id) ?? []
  )
  const totalEnrolled = roster?.filter(r => r.status === 'enrolled').length ?? 0
  const spotsLeft = program.max_capacity ? program.max_capacity - totalEnrolled : null

  const enrolledPlayers = players?.filter(p => enrolledPlayerIds.has(p.id)) ?? []
  const eligiblePlayers = (players ?? []).filter(p => {
    if (enrolledPlayerIds.has(p.id)) return false
    return isEligible(
      { gender: (p.gender as 'male' | 'female' | 'non_binary' | null) ?? null, classifications: (p.classifications as string[] | null) ?? [], track: p.track ?? null },
      { day_of_week: program.day_of_week, allowed_classifications: program.allowed_classifications, gender_restriction: program.gender_restriction, track_required: program.track_required },
    ).ok
  })

  const displayName = stripDayPrefix(program.name, program.type)
  const levelBar = LEVEL_BAR[program.level] ?? 'bg-gradient-to-b from-primary to-secondary'
  const dayLabel = program.day_of_week != null ? DAYS[program.day_of_week] : null
  const timeLabel = program.start_time && program.end_time
    ? `${formatTime(program.start_time)} - ${formatTime(program.end_time)}`
    : null
  const subtitle = [dayLabel, timeLabel, venue?.name].filter(Boolean).join(' · ')

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <ImageHero>
        <div>
          <Link
            href="/parent/programs"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            ← Programs
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{displayName}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-white/80">{subtitle}</p>
          )}
        </div>
      </ImageHero>

      {/* ── Toasts ── */}
      {error && <WarmToast variant="danger">{error}</WarmToast>}
      {success && <WarmToast variant="success">{success}</WarmToast>}

      {/* ── Program Details ── */}
      <div
        className="animate-fade-up stagger-children"
        style={{ '--i': 0 } as React.CSSProperties}
      >
        <div className="flex overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div className={`w-1 shrink-0 ${levelBar}`} />
          <div className="flex-1 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-white capitalize">
                {program.type}
              </span>
              <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
                {program.level} ball
              </span>
            </div>

            {program.description && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{program.description}</p>
            )}

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {dayLabel && (
                <div className="flex items-start gap-2.5">
                  <Calendar className="mt-0.5 size-4 text-primary/60" />
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Schedule</dt>
                    <dd className="text-sm text-foreground">
                      {dayLabel}{timeLabel ? ` · ${timeLabel}` : ''}
                    </dd>
                  </div>
                </div>
              )}
              {venue && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 text-primary/60" />
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Venue</dt>
                    <dd className="text-sm text-foreground">{venue.name}</dd>
                  </div>
                </div>
              )}
              {program.per_session_cents && (
                <div className="flex items-start gap-2.5">
                  <DollarSign className="mt-0.5 size-4 text-primary/60" />
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Per Session</dt>
                    <dd className="text-sm text-foreground">{formatCurrency(program.per_session_cents)}</dd>
                  </div>
                </div>
              )}
              {program.per_session_cents && upcomingSessions && upcomingSessions.length > 0 && (
                <div className="flex items-start gap-2.5">
                  <DollarSign className="mt-0.5 size-4 text-primary/60" />
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Term Fee</dt>
                    <dd className="text-sm text-foreground">
                      {formatCurrency(program.per_session_cents * upcomingSessions.length)}
                      <span className="ml-1.5 text-xs text-muted-foreground">({upcomingSessions.length} sessions)</span>
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* ── Enrolled Players ── */}
      {enrolledPlayers.length > 0 && (
        <div
          className="animate-fade-up flex overflow-hidden rounded-xl border border-success/20 bg-card shadow-card"
          style={{ animationDelay: '80ms' }}
        >
          <div className="w-1 shrink-0 bg-gradient-to-b from-success to-success/60" />
          <div className="flex-1 p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Users className="size-4 text-success" />
              Enrolled
            </h2>
            <div className="mt-3 space-y-2">
              {enrolledPlayers.map((player) => (
                <div key={player.id} className="flex items-center gap-2.5 text-sm text-foreground">
                  <CheckCircle className="size-3.5 text-success" />
                  <span className="flex-1">{player.first_name} {player.last_name}</span>
                  <UnenrolButton
                    programId={programId}
                    playerId={player.id}
                    playerName={player.first_name}
                    programName={displayName}
                    remainingSessions={upcomingSessions?.length ?? 0}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Enrol Form ── */}
      {eligiblePlayers.length > 0 && (spotsLeft === null || spotsLeft > 0) && (
        <div className="animate-fade-up" style={{ animationDelay: '160ms' }}>
          <EnrolForm
            programId={programId}
            familyId={familyId}
            players={eligiblePlayers.map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, level: p.ball_color }))}
            programLevel={program.level}
            termFeeCents={program.term_fee_cents}
            perSessionCents={program.per_session_cents}
            earlyPayDiscountPct={program.early_pay_discount_pct}
            earlyBirdDeadline={program.early_bird_deadline}
            earlyPayDiscountPctTier2={program.early_pay_discount_pct_tier2}
            earlyBirdDeadlineTier2={program.early_bird_deadline_tier2}
            remainingSessions={upcomingSessions?.length ?? null}
            confirmedCreditCents={confirmedCreditCents}
          />
        </div>
      )}

      {eligiblePlayers.length === 0 && enrolledPlayers.length > 0 && (
        <WarmToast variant="info" dismissible={false}>
          All your players are already enrolled in this program.
        </WarmToast>
      )}

      {spotsLeft === 0 && eligiblePlayers.length > 0 && (
        <WarmToast variant="warning" dismissible={false}>
          This program is currently full. Contact your coach if you&apos;d like to be added to a waitlist.
        </WarmToast>
      )}

      {/* ── Upcoming Sessions ── */}
      {upcomingSessions && upcomingSessions.length > 0 && (
        <div
          className="animate-fade-up overflow-hidden rounded-xl border border-border bg-card shadow-card"
          style={{ animationDelay: '240ms' }}
        >
          <div className="border-b border-border/60 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Calendar className="size-4 text-primary" />
              Upcoming Sessions
            </h2>
          </div>
          <div className="divide-y divide-border/40">
            {upcomingSessions.map((session) => (
              <div key={session.id} id={`session-${session.id}`} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-foreground">{formatDateFriendly(session.date)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {session.start_time ? formatTime(session.start_time) : '-'}
                  {session.end_time ? ` - ${formatTime(session.end_time)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
