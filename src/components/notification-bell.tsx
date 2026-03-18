'use client'

import { useEffect, useState, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

interface NotificationItem {
  id: string
  notification_id: string
  read_at: string | null
  created_at: string | null
  notification: {
    title: string
    body: string | null
    url: string | null
    type: string
  }
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 60000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadNotifications() {
    const { data } = await supabase
      .from('notification_recipients')
      .select('id, notification_id, read_at, created_at, notifications:notification_id(title, body, url, type)')
      .order('created_at', { ascending: false })
      .limit(10)

    if (data) {
      setNotifications(
        data.map((d) => ({
          ...d,
          notification: d.notifications as unknown as NotificationItem['notification'],
        })),
      )
    }
  }

  async function markAsRead(recipientId: string, url?: string | null) {
    await supabase
      .from('notification_recipients')
      .update({ read_at: new Date().toISOString() })
      .eq('id', recipientId)

    setNotifications((prev) =>
      prev.map((n) => (n.id === recipientId ? { ...n, read_at: new Date().toISOString() } : n)),
    )

    if (url) {
      window.location.href = url
    }
    setOpen(false)
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read_at)
    await Promise.all(
      unread.map((n) =>
        supabase
          .from('notification_recipients')
          .update({ read_at: new Date().toISOString() })
          .eq('id', n.id),
      ),
    )
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })),
    )
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        className="relative text-white/70 hover:text-white hover:bg-white/10"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-border bg-card shadow-elevated">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markAsRead(n.id, n.notification?.url)}
                  className={cn(
                    'block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50',
                    !n.read_at && 'bg-primary/5'
                  )}
                >
                  <p className={cn(
                    'text-sm',
                    !n.read_at ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  )}>
                    {n.notification?.title}
                  </p>
                  {n.notification?.body && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.notification.body}</p>
                  )}
                  {n.created_at && (
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {new Date(n.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
