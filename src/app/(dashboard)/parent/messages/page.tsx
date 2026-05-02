// @ts-nocheck — messages table pending migration
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { WarmToast } from '@/components/warm-toast'
import { EmptyState } from '@/components/empty-state'
import { ImageHero } from '@/components/image-hero'
import { MessageList } from './message-list'
import { ComposeForm } from './compose-form'

export default async function ParentMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; compose?: string }>
}) {
  const { error, success, compose } = await searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Get parent's family and coaches
  const { data: role } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  // Fetch messages sent by this user
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('sender_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch coaches for the compose form
  const { data: coaches } = await supabase
    .from('coaches')
    .select('id, name, user_id')
    .eq('status', 'active')
    .not('is_owner', 'eq', true)
    .order('name')

  // Fetch player and program lists for context
  let players: { id: string; firstName: string }[] = []
  let programs: { id: string; name: string }[] = []

  if (role?.family_id) {
    const [playersResult, programsResult] = await Promise.all([
      supabase
        .from('players')
        .select('id, first_name')
        .eq('family_id', role.family_id)
        .eq('status', 'active')
        .order('first_name'),
      supabase
        .from('programs')
        .select('id, name')
        .eq('status', 'active')
        .order('name'),
    ])
    players = (playersResult.data ?? []).map(p => ({ id: p.id, firstName: p.first_name }))
    programs = (programsResult.data ?? []).map(p => ({ id: p.id, name: p.name }))
  }

  const unrepliedCount = (messages ?? []).filter(m => m.admin_reply && !m.read_at).length

  return (
    <div className="space-y-6">
      <ImageHero>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Messages</p>
            <h1 className="text-2xl font-bold">Contact Us</h1>
          </div>
          {unrepliedCount > 0 && (
            <div className="text-right">
              <p className="text-xs font-medium text-white/70">New replies</p>
              <p className="text-2xl font-bold tabular-nums">{unrepliedCount}</p>
            </div>
          )}
        </div>
      </ImageHero>

      {error && (
        <WarmToast variant="danger">{error}</WarmToast>
      )}
      {success && (
        <WarmToast variant="success">{success}</WarmToast>
      )}

      {/* Compose Form */}
      <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <ComposeForm
          coaches={(coaches ?? []).map(c => ({ id: c.id, name: c.name, userId: c.user_id }))}
          players={players}
          programs={programs}
          defaultOpen={compose === 'true'}
        />
      </div>

      {/* Message History */}
      {messages && messages.length > 0 ? (
        <div className="animate-fade-up" style={{ animationDelay: '160ms' }}>
          <MessageList messages={messages} />
        </div>
      ) : (
        <div className="animate-fade-up" style={{ animationDelay: '160ms' }}>
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Send a message to your coach or the admin team. We typically reply within 24 hours."
          />
        </div>
      )}
    </div>
  )
}
