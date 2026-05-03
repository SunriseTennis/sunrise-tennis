import { createClient, requireAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ActivityTabs } from './activity-tabs'

export default async function AdminActivityPage() {
  await requireAdmin()
  const supabase = await createClient()

  const [
    { data: authEvents },
    { data: auditLog },
    { data: userDirectory },
    { data: securityAlerts },
    { data: activeSessions },
    { data: uninvitedSignups },
    { data: adminRoles },
  ] = await Promise.all([
    // Recent auth events (last 30 days)
    supabase
      .from('auth_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
    // Recent data audit log (last 7 days)
    supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
    // User directory via RPC
    supabase.rpc('get_user_directory'),
    // Security alerts via RPC
    supabase.rpc('get_security_alerts', { p_hours: 72 }),
    // Active sessions via RPC
    supabase.rpc('get_active_sessions'),
    // Uninvited signups
    supabase
      .from('auth_events')
      .select('*')
      .eq('event_type', 'signup')
      .eq('success', true)
      .order('created_at', { ascending: false })
      .limit(50),
    // Admin user IDs — used to filter the "Customers only" view client-side.
    supabase.from('user_roles').select('user_id').eq('role', 'admin'),
  ])

  const adminUserIds = (adminRoles ?? []).map((r) => r.user_id).filter((x): x is string => !!x)

  // Build a user lookup map from user directory for display names
  const userMap: Record<string, string> = {}
  for (const u of userDirectory ?? []) {
    if (u.id) userMap[u.id] = u.full_name || u.email || u.id
  }

  return (
    <div>
      <PageHeader
        title="Activity"
        description="Auth events, user directory, and security monitoring."
      />
      <div className="mt-6">
        <ActivityTabs
          authEvents={authEvents ?? []}
          auditLog={auditLog ?? []}
          userDirectory={userDirectory ?? []}
          securityAlerts={securityAlerts ?? []}
          activeSessions={activeSessions ?? []}
          uninvitedSignups={(uninvitedSignups ?? []).filter(
            (e) => {
              const meta = e.metadata as Record<string, unknown> | null
              return !meta?.invite_token
            }
          )}
          userMap={userMap}
          adminUserIds={adminUserIds}
        />
      </div>
    </div>
  )
}
