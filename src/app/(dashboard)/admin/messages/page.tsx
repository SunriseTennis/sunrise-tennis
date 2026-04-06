// @ts-nocheck — messages table not yet migrated
import { createClient } from '@/lib/supabase/server'
import { MessageSquare, CheckCircle } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { AdminMessageList } from './admin-message-list'

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; filter?: string }>
}) {
  const { error, success, filter } = await searchParams
  const supabase = await createClient()

  const showArchived = filter === 'archived'

  let query = supabase
    .from('messages')
    .select(`
      *,
      families:family_id(display_id, family_name),
      players:player_id(first_name),
      programs:program_id(name)
    `)
    .eq('recipient_role', 'admin')
    .order('created_at', { ascending: false })
    .limit(50)

  if (showArchived) {
    query = query.not('archived_at', 'is', null)
  } else {
    query = query.is('archived_at', null)
  }

  const { data: messages } = await query

  const unreadCount = (messages ?? []).filter(m => !m.read_at && !m.archived_at).length

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/80">Admin</p>
            <h1 className="text-2xl font-bold">Messages</h1>
            <p className="mt-0.5 text-sm text-white/70">Parent enquiries and communication</p>
          </div>
          {unreadCount > 0 && (
            <div className="text-right">
              <p className="text-xs font-medium text-white/70">Unread</p>
              <p className="text-2xl font-bold tabular-nums">{unreadCount}</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          <CheckCircle className="size-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        <a
          href="/admin/messages"
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${!showArchived ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          Inbox {unreadCount > 0 && <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">{unreadCount}</Badge>}
        </a>
        <a
          href="/admin/messages?filter=archived"
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${showArchived ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          Archived
        </a>
      </div>

      {messages && messages.length > 0 ? (
        <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <AdminMessageList messages={messages} />
        </div>
      ) : (
        <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <EmptyState
            icon={MessageSquare}
            title={showArchived ? 'No archived messages' : 'No messages yet'}
            description={showArchived ? 'Archived messages will appear here.' : 'Parent messages will appear here when they send enquiries.'}
          />
        </div>
      )}
    </div>
  )
}
