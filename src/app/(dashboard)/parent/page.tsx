import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { Users, GraduationCap, ChevronRight } from 'lucide-react'
import { EnrolledCalendar, PLAYER_CARD_STYLES } from './enrolled-calendar'

export default async function ParentDashboard() {
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
  if (!familyId) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={Users}
          title="No family account linked"
          description="This is how parents see their dashboard once invited."
        />
      </div>
    )
  }

  const [
    { data: family },
    { data: players },
    { data: balance },
    { data: enrollments },
  ] = await Promise.all([
    supabase.from('families').select('*').eq('id', familyId).single(),
    supabase.from('players').select('*').eq('family_id', familyId).order('first_name'),
    supabase.from('family_balance').select('balance_cents').eq('family_id', familyId).single(),
    supabase
      .from('program_roster')
      .select('id, status, players!inner(id, first_name), programs:program_id(id, name, type, level, day_of_week, start_time, end_time, status)')
      .eq('status', 'enrolled')
      .in('player_id', (await supabase.from('players').select('id').eq('family_id', familyId)).data?.map(p => p.id) ?? []),
  ])

  const contact = family?.primary_contact as { name?: string; phone?: string; email?: string } | null
  const balanceCents = balance?.balance_cents ?? 0
  const firstName = contact?.name?.split(' ')[0] ?? 'Parent'

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Welcome back</p>
            <h1 className="text-2xl font-bold">{firstName}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-white/70">Balance</p>
            <p className={`text-2xl font-bold tabular-nums ${
              balanceCents < 0 ? 'text-red-200' :
              balanceCents > 0 ? 'text-emerald-200' :
              'text-white'
            }`}>
              {formatCurrency(balanceCents)}
            </p>
            {balanceCents < 0 && (
              <Link href="/parent/payments" className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30">
                Pay now <ChevronRight className="size-3" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Players ── */}
      <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span className="inline-block h-5 w-1 rounded-full bg-gradient-to-b from-primary to-[#6480A4]" />
          Your Players
        </h2>

        {players && players.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {players.map((player, i) => {
              const style = PLAYER_CARD_STYLES[i % PLAYER_CARD_STYLES.length]

              return (
                <Link
                  key={player.id}
                  href={`/parent/players/${player.id}`}
                  className={`group relative block overflow-hidden rounded-xl p-4 shadow-card transition-all hover:shadow-elevated hover:scale-[1.01] hover:brightness-110 ${style}`}
                  style={{ animationDelay: `${(i + 1) * 80}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold truncate">
                          {player.first_name} {player.last_name}
                        </p>
                        <StatusBadge status={player.status} className="bg-white/20 border-white/30 text-white" />
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={Users}
              title="No players yet"
              description="No players linked to your account yet."
              compact
            />
          </div>
        )}
      </section>

      {/* ── Weekly Schedule (before Upcoming Sessions) ── */}
      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span className="inline-block h-5 w-1 rounded-full bg-gradient-to-b from-[#E87450] to-[#F5B041]" />
          Weekly Schedule
        </h2>

        {enrollments && enrollments.length > 0 ? (
          <div className="mt-3">
            <EnrolledCalendar
              playerOrder={players?.map(p => p.first_name) ?? []}
              enrollments={enrollments.map((enrollment) => {
                const program = enrollment.programs as unknown as {
                  id: string; name: string; type: string; level: string;
                  day_of_week: number | null; start_time: string | null; end_time: string | null; status: string
                } | null
                const enrolledPlayer = enrollment.players as unknown as { id: string; first_name: string } | null
                return {
                  id: enrollment.id,
                  playerName: enrolledPlayer?.first_name ?? '',
                  programId: program?.id ?? '',
                  programName: program?.name ?? '',
                  programType: program?.type ?? '',
                  programLevel: program?.level ?? null,
                  dayOfWeek: program?.day_of_week ?? null,
                  startTime: program?.start_time ?? null,
                  endTime: program?.end_time ?? null,
                }
              })}
            />
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={GraduationCap}
              title="No enrolments"
              description="No program enrolments yet."
              compact
            />
          </div>
        )}
      </section>

    </div>
  )
}
