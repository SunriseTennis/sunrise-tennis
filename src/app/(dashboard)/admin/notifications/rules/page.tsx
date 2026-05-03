import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Bell, Pencil } from 'lucide-react'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { WarmToast } from '@/components/warm-toast'
import { ToggleRuleSwitch } from './toggle-rule-switch'

export default async function AdminNotificationRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  await requireAdmin()
  const { success, error } = await searchParams
  const supabase = await createClient()

  const { data: rules } = await supabase
    .from('notification_rules')
    .select('id, event_type, audience, enabled, channels, title_template, description, updated_at')
    .order('event_type')
    .order('audience')

  return (
    <div>
      <Link href="/admin/notifications" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
        <ChevronLeft className="size-4" /> Back to notifications
      </Link>

      <PageHeader
        title="Notification rules"
        description="Each row defines when a notification fires and who receives it. Toggle, edit, or test individual rules."
      />

      {success && (
        <div className="mt-4">
          <WarmToast variant="success">{decodeURIComponent(success)}</WarmToast>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <WarmToast variant="danger">{decodeURIComponent(error)}</WarmToast>
        </div>
      )}

      {rules && rules.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Event</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-mono text-xs text-foreground">{r.event_type}</div>
                    {r.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{r.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">{r.audience.replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(r.channels) ? r.channels : []).map((c) => (
                        <Badge key={String(c)} variant="outline" className="text-[10px]">{String(c)}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ToggleRuleSwitch ruleId={r.id} enabled={r.enabled} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/notifications/rules/${r.id}/edit`}>
                        <Pencil className="size-3.5" /> Edit
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center">
          <Bell className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No notification rules yet. Run the migration to seed defaults.</p>
        </div>
      )}
    </div>
  )
}
