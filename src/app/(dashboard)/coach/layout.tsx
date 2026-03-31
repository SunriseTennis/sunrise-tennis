'use client'

import { NavTabs } from '@/components/nav-tabs'
import {
  LayoutDashboard,
  Calendar,
  GraduationCap,
  Clock,
  Users,
  DollarSign,
} from 'lucide-react'

const navItems = [
  { href: '/coach', label: 'Overview', icon: LayoutDashboard },
  { href: '/coach/schedule', label: 'Schedule', icon: Calendar },
  { href: '/coach/programs', label: 'Programs', icon: GraduationCap },
  { href: '/coach/availability', label: 'Availability', icon: Clock },
  { href: '/coach/privates', label: 'Privates', icon: Users },
  { href: '/coach/earnings', label: 'Earnings', icon: DollarSign },
]

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <NavTabs items={navItems} />
      {children}
    </div>
  )
}
