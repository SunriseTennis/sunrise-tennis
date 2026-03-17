'use client'

import { NavTabs } from '@/components/nav-tabs'
import {
  LayoutDashboard,
  GraduationCap,
  CreditCard,
  Trophy,
  Settings,
} from 'lucide-react'

const navItems = [
  { href: '/parent', label: 'Overview', icon: LayoutDashboard },
  { href: '/parent/programs', label: 'Programs', icon: GraduationCap },
  { href: '/parent/payments', label: 'Payments', icon: CreditCard },
  { href: '/parent/teams', label: 'Teams', icon: Trophy },
  { href: '/parent/settings', label: 'Settings', icon: Settings },
]

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <NavTabs items={navItems} />
      {children}
    </div>
  )
}
