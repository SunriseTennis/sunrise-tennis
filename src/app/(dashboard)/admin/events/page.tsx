import { createClient, requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { EventsList } from './events-list'

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  await requireAdmin()
  const { error, success } = await searchParams
  const supabase = await createClient()

  const { data: events } = await supabase
    .from('club_events')
    .select('*')
    .order('start_date', { ascending: false })
    .limit(100)

  return (
    <div>
      <PageHeader
        title="Events"
        description="Manage club events, socials, and tournaments."
      />

      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          <CheckCircle className="size-4 shrink-0" />
          {success}
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <EventsList events={events ?? []} />
    </div>
  )
}
