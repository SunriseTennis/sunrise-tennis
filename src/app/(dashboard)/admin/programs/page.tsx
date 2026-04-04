import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { GraduationCap, Plus } from 'lucide-react'
import { ProgramViews } from './program-views'
import { GenerateTermSessionsForm } from '../sessions/generate-term-sessions-form'
import { CreateSessionForm } from '../sessions/create-session-form'
import { getCurrentTermRange, getCurrentOrNextTermEnd } from '@/lib/utils/school-terms'

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const supabase = await createClient()

  // Determine date range for session fetching — include current + next term
  const { start: termStart } = getCurrentTermRange(new Date())
  const nextTermEnd = getCurrentOrNextTermEnd(new Date())
  const termEnd = nextTermEnd ? nextTermEnd.toISOString().split('T')[0] : new Date().getFullYear() + '-12-31'

  const [
    { data: programs },
    { data: sessions },
    { data: programCoaches },
    { data: allCoaches },
    { data: allVenues },
  ] = await Promise.all([
    supabase
      .from('programs')
      .select('*, venues(id, name), program_roster(count)')
      .order('day_of_week')
      .order('start_time'),
    supabase
      .from('sessions')
      .select('id, program_id, date, start_time, end_time, status, coach_id, coaches:coach_id(name), venues:venue_id(name)')
      .gte('date', termStart)
      .lte('date', termEnd)
      .order('date')
      .order('start_time'),
    supabase
      .from('program_coaches')
      .select('program_id, coach_id, role, coaches:coach_id(name)'),
    supabase.from('coaches').select('id, name').eq('status', 'active').order('name'),
    supabase.from('venues').select('id, name').order('name'),
  ])

  // Count booked players per session (attendances + bookings)
  const sessionIds = (sessions ?? []).map(s => s.id)
  let attendanceCounts: Record<string, number> = {}
  if (sessionIds.length > 0) {
    const { data: counts } = await supabase
      .from('attendances')
      .select('session_id')
      .in('session_id', sessionIds)
    if (counts) {
      for (const row of counts) {
        attendanceCounts[row.session_id] = (attendanceCounts[row.session_id] ?? 0) + 1
      }
    }
  }

  // Build program coaches map: programId -> { lead: string, assistants: string[] }
  const coachMap: Record<string, { lead: string; assistants: string[] }> = {}
  for (const pc of programCoaches ?? []) {
    const coachName = (pc.coaches as unknown as { name: string } | null)?.name ?? 'Unknown'
    if (!coachMap[pc.program_id]) {
      coachMap[pc.program_id] = { lead: '', assistants: [] }
    }
    if (pc.role === 'primary') {
      coachMap[pc.program_id].lead = coachName
    } else {
      coachMap[pc.program_id].assistants.push(coachName)
    }
  }

  // Build per-program session tallies: completed/cancelled/planned
  const sessionTallies: Record<string, { completed: number; cancelled: number; planned: number }> = {}
  for (const s of sessions ?? []) {
    if (!s.program_id) continue
    if (!sessionTallies[s.program_id]) sessionTallies[s.program_id] = { completed: 0, cancelled: 0, planned: 0 }
    if (s.status === 'completed') sessionTallies[s.program_id].completed++
    else if (s.status === 'cancelled' || s.status === 'rained_out') sessionTallies[s.program_id].cancelled++
    else sessionTallies[s.program_id].planned++
  }

  // Serialize sessions for client component
  const serializedSessions = (sessions ?? []).map(s => {
    const coach = s.coaches as unknown as { name: string } | null
    const venue = s.venues as unknown as { name: string } | null
    const programCoachInfo = s.program_id ? coachMap[s.program_id] : null
    return {
      id: s.id,
      programId: s.program_id,
      date: s.date,
      startTime: s.start_time,
      endTime: s.end_time,
      status: s.status,
      coachName: coach?.name ?? programCoachInfo?.lead ?? '',
      venueName: venue?.name ?? '',
      bookedCount: attendanceCounts[s.id] ?? 0,
      leadCoach: programCoachInfo?.lead ?? coach?.name ?? '',
      assistantCoaches: programCoachInfo?.assistants ?? [],
    }
  })

  return (
    <div>
      <PageHeader
        title="Programs"
        action={
          <Button asChild>
            <Link href="/admin/programs/new">
              <Plus className="size-4" />
              Add program
            </Link>
          </Button>
        }
      />

      {error && (
        <div className="mt-4 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}

      {programs && programs.length > 0 ? (
        <div className="mt-6">
          <ProgramViews programs={programs as never} sessions={serializedSessions} sessionTallies={sessionTallies} />
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={GraduationCap}
            title="No programs yet"
            description="Create your first program to start scheduling sessions."
            action={
              <Button asChild size="sm">
                <Link href="/admin/programs/new">Add program</Link>
              </Button>
            }
          />
        </div>
      )}

      {/* Session management tools */}
      <div className="mt-8 space-y-4">
        <GenerateTermSessionsForm />
        <Suspense>
          <CreateSessionForm
            programs={(programs ?? []).map(p => ({ id: p.id, name: p.name }))}
            coaches={allCoaches ?? []}
            venues={allVenues ?? []}
          />
        </Suspense>
      </div>
    </div>
  )
}
