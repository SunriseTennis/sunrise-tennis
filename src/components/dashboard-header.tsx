'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SignoutButton } from '@/components/signout-button'
import { RoleSwitcher } from '@/components/role-switcher'
import { NotificationBell } from '@/components/notification-bell'
import { Sun, UserCheck } from 'lucide-react'

export function DashboardHeader() {
  const [displayName, setDisplayName] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [homeHref, setHomeHref] = useState('/dashboard')
  const [pendingApprovals, setPendingApprovals] = useState(0)
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

      if (admin) {
        // Lightweight count of pending+changes_requested via the approval queue view.
        const { count } = await supabase
          .from('family_approval_queue')
          .select('id', { count: 'exact', head: true })
        setPendingApprovals(count ?? 0)
      }
    }

    loadUser()
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-[#D06440]/30 bg-gradient-to-r from-[#E87450] via-[#6480A4] to-[#2B5EA7]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link
            href={homeHref}
            className="flex items-center gap-2 text-lg font-bold text-white transition-colors hover:text-white/80"
          >
            <Sun className="size-5 text-[#F7CD5D]" />
            <span>Sunrise Tennis</span>
          </Link>
          {isAdmin && <RoleSwitcher />}
          {isAdmin && pendingApprovals > 0 && (
            <Link
              href="/admin/approvals"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
              title={`${pendingApprovals} pending signup${pendingApprovals === 1 ? '' : 's'}`}
            >
              <UserCheck className="size-3.5" />
              Approvals ({pendingApprovals})
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && pendingApprovals > 0 && (
            <Link
              href="/admin/approvals"
              className="sm:hidden inline-flex items-center justify-center rounded-full border border-white/30 bg-white/15 px-2 py-1 text-[10px] font-bold text-white"
              title={`${pendingApprovals} pending signup${pendingApprovals === 1 ? '' : 's'}`}
            >
              {pendingApprovals}
            </Link>
          )}
          <NotificationBell />
          {displayName && (
            <span className="hidden text-sm text-white/70 sm:inline">{displayName}</span>
          )}
          <SignoutButton />
        </div>
      </div>
      <div className="gradient-stripe h-[3px]" />
    </header>
  )
}
