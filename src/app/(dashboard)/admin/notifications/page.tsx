import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>
}) {
  const { success } = await searchParams
  const supabase = await createClient()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(50)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-600">Send and view push notifications.</p>
        </div>
        <Link
          href="/admin/notifications/compose"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Compose
        </Link>
      </div>

      {success && (
        <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>
      )}

      {notifications && notifications.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Target</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {notifications.map((n) => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div>{n.title}</div>
                    {n.body && <div className="mt-0.5 text-xs text-gray-500 line-clamp-1">{n.body}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {n.type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm capitalize text-gray-500">
                    {n.target_type}
                    {n.target_level && ` (${n.target_level})`}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {n.sent_at
                      ? new Date(n.sent_at).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-sm text-gray-500">No notifications sent yet.</p>
      )}
    </div>
  )
}
