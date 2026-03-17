import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatTime } from '@/lib/utils/dates'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { GraduationCap } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function CoachProgramsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const coachId = coach?.id
  if (!coachId) {
    return (
      <div>
        <PageHeader title="Programs" />
        <p className="mt-4 text-sm text-muted-foreground">Coach profile not linked.</p>
      </div>
    )
  }

  // Get all programs assigned to this coach
  const { data: assignments } = await supabase
    .from('program_coaches')
    .select('role, programs:program_id(id, name, type, level, day_of_week, start_time, end_time, status, max_capacity)')
    .eq('coach_id', coachId)

  // Get roster counts for each program
  const programIds = assignments?.map(a => {
    const prog = a.programs as unknown as { id: string } | null
    return prog?.id
  }).filter(Boolean) as string[] ?? []

  const { data: rosterCounts } = programIds.length > 0
    ? await supabase
        .from('program_roster')
        .select('program_id')
        .in('program_id', programIds)
        .eq('status', 'enrolled')
    : { data: null }

  const countMap = new Map<string, number>()
  rosterCounts?.forEach(r => {
    countMap.set(r.program_id, (countMap.get(r.program_id) ?? 0) + 1)
  })

  return (
    <div>
      <PageHeader title="My Programs" description="Programs you are assigned to coach." />

      {assignments && assignments.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {assignments.map((assignment) => {
            const program = assignment.programs as unknown as {
              id: string; name: string; type: string; level: string;
              day_of_week: number | null; start_time: string | null; end_time: string | null;
              status: string; max_capacity: number | null
            } | null
            if (!program) return null

            const enrolled = countMap.get(program.id) ?? 0

            return (
              <Card key={program.id}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">{program.name}</p>
                    <div className="flex gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {program.type}
                      </Badge>
                      <Badge variant="outline" className="capitalize bg-info-light text-info border-info/20">
                        {assignment.role}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {program.day_of_week != null && DAYS[program.day_of_week]}
                    {program.start_time && ` · ${formatTime(program.start_time)}`}
                    {program.end_time && ` - ${formatTime(program.end_time)}`}
                  </p>
                  <p className="mt-1 text-sm capitalize text-muted-foreground">
                    Level: {program.level}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enrolled: {enrolled}{program.max_capacity ? ` / ${program.max_capacity}` : ''}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={GraduationCap}
            title="No programs assigned"
            description="You are not assigned to any programs yet."
          />
        </div>
      )}
    </div>
  )
}
