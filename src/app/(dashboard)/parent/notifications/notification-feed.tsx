'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Calendar,
  DollarSign,
  Megaphone,
  CloudRain,
  Trophy,
  Check,
  CheckCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'

interface Notification {
  id: string
  notificationId: string
  readAt: string | null
  createdAt: string | null
  title: string
  body: string | null
  url: string | null
  type: string
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; label: string }> = {
  session_reminder: { icon: Calendar, label: 'Session' },
  payment_receipt: { icon: DollarSign, label: 'Payment' },
  payment_reminder: { icon: DollarSign, label: 'Payment' },
  announcement: { icon: Megaphone, label: 'Announcement' },
  rain_cancel: { icon: CloudRain, label: 'Weather' },
  tournament_open: { icon: Trophy, label: 'Competition' },
  availability_check: { icon: Trophy, label: 'Availability' },
}

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { icon: Bell, label: 'Notification' }
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function NotificationFeed({
  initialNotifications,
}: {
  initialNotifications: Notification[]
}) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const unreadCount = notifications.filter((n) => !n.readAt).length
  const filtered = filter === 'unread' ? notifications.filter((n) => !n.readAt) : notifications

  async function markAsRead(id: string, url?: string | null) {
    await supabase
      .from('notification_recipients')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    )

    if (url && url.startsWith('/') && !url.startsWith('//')) {
      router.push(url)
    }
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.readAt)
    await Promise.all(
      unread.map((n) =>
        supabase
          .from('notification_recipients')
          .update({ read_at: new Date().toISOString() })
          .eq('id', n.id),
      ),
    )
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })),
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Filter + Actions ── */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-[#FFF6ED] text-slate-blue hover:bg-[#FFE8D6]',
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === 'unread'
                ? 'bg-primary text-primary-foreground'
                : 'bg-[#FFF6ED] text-slate-blue hover:bg-[#FFE8D6]',
            )}
          >
            Unread {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs text-primary">
            <CheckCheck className="mr-1 size-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* ── Notification List ── */}
      <div className="overflow-hidden rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] shadow-card">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-blue">
            {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
          </p>
        ) : (
          <div className="divide-y divide-[#F0B8B0]/30">
            {filtered.map((n) => {
              const config = getTypeConfig(n.type)
              const Icon = config.icon
              return (
                <button
                  key={n.id}
                  onClick={() => markAsRead(n.id, n.url)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors',
                    !n.readAt ? 'bg-[#FFF6ED]' : 'hover:bg-[#FFF6ED]',
                  )}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                      !n.readAt
                        ? 'bg-primary/10 text-primary'
                        : 'bg-[#F0B8B0]/20 text-slate-blue',
                    )}
                  >
                    <Icon className="size-4" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'text-sm leading-snug',
                          !n.readAt
                            ? 'font-semibold text-deep-navy'
                            : 'text-deep-navy/80',
                        )}
                      >
                        {n.title}
                      </p>
                      {!n.readAt && (
                        <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    {n.body && (
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-blue line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] font-medium text-slate-blue/60">
                        {config.label}
                      </span>
                      <span className="text-[10px] text-slate-blue/40">·</span>
                      <span className="text-[10px] text-slate-blue/60">
                        {n.createdAt ? formatRelativeTime(n.createdAt) : ''}
                      </span>
                    </div>
                  </div>

                  {/* Read indicator */}
                  {!n.readAt && (
                    <div className="mt-1 shrink-0">
                      <Check className="size-3.5 text-slate-blue/40" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
