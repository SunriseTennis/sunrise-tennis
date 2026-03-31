import { redirect } from 'next/navigation'
import { createClient, requireCoach } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { AvailabilityEditor } from './availability-editor'
import { ExceptionList } from './exception-list'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function CoachAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const { coachId } = await requireCoach()
  if (!coachId) return redirect('/coach?error=No+coach+profile+found') as never
  const supabase = await createClient()

  const [
    { data: windows },
    { data: exceptions },
    { data: coach },
  ] = await Promise.all([
    supabase
      .from('coach_availability')
      .select('*')
      .eq('coach_id', coachId)
      .order('day_of_week')
      .order('start_time'),
    supabase
      .from('coach_availability_exceptions')
      .select('*')
      .eq('coach_id', coachId)
      .gte('exception_date', new Date().toISOString().split('T')[0])
      .order('exception_date'),
    supabase
      .from('coaches')
      .select('pay_period')
      .eq('id', coachId)
      .single(),
  ])

  // Group windows by day
  const windowsByDay = DAY_NAMES.map((name, i) => ({
    day: i,
    name,
    windows: (windows ?? []).filter(w => w.day_of_week === i),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        description="Set your weekly availability for private lessons"
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decodeURIComponent(error)}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {success}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AvailabilityEditor
            windowsByDay={windowsByDay}
            coachId={coachId!}
          />
        </div>
        <div>
          <ExceptionList
            exceptions={exceptions ?? []}
            coachId={coachId!}
            payPeriod={coach?.pay_period ?? 'weekly'}
          />
        </div>
      </div>
    </div>
  )
}
