import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Bell, Send, CheckCircle, Eye } from 'lucide-react'

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

  // Fetch read receipt stats for each notification
  const notificationIds = (notifications ?? []).map(n => n.id)
  let readStats: Record<string, { total: number; read: number }> = {}
  if (notificationIds.length > 0) {
    const { data: recipients } = await supabase
      .from('notification_recipients')
      .select('notification_id, read_at')
      .in('notification_id', notificationIds)

    if (recipients) {
      for (const r of recipients) {
        if (!readStats[r.notification_id]) {
          readStats[r.notification_id] = { total: 0, read: 0 }
        }
        readStats[r.notification_id].total++
        if (r.read_at) readStats[r.notification_id].read++
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Send and view push notifications."
        action={
          <Button asChild>
            <Link href="/admin/notifications/compose">
              <Send className="size-4" />
              Compose
            </Link>
          </Button>
        }
      />

      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          <CheckCircle className="size-4 shrink-0" />
          {success}
        </div>
      )}

      {notifications && notifications.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Read</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((n) => {
                const stats = readStats[n.id]
                const readPct = stats && stats.total > 0 ? Math.round((stats.read / stats.total) * 100) : 0
                return (
                  <TableRow key={n.id}>
                    <TableCell>
                      <div className="font-medium">{n.title}</div>
                      {n.body && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{n.body}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {n.type.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {n.target_type}
                      {n.target_level && ` (${n.target_level})`}
                    </TableCell>
                    <TableCell>
                      {stats ? (
                        <div className="flex items-center gap-1.5">
                          <Eye className="size-3.5 text-muted-foreground" />
                          <span className="text-sm tabular-nums">
                            {stats.read}/{stats.total}
                          </span>
                          <span className={`text-xs ${readPct >= 80 ? 'text-success' : readPct >= 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            ({readPct}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {n.sent_at
                        ? new Date(n.sent_at).toLocaleDateString('en-AU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '-'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={Bell}
            title="No notifications sent yet"
            description="Compose your first notification to reach families."
            action={
              <Button asChild size="sm">
                <Link href="/admin/notifications/compose">Compose</Link>
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
