import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { GraduationCap } from 'lucide-react'
import { ParentProgramFilters } from './program-filters'

export default async function ParentProgramsPage() {
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

  // Get family's players to know their levels
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, ball_color, level, status')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .order('first_name')

  const playerLevels = players?.map(p => p.ball_color).filter(Boolean) as string[] ?? []
  const playerIds = players?.map(p => p.id) ?? []

  // Get all active programs with roster
  const { data: programs } = await supabase
    .from('programs')
    .select('id, name, type, level, day_of_week, start_time, end_time, max_capacity, per_session_cents, term_fee_cents, early_pay_discount_pct, early_bird_deadline, description, program_roster(id, player_id, status)')
    .eq('status', 'active')
    .order('day_of_week')
    .order('start_time')

  // Get all scheduled sessions for active programs
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, program_id, date, start_time, end_time, status')
    .eq('status', 'scheduled')
    .order('date')

  return (
    <div>
      <PageHeader title="Programs" description="Browse sessions and enrol in programs." />

      {programs && programs.length > 0 ? (
        <div className="mt-6">
          <ParentProgramFilters
            programs={programs as never}
            sessions={(sessions ?? []) as never}
            playerLevels={playerLevels}
            familyPlayerIds={playerIds}
            familyPlayers={players?.map(p => ({ id: p.id, name: p.first_name })) ?? []}
          />
        </div>
      ) : (
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
