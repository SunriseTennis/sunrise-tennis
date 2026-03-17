import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ComposeNotificationForm } from './compose-form'

export default async function ComposeNotificationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: programs }, { data: teams }, { data: families }] = await Promise.all([
    supabase.from('programs').select('id, name').eq('status', 'active').order('name'),
    supabase.from('teams').select('id, name').eq('status', 'active').order('name'),
    supabase.from('families').select('id, family_name, display_id').eq('status', 'active').order('display_id'),
  ])

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/notifications" className="text-sm text-gray-500 hover:text-gray-700">&larr; Notifications</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">Compose Notification</h1>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6">
        <ComposeNotificationForm
          programs={programs ?? []}
          teams={teams ?? []}
          families={families ?? []}
        />
      </div>
    </div>
  )
}
