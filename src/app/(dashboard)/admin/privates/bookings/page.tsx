import { requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Calendar } from 'lucide-react'

export default async function AdminPrivateBookingsPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Private Bookings"
        description="Manage all private lesson bookings"
        breadcrumbs={[{ label: 'Privates', href: '/admin/privates' }]}
      />
      <EmptyState
        icon={Calendar}
        title="Coming soon"
        description="Private booking management will be available after the booking flow is built"
      />
    </div>
  )
}
