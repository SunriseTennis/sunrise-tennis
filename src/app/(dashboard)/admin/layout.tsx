'use client'

import { NavTabs } from '@/components/nav-tabs'
import {
  LayoutDashboard,
  Users,
  UserCheck,
  GraduationCap,
  Calendar,
  CreditCard,
  Bell,
  Trophy,
  Swords,
  UserPlus,
} from 'lucide-react'

const navItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/families', label: 'Families', icon: Users },
  { href: '/admin/players', label: 'Players', icon: UserCheck },
  { href: '/admin/programs', label: 'Programs', icon: GraduationCap },
  { href: '/admin/sessions', label: 'Sessions', icon: Calendar },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/privates', label: 'Privates', icon: UserPlus },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/admin/competitions', label: 'Comps', icon: Swords },
  { href: '/admin/teams', label: 'Teams', icon: Trophy },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <NavTabs items={navItems} />
      {children}
    </div>
  )
}
