'use client'

import { useEffect, useState, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'

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
    // Poll every 60s for new notifications
    const interval = setInterval(loadNotifications, 60000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close dropdown on outside click
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
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-orange-600 hover:text-orange-700"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">No notifications yet</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markAsRead(n.id, n.notification?.url)}
                  className={`block w-full px-4 py-3 text-left hover:bg-gray-50 ${!n.read_at ? 'bg-orange-50' : ''}`}
                >
                  <p className={`text-sm ${!n.read_at ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {n.notification?.title}
                  </p>
                  {n.notification?.body && (
                    <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{n.notification.body}</p>
                  )}
                  {n.created_at && (
                    <p className="mt-1 text-[10px] text-gray-400">
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
