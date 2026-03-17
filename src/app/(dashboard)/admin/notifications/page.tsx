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
import { Bell, Send, CheckCircle } from 'lucide-react'

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
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((n) => (
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
              ))}
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
