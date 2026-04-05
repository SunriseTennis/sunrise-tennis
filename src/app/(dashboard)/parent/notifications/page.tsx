import { createClient, getSessionUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { NotificationFeed } from './notification-feed'

export default async function NotificationsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: recipients } = await supabase
    .from('notification_recipients')
    .select(`
      id,
      notification_id,
      read_at,
      created_at,
      notifications:notification_id(title, body, url, type)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const notifications = (recipients ?? []).map((r) => ({
    id: r.id,
    notificationId: r.notification_id,
    readAt: r.read_at,
    createdAt: r.created_at,
    title: (r.notifications as unknown as { title: string; body: string | null; url: string | null; type: string })?.title ?? '',
    body: (r.notifications as unknown as { title: string; body: string | null; url: string | null; type: string })?.body ?? null,
    url: (r.notifications as unknown as { title: string; body: string | null; url: string | null; type: string })?.url ?? null,
    type: (r.notifications as unknown as { title: string; body: string | null; url: string | null; type: string })?.type ?? 'announcement',
  }))

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Notifications</p>
            <h1 className="text-2xl font-bold">Activity Feed</h1>
          </div>
          {notifications.filter((n) => !n.readAt).length > 0 && (
            <div className="text-right">
              <p className="text-xs font-medium text-white/70">Unread</p>
              <p className="text-2xl font-bold tabular-nums">{notifications.filter((n) => !n.readAt).length}</p>
            </div>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="You'll see session reminders, announcements, and updates here."
          />
        </div>
      ) : (
        <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <NotificationFeed initialNotifications={notifications} />
        </div>
      )}
    </div>
  )
}
