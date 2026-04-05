'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { NAV_ICONS } from '@/components/nav-icon-map'
import type { NavIconName } from '@/components/nav-icon-map'

interface NavItem {
  href: string
  label: string
  icon?: NavIconName
  badge?: number | boolean
}

interface NavTabsProps {
  items: NavItem[]
}

export function NavTabs({ items }: NavTabsProps) {
  const pathname = usePathname()

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-gradient-to-r from-[#FDD5D0] to-[#FFE0C4] p-1.5 shadow-card">
      {items.map((item) => {
        const isActive = pathname === item.href ||
          (item.href !== items[0]?.href && pathname.startsWith(item.href))

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all',
              isActive
                ? 'bg-primary text-white shadow-sm'
                : 'text-deep-navy/70 hover:bg-white/60 hover:text-foreground'
            )}
          >
            {item.icon && (() => { const Icon = NAV_ICONS[item.icon]; return Icon ? <Icon className="size-4" /> : null })()}
            {item.label}
            {item.badge && (
              <span className={cn(
                'ml-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold',
                isActive ? 'bg-white/30 text-white' : 'bg-danger text-white'
              )}>
                {typeof item.badge === 'number' ? (item.badge > 9 ? '9+' : item.badge) : ''}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
