import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/dates'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { GraduationCap } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function ParentProgramsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  const familyId = userRole?.family_id
  if (!familyId) redirect('/parent')

  // Get family's players to know their levels
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, ball_color, level, status')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .order('first_name')

  const playerLevels = new Set(players?.map(p => p.ball_color).filter(Boolean) ?? [])

  // Get all active programs
  const { data: programs } = await supabase
    .from('programs')
    .select('*, program_roster(id, player_id, status)')
    .eq('status', 'active')
    .order('day_of_week')
    .order('start_time')

  // Get currently enrolled program/player combos for this family
  const playerIds = new Set(players?.map(p => p.id) ?? [])

  // Split programs into recommended (matching player level) and others
  const recommended = programs?.filter(p => playerLevels.has(p.level)) ?? []
  const others = programs?.filter(p => !playerLevels.has(p.level)) ?? []

  function ProgramCard({ program }: { program: NonNullable<typeof programs>[number] }) {
    const roster = program.program_roster ?? []
    const enrolled = roster.filter(r => r.status === 'enrolled')
    const familyEnrolled = enrolled.filter(r => playerIds.has(r.player_id))
    const spotsLeft = program.max_capacity ? program.max_capacity - enrolled.length : null

    return (
      <Link
        href={`/parent/programs/${program.id}`}
        className="block rounded-lg border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/30 hover:bg-primary/5"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-foreground">{program.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {program.day_of_week != null && DAYS[program.day_of_week]}
              {program.start_time && ` · ${formatTime(program.start_time)}`}
              {program.end_time && ` - ${formatTime(program.end_time)}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="secondary" className="capitalize">
              {program.type}
            </Badge>
            <span className="text-xs capitalize text-muted-foreground/60">{program.level}</span>
          </div>
        </div>

        {program.description && (
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{program.description}</p>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex gap-3">
            {program.per_session_cents && (
              <span>{formatCurrency(program.per_session_cents)}/session</span>
            )}
            {program.term_fee_cents && (
              <span>{formatCurrency(program.term_fee_cents)}/term</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {spotsLeft !== null && (
              <span className={spotsLeft <= 2 ? 'text-danger font-medium' : ''}>
                {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Full'}
              </span>
            )}
            {familyEnrolled.length > 0 && (
              <Badge variant="outline" className="bg-success-light text-success border-success/20">
                Enrolled
              </Badge>
            )}
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div>
      <PageHeader title="Available Programs" description="Browse and enrol in programs for your players." />

      {recommended.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-foreground">Recommended for Your Players</h2>
          <p className="mt-1 text-sm text-muted-foreground">Matching your players&apos; current ball level.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {recommended.map((program) => (
              <ProgramCard key={program.id} program={program} />
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">All Programs</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {others.map((program) => (
              <ProgramCard key={program.id} program={program} />
            ))}
          </div>
        </div>
      )}

      {(!programs || programs.length === 0) && (
        <div className="mt-6">
          <EmptyState
            icon={GraduationCap}
            title="No programs available"
            description="Check back soon for new programs."
          />
        </div>
      )}
    </div>
  )
}
