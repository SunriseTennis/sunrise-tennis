import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { WarmToast } from '@/components/warm-toast'
import { RuleEditForm } from './rule-edit-form'

export default async function AdminNotificationRuleEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const { error } = await searchParams

  const supabase = await createClient()
  const { data: rule } = await supabase
    .from('notification_rules')
    .select('id, event_type, audience, enabled, channels, title_template, body_template, body_template_push, url_template, description, updated_at')
    .eq('id', id)
    .single()

  if (!rule) notFound()

  return (
    <div className="space-y-4">
      <Link href="/admin/notifications/rules" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Back to rules
      </Link>

      <PageHeader
        title={`Edit rule`}
        description={rule.event_type}
      />

      {error && <WarmToast variant="danger">{decodeURIComponent(error)}</WarmToast>}

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p><span className="font-medium text-foreground">Description:</span> {rule.description ?? '-'}</p>
          <p>
            Templates use <code className="rounded bg-muted px-1">{`{placeholder}`}</code> syntax.
            Available placeholders depend on the event — common ones are{' '}
            <code className="rounded bg-muted px-1">{'{playerName}'}</code>,{' '}
            <code className="rounded bg-muted px-1">{'{programName}'}</code>,{' '}
            <code className="rounded bg-muted px-1">{'{date}'}</code>,{' '}
            <code className="rounded bg-muted px-1">{'{time}'}</code>,{' '}
            <code className="rounded bg-muted px-1">{'{coachName}'}</code>,{' '}
            <code className="rounded bg-muted px-1">{'{familyName}'}</code>.
            Missing placeholders render as empty.
          </p>
        </CardContent>
      </Card>

      <RuleEditForm rule={{
        id: rule.id,
        audience: rule.audience as 'admins' | 'family' | 'coach' | 'eligible_families',
        enabled: rule.enabled,
        channels: Array.isArray(rule.channels) ? (rule.channels as string[]) : [],
        title_template: rule.title_template,
        body_template: rule.body_template ?? '',
        body_template_push: rule.body_template_push ?? '',
        url_template: rule.url_template ?? '',
      }} />
    </div>
  )
}
