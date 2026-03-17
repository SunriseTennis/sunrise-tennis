import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface StatCardProps {
  label: string
  value: string
  href?: string
  icon?: LucideIcon
  variant?: 'default' | 'danger' | 'success'
}

export function StatCard({ label, value, href, icon: Icon, variant = 'default' }: StatCardProps) {
  const content = (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card transition-colors">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <Icon className="size-5 text-muted-foreground" />
        )}
      </div>
      <p className={cn(
        'mt-1 text-3xl font-bold',
        variant === 'danger' && 'text-danger',
        variant === 'success' && 'text-success',
        variant === 'default' && 'text-foreground',
      )}>
        {value}
      </p>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block rounded-lg transition-shadow hover:shadow-elevated hover:ring-2 hover:ring-primary/20">
        {content}
      </Link>
    )
  }

  return content
}
