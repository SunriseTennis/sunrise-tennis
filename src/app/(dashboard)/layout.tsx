import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignoutButton } from '@/components/signout-button'
import { RoleSwitcher } from '@/components/role-switcher'
import { NotificationBell } from '@/components/notification-bell'
import { PushPrompt } from '@/components/push-prompt'
import { Sun } from 'lucide-react'

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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link
              href={isAdmin ? '/admin' : `/${roles[0] ?? 'dashboard'}`}
              className="flex items-center gap-2 text-lg font-bold text-foreground transition-colors hover:text-primary"
            >
              <Sun className="size-5 text-primary" />
              <span>Sunrise Tennis</span>
            </Link>
            {isAdmin && <RoleSwitcher />}
            {!isAdmin && roles[0] && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize">
                {roles[0]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <span className="hidden text-sm text-muted-foreground sm:inline">{displayName}</span>
            <SignoutButton />
          </div>
        </div>
        <div className="gradient-stripe h-[2px]" />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <PushPrompt />
        {children}
      </main>
    </div>
  )
}
