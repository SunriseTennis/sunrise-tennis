import { createClient, requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { AdminAvailabilityManager } from './admin-availability-manager'

export default async function AdminAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; coach_id?: string }>
}) {
  const { error, coach_id: selectedCoachId } = await searchParams
  await requireAdmin()
  const supabase = await createClient()

  const { data: coaches } = await supabase
    .from('coaches')
    .select('id, name, is_owner, status')
    .eq('status', 'active')
    .order('name')

  // If a coach is selected, load their data
  let windows = null
  let exceptions = null

  if (selectedCoachId) {
    const [windowsRes, exceptionsRes] = await Promise.all([
      supabase
        .from('coach_availability')
        .select('*')
        .eq('coach_id', selectedCoachId)
        .order('day_of_week')
        .order('start_time'),
      supabase
        .from('coach_availability_exceptions')
        .select('*')
        .eq('coach_id', selectedCoachId)
        .gte('exception_date', new Date().toISOString().split('T')[0])
        .order('exception_date'),
    ])
    windows = windowsRes.data
    exceptions = exceptionsRes.data
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coach Availability"
        description="Set availability windows and exceptions for each coach"
        breadcrumbs={[{ label: 'Privates', href: '/admin/privates' }]}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decodeURIComponent(error)}
        </div>
      )}

      <AdminAvailabilityManager
        coaches={coaches ?? []}
        selectedCoachId={selectedCoachId ?? null}
        windows={windows}
        exceptions={exceptions}
      />
    </div>
  )
}
