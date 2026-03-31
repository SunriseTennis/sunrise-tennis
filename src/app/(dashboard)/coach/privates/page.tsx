import { requireCoach } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Users } from 'lucide-react'

export default async function CoachPrivatesPage() {
  await requireCoach()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Private Lessons"
        description="Your private lesson requests and upcoming sessions"
      />
      <EmptyState
        icon={Users}
        title="Coming soon"
        description="Private lesson management will be available once the booking flow is built"
      />
    </div>
  )
}
