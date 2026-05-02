import { redirect } from 'next/navigation'
import { createClient, requireCoach } from '@/lib/supabase/server'
import { EditModeAvailabilityEditor } from '@/components/coach-availability/edit-mode-editor'
import { RangeExceptionForm } from '@/components/coach-availability/range-exception-form'
import { GroupedExceptionList } from '@/components/coach-availability/grouped-exception-list'
import {
  applyAvailabilityChanges,
  addExceptionRange,
  removeExceptionGroup,
} from '../actions'

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
  ] = await Promise.all([
    supabase
      .from('coach_availability')
      .select('id, day_of_week, start_time, end_time')
      .eq('coach_id', coachId)
      .order('day_of_week')
      .order('start_time'),
    supabase
      .from('coach_availability_exceptions')
      .select('*')
      .eq('coach_id', coachId)
      .gte('exception_date', new Date().toISOString().split('T')[0])
      .order('exception_date'),
  ])

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative">
          <p className="text-sm font-medium text-white/80">Coach</p>
          <h1 className="text-2xl font-bold">Availability</h1>
          <p className="mt-0.5 text-sm text-white/70">Set your weekly availability for private lessons</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decodeURIComponent(error)}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {decodeURIComponent(success)}
        </div>
      )}

      <div className="animate-fade-up grid gap-6 lg:grid-cols-3" style={{ animationDelay: '80ms' }}>
        <div className="lg:col-span-2">
          <EditModeAvailabilityEditor
            coachId={coachId!}
            existingBlocks={(windows ?? []).map(w => ({
              id: w.id,
              day_of_week: w.day_of_week,
              start_time: w.start_time,
              end_time: w.end_time,
            }))}
            onSave={applyAvailabilityChanges}
          />
        </div>
        <div className="space-y-3">
          <RangeExceptionForm coachId={coachId!} onAdd={addExceptionRange} />
          <GroupedExceptionList
            exceptions={exceptions ?? []}
            onRemove={removeExceptionGroup}
          />
        </div>
      </div>
    </div>
  )
}
