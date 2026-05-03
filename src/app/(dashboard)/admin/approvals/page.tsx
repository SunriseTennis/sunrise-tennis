import Link from 'next/link'
import { ChevronRight, UserPlus, Inbox } from 'lucide-react'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'

interface PageProps {
  searchParams: Promise<{ success?: string; error?: string }>
}

export const dynamic = 'force-dynamic'

export default async function AdminApprovalsPage({ searchParams }: PageProps) {
  await requireAdmin()
  const { success, error } = await searchParams
  const supabase = await createClient()

  const { data: queue } = await supabase
    .from('family_approval_queue')
    .select('id, family_name, primary_contact, created_at, approval_status, signup_source, approval_note, player_count')
    .order('created_at', { ascending: false })

  const nowMs = new Date().getTime()
  const rows = queue ?? []

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          New self-signups awaiting review. Confirm player ball levels + classifications before approving.
        </p>
      </header>

      {success && (
        <div className="rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Inbox className="size-6 text-primary" />
            </div>
            <p className="font-medium text-foreground">All caught up</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              No pending signups. New self-signups appear here automatically.
              Unconfirmed-email signups (typo addresses, abandoned attempts) are not shown.
            </p>
            <Link
              href="/admin/families/new"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
            >
              <UserPlus className="size-4" />
              Or invite a parent to an existing family
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {rows.map(r => {
                const contact = (r.primary_contact ?? {}) as { name?: string; email?: string; phone?: string }
                const created = new Date(r.created_at as string)
                const ageDays = Math.floor((nowMs - created.getTime()) / (1000 * 60 * 60 * 24))
                const statusColor =
                  r.approval_status === 'changes_requested'
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : 'bg-blue-100 text-blue-800 border-blue-200'

                return (
                  <li key={r.id as string}>
                    <Link
                      href={`/admin/approvals/${r.id}`}
                      className="group flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">
                            {r.family_name}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusColor}`}>
                            {r.approval_status === 'changes_requested' ? 'Changes requested' : 'Pending review'}
                          </span>
                          {ageDays >= 2 && (
                            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-800">
                              {ageDays}d waiting
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {contact.name ?? '—'} {contact.email ? `· ${contact.email}` : ''}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground/80">
                          {r.player_count} player{r.player_count === 1 ? '' : 's'} · signed up {created.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                          {r.signup_source === 'self_signup' ? ' · self-signup' : ''}
                        </p>
                      </div>
                      <ChevronRight className="size-5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
