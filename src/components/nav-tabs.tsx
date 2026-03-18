'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface NavItem {
  href: string
  label: string
  icon?: LucideIcon
}

interface NavTabsProps {
  items: NavItem[]
}

export function NavTabs({ items }: NavTabsProps) {
  const pathname = usePathname()

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-red-200 p-1.5 shadow-card">
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
            {item.icon && <item.icon className="size-4" />}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
