import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { GraduationCap, Plus } from 'lucide-react'
import { ProgramViews } from './program-views'
import { GenerateTermSessionsForm } from '../sessions/generate-term-sessions-form'
import { CreateSessionForm } from '../sessions/create-session-form'
import { getCurrentOrNextTerm, getTermFromParams } from '@/lib/utils/school-terms'
import { TermPicker } from '@/components/term-picker'

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; term?: string; year?: string }>
}) {
  const { error, success, term: termParam, year: yearParam } = await searchParams
  const supabase = await createClient()

  // Determine which term to show
  const termFromUrl = getTermFromParams({ term: termParam, year: yearParam })
  const currentTerm = termFromUrl
    ? { num: termFromUrl.termNum, year: termFromUrl.year, start: termFromUrl.start, end: termFromUrl.end }
    : (() => {
        const t = getCurrentOrNextTerm(new Date())
        if (!t) {
          const year = new Date().getFullYear()
          return { num: 1, year, start: `${year}-01-01`, end: `${year}-12-31` }
        }
        return {
          num: t.term,
          year: t.year,
          start: t.start.toISOString().split('T')[0],
          end: t.end.toISOString().split('T')[0],
        }
      })()

  const termLabel = `T${currentTerm.num}-${currentTerm.year}`

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
      .select('id, program_id, date, start_time, end_time, status, session_type, coach_id, coaches:coach_id(name), venues:venue_id(name)')
      .gte('date', currentTerm.start)
      .lte('date', currentTerm.end)
      .order('date')
      .order('start_time'),
    supabase
      .from('program_coaches')
      .select('program_id, coach_id, role, coaches:coach_id(name)'),
    supabase.from('coaches').select('id, name').eq('status', 'active').order('name'),
    supabase.from('venues').select('id, name').order('name'),
  ])

  // Filter programs by term — show programs that match the term label or have sessions in this term
  const programIdsWithSessions = new Set((sessions ?? []).map(s => s.program_id).filter(Boolean))
  const filteredPrograms = (programs ?? []).filter(p =>
    p.term === termLabel || programIdsWithSessions.has(p.id) || !p.term
  )

  // Count booked players per session
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

  // Build program coaches map
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

  // Build per-program session tallies
  const sessionTallies: Record<string, { completed: number; cancelled: number; planned: number; scheduled: number }> = {}
  for (const s of sessions ?? []) {
    if (!s.program_id) continue
    if (!sessionTallies[s.program_id]) sessionTallies[s.program_id] = { completed: 0, cancelled: 0, planned: 0, scheduled: 0 }
    if (s.status === 'completed') {
      sessionTallies[s.program_id].completed++
      sessionTallies[s.program_id].scheduled++
    } else if (s.status === 'cancelled' || s.status === 'rained_out') {
      sessionTallies[s.program_id].cancelled++
    } else {
      sessionTallies[s.program_id].planned++
      sessionTallies[s.program_id].scheduled++
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/80">Admin</p>
            <h1 className="text-2xl font-bold">Programs</h1>
            <p className="mt-0.5 text-sm text-white/70">{filteredPrograms.length} programs in {termLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="[&_button]:bg-white/20 [&_button]:text-white [&_button]:border-white/30 [&_button:hover]:bg-white/30">
              <Suspense>
                <TermPicker />
              </Suspense>
            </div>
            <Button asChild className="bg-white/20 text-white border-white/30 hover:bg-white/30 backdrop-blur-sm">
              <Link href="/admin/programs/new">
                <Plus className="size-4" />
                Add program
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}

      {/* ── Program List ── */}
      <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        {filteredPrograms.length > 0 ? (
          <ProgramViews programs={filteredPrograms as never} sessionTallies={sessionTallies} programCoaches={coachMap} />
        ) : (
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
        )}
      </section>

      {/* ── Session Management Tools ── */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: '160ms' }}>
        <GenerateTermSessionsForm />
        <Suspense>
          <CreateSessionForm
            programs={(programs ?? []).map(p => ({ id: p.id, name: p.name }))}
            coaches={allCoaches ?? []}
            venues={allVenues ?? []}
          />
        </Suspense>
      </section>
    </div>
  )
}
