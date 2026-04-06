// @ts-nocheck — messages table not yet migrated
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MessageSquare, CheckCircle } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { CoachMessageList } from './coach-message-list'

export default async function CoachMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: messages } = await supabase
    .from('messages')
    .select(`
      *,
      families:family_id(display_id, family_name),
      players:player_id(first_name),
      programs:program_id(name)
    `)
    .eq('recipient_role', 'coach')
    .eq('recipient_id', user.id)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  const unreadCount = (messages ?? []).filter(m => !m.read_at).length

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/80">Coach</p>
            <h1 className="text-2xl font-bold">Messages</h1>
            <p className="mt-0.5 text-sm text-white/70">Parent enquiries directed to you</p>
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

      {messages && messages.length > 0 ? (
        <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <CoachMessageList messages={messages} />
        </div>
      ) : (
        <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Messages from parents will appear here."
          />
        </div>
      )}
    </div>
  )
}
