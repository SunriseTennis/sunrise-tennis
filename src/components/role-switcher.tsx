'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

const views = [
  { href: '/admin', label: 'Admin' },
  { href: '/coach', label: 'Coach' },
  { href: '/parent', label: 'Parent' },
]

export function RoleSwitcher() {
  const pathname = usePathname()
  const activeView = views.find(v => pathname.startsWith(v.href))

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-muted p-0.5">
      {views.map((view) => {
        const isActive = activeView?.href === view.href
        return (
          <Link
            key={view.href}
            href={view.href}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {view.label}
          </Link>
        )
      })}
    </div>
  )
}
