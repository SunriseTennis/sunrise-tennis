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

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  // For older: show time for today, date for older
  return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (itemDate.getTime() === today.getTime()) return 'Today'
  if (itemDate.getTime() === yesterday.getTime()) return 'Yesterday'

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function groupByDate(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const groups: { label: string; items: Notification[] }[] = []
  let currentLabel = ''

  for (const n of notifications) {
    const label = n.createdAt ? getDateGroup(n.createdAt) : 'Unknown'
    if (label !== currentLabel) {
      groups.push({ label, items: [] })
      currentLabel = label
    }
    groups[groups.length - 1].items.push(n)
  }

  return groups
}

export function NotificationFeed({
  initialNotifications,
}: {
  initialNotifications: Notification[]
}) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [filter, setFilter] = useState<'unread' | 'read'>('unread')
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const unreadCount = notifications.filter((n) => !n.readAt).length
  const readCount = notifications.length - unreadCount
  const filtered = filter === 'unread'
    ? notifications.filter((n) => !n.readAt)
    : notifications.filter((n) => n.readAt)
  const groups = groupByDate(filtered)

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
          <button
            onClick={() => setFilter('read')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === 'read'
                ? 'bg-primary text-primary-foreground'
                : 'bg-[#FFF6ED] text-slate-blue hover:bg-[#FFE8D6]',
            )}
          >
            Read {readCount > 0 && `(${readCount})`}
          </button>
        </div>
        {filter === 'unread' && unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs text-primary">
            <CheckCheck className="mr-1 size-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* ── Date-Grouped Notification List ── */}
      {groups.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] shadow-card">
          <p className="px-4 py-8 text-center text-sm text-slate-blue">
            {filter === 'unread' ? 'All caught up!' : 'No read notifications yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              {/* Date header */}
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </p>

              <div className="overflow-hidden rounded-xl border border-[#F0B8B0]/60 bg-[#FFFBF7] shadow-card">
                <div className="divide-y divide-[#F0B8B0]/30">
                  {group.items.map((n) => {
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
                        {/* Unread dot */}
                        <div className="mt-2.5 w-2 shrink-0">
                          {!n.readAt && (
                            <div className="size-2 rounded-full bg-primary" />
                          )}
                        </div>

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
                            <span className="shrink-0 text-[10px] text-slate-blue/60 tabular-nums">
                              {n.createdAt ? formatRelativeTime(n.createdAt) : ''}
                            </span>
                          </div>
                          {n.body && (
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-blue line-clamp-2">
                              {n.body}
                            </p>
                          )}
                          <span className="mt-1 inline-block text-[10px] font-medium text-slate-blue/60">
                            {config.label}
                          </span>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
