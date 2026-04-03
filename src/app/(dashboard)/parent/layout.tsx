'use client'

import { NavTabs } from '@/components/nav-tabs'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'
import {
  LayoutDashboard,
  GraduationCap,
  CreditCard,
  Trophy,
  Settings,
  CalendarDays,
  UserPlus,
} from 'lucide-react'

const navItems = [
  { href: '/parent', label: 'Overview', icon: LayoutDashboard },
  { href: '/parent/programs', label: 'Programs', icon: GraduationCap },
  { href: '/parent/bookings', label: 'Privates', icon: UserPlus },
  { href: '/parent/payments', label: 'Payments', icon: CreditCard },
  { href: '/parent/teams', label: 'Comp', icon: Trophy },
  { href: '/parent/events', label: 'Events', icon: CalendarDays },
  { href: '/parent/settings', label: 'Settings', icon: Settings },
]

// Mobile: show first 4 + "More" overflow containing the rest
const mobileVisibleItems = navItems.slice(0, 4)
const mobileOverflowItems = navItems.slice(4)

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-20 md:pb-0">
      {/* Desktop: top tabs — all items */}
      <div className="hidden md:block">
        <NavTabs items={navItems} />
      </div>
      {children}
      {/* Mobile: bottom nav with "More" overflow */}
      <MobileBottomNav items={mobileVisibleItems} overflowItems={mobileOverflowItems} />
    </div>
  )
}
