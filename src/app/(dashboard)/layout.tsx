import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignoutButton } from '@/components/signout-button'
import { RoleSwitcher } from '@/components/role-switcher'
import { NotificationBell } from '@/components/notification-bell'
import { PushPrompt } from '@/components/push-prompt'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const roles = userRoles?.map(r => r.role) ?? []
  const isAdmin = roles.includes('admin')
  const displayName = user.user_metadata?.full_name || user.email

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link href={isAdmin ? '/admin' : `/${roles[0] ?? 'dashboard'}`} className="text-lg font-bold text-gray-900">
              Sunrise Tennis
            </Link>
            {isAdmin && <RoleSwitcher />}
            {!isAdmin && roles[0] && (
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700 capitalize">
                {roles[0]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <span className="text-sm text-gray-600">{displayName}</span>
            <SignoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <PushPrompt />
        {children}
      </main>
    </div>
  )
}
