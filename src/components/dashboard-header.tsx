'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SignoutButton } from '@/components/signout-button'
import { RoleSwitcher } from '@/components/role-switcher'
import { NotificationBell } from '@/components/notification-bell'
import { Sun } from 'lucide-react'

export function DashboardHeader() {
  const [displayName, setDisplayName] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [homeHref, setHomeHref] = useState('/dashboard')
  const [singleRole, setSingleRole] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    // Only load once — this component persists across navigations in the layout
    if (loaded.current) return
    loaded.current = true

    const supabase = createClient()

    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const user = session.user
      setDisplayName(user.user_metadata?.full_name || user.email || '')

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)

      const roles = userRoles?.map(r => r.role) ?? []
      const admin = roles.includes('admin')
      setIsAdmin(admin)
      setHomeHref(admin ? '/admin' : `/${roles[0] ?? 'dashboard'}`)
      if (!admin && roles.length === 1) {
        setSingleRole(roles[0])
      }
    }

    loadUser()
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-gradient-to-r from-[#FFF6ED] via-[#FFEAD8]/60 to-[#FFF6ED] backdrop-blur supports-[backdrop-filter]:bg-[#FFF6ED]/90">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link
            href={homeHref}
            className="flex items-center gap-2 text-lg font-bold text-deep-navy transition-colors hover:text-primary"
          >
            <Sun className="size-5 text-secondary" />
            <span>Sunrise Tennis</span>
          </Link>
          {isAdmin && <RoleSwitcher />}
          {singleRole && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize">
              {singleRole}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          {displayName && (
            <span className="hidden text-sm text-muted-foreground sm:inline">{displayName}</span>
          )}
          <SignoutButton />
        </div>
      </div>
      <div className="gradient-stripe h-1" />
    </header>
  )
}
