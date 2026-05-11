import Link from 'next/link'
import { ChevronRight, User, Users, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Linked pill components for navigable references in admin tables.
 * Used wherever a player / family / coach name appears as text — wrapping
 * it in one of these turns it into a one-click jump to the detail page.
 *
 * Visual: subtle warm-tinted bg, hover ring + chevron, rounded-md, inline-flex.
 * Sizes: 'sm' (default — inline in tables) and 'md' (in headers / standalone).
 */

type Size = 'sm' | 'md'

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-2 py-0.5 text-xs gap-1',
  md: 'px-2.5 py-1 text-sm gap-1.5',
}

const ICON_SIZE: Record<Size, string> = {
  sm: 'size-3',
  md: 'size-3.5',
}

const BASE =
  'inline-flex items-center rounded-md border border-transparent ' +
  'bg-muted/40 text-foreground hover:bg-primary/10 hover:border-primary/30 ' +
  'hover:text-primary transition-colors max-w-full'

export function PlayerPill({
  familyId,
  playerId,
  name,
  subtitle,
  size = 'sm',
  className,
}: {
  familyId: string
  playerId: string
  name: string
  subtitle?: string | null
  size?: Size
  className?: string
}) {
  return (
    <Link
      href={`/admin/families/${familyId}/players/${playerId}`}
      className={cn(BASE, SIZE_CLASS[size], 'group', className)}
      title={`Open ${name}`}
    >
      <User className={cn(ICON_SIZE[size], 'shrink-0 text-muted-foreground group-hover:text-primary')} />
      <span className="font-medium truncate">{name}</span>
      {subtitle && (
        <span className="text-muted-foreground group-hover:text-primary/70 truncate">· {subtitle}</span>
      )}
      <ChevronRight className={cn(ICON_SIZE[size], 'shrink-0 opacity-0 group-hover:opacity-100 transition-opacity')} />
    </Link>
  )
}

export function FamilyPill({
  familyId,
  displayId,
  familyName,
  size = 'sm',
  className,
}: {
  familyId: string
  displayId?: string | null
  familyName: string
  size?: Size
  className?: string
}) {
  return (
    <Link
      href={`/admin/families/${familyId}`}
      className={cn(BASE, SIZE_CLASS[size], 'group', className)}
      title={`Open family ${familyName}`}
    >
      <Users className={cn(ICON_SIZE[size], 'shrink-0 text-muted-foreground group-hover:text-primary')} />
      {displayId && (
        <span className="font-mono text-muted-foreground group-hover:text-primary/70">{displayId}</span>
      )}
      <span className="font-medium truncate">{familyName}</span>
      <ChevronRight className={cn(ICON_SIZE[size], 'shrink-0 opacity-0 group-hover:opacity-100 transition-opacity')} />
    </Link>
  )
}

export function CoachPill({
  coachId,
  name,
  role,
  size = 'sm',
  className,
}: {
  coachId: string
  name: string
  role?: string | null
  size?: Size
  className?: string
}) {
  return (
    <Link
      href={`/admin/coaches/${coachId}`}
      className={cn(BASE, SIZE_CLASS[size], 'group', className)}
      title={`Open coach ${name}`}
    >
      <GraduationCap className={cn(ICON_SIZE[size], 'shrink-0 text-muted-foreground group-hover:text-primary')} />
      <span className="font-medium truncate">{name}</span>
      {role && (
        <span className="capitalize text-muted-foreground group-hover:text-primary/70">· {role}</span>
      )}
      <ChevronRight className={cn(ICON_SIZE[size], 'shrink-0 opacity-0 group-hover:opacity-100 transition-opacity')} />
    </Link>
  )
}
