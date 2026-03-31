import { requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { DollarSign } from 'lucide-react'

export default async function AdminPrivateEarningsPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coach Earnings"
        description="Track and record coach payments"
        breadcrumbs={[{ label: 'Privates', href: '/admin/privates' }]}
      />
      <EmptyState
        icon={DollarSign}
        title="Coming soon"
        description="Coach earnings tracking will be available after private lesson completion is built"
      />
    </div>
  )
}
