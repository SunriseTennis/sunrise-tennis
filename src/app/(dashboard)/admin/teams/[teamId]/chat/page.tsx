import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatThread } from './chat-thread'
import { sendTeamMessage } from '../../actions'
import { PageHeader } from '@/components/page-header'

export default async function AdminTeamChatPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: team } = await supabase.from('teams').select('name').eq('id', teamId).single()
  if (!team) notFound()

  const { data: messages } = await supabase
    .from('team_messages')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true })
    .limit(100)

  // Get sender names
  const senderIds = [...new Set(messages?.map((m) => m.sender_id) ?? [])]
  const { data: senderRoles } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', senderIds)

  // Build a simple name map from roles
  const nameMap = new Map<string, string>()
  senderRoles?.forEach((r) => {
    if (r.role === 'admin') nameMap.set(r.user_id, 'Admin')
    else if (r.role === 'coach') nameMap.set(r.user_id, 'Coach')
    else nameMap.set(r.user_id, 'Parent')
  })

  const action = sendTeamMessage.bind(null, teamId)

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Team Chat"
        breadcrumbs={[
          { label: 'Teams', href: '/admin/teams' },
          { label: team.name, href: `/admin/teams/${teamId}` },
        ]}
      />

      <div className="mt-6">
        <ChatThread
          messages={(messages ?? []).map((m) => ({
            id: m.id,
            body: m.body,
            senderId: m.sender_id,
            senderName: nameMap.get(m.sender_id) ?? 'Unknown',
            createdAt: m.created_at ?? '',
            isOwn: m.sender_id === user?.id,
          }))}
          sendAction={action}
        />
      </div>
    </div>
  )
}
