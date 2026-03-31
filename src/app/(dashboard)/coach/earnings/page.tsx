import { requireCoach } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { DollarSign } from 'lucide-react'

export default async function CoachEarningsPage() {
  await requireCoach()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        description="Track your earnings from private lessons and group sessions"
      />
      <EmptyState
        icon={DollarSign}
        title="Coming soon"
        description="Earnings tracking will be available once private lesson completion is built"
      />
    </div>
  )
}
