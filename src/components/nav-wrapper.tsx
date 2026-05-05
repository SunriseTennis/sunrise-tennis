'use client'

import { usePathname } from 'next/navigation'
import { NavTabs } from '@/components/nav-tabs'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'
import type { NavIconName } from '@/components/nav-icon-map'

export interface NavItem {
  href: string
  label: string
  icon: NavIconName
  badge?: number | boolean
}

interface NavWrapperProps {
  items: NavItem[]
  mobileVisibleCount?: number
  children: React.ReactNode
}

// Plan 20 follow-up — onboarding wizard is a full-screen modal experience.
// Showing the top tabs (desktop) or bottom nav (mobile) lets the parent
// escape mid-wizard, which fragments the flow and leaves their family
// in a half-finished state. Hide both wherever the wizard is mounted.
const HIDE_NAV_PATHS = ['/parent/onboarding']

export function NavWrapper({ items, mobileVisibleCount = 4, children }: NavWrapperProps) {
  const pathname = usePathname()
  const hideNav = HIDE_NAV_PATHS.some((p) => pathname?.startsWith(p))

  const mobileVisible = items.slice(0, mobileVisibleCount)
  const mobileOverflow = items.slice(mobileVisibleCount)

  if (hideNav) {
    // Drop the bottom-padding too — without the bottom nav there's nothing
    // to clear, and the wizard's fixed-overlay layout doesn't need it.
    return <>{children}</>
  }

  return (
    <div className="pb-20 md:pb-0">
      {/* Desktop: top tabs — all items */}
      <div className="hidden md:block">
        <NavTabs items={items} />
      </div>
      {children}
      {/* Mobile: bottom nav with overflow */}
      <MobileBottomNav
        items={mobileVisible}
        overflowItems={mobileOverflow.length > 0 ? mobileOverflow : undefined}
      />
    </div>
  )
}
