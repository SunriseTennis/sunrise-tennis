import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'

const statusStyles: Record<string, string> = {
  active: 'bg-primary/10 text-primary border-primary/20',
  enrolled: 'bg-success-light text-success border-success/20',
  received: 'bg-success-light text-success border-success/20',
  confirmed: 'bg-success-light text-success border-success/20',
  completed: 'bg-success-light text-success border-success/20',
  scheduled: 'bg-info-light text-info border-info/20',
  lead: 'bg-info-light text-info border-info/20',
  sent: 'bg-info-light text-info border-info/20',
  pending: 'bg-warning-light text-warning border-warning/20',
  overdue: 'bg-danger-light text-danger border-danger/20',
  cancelled: 'bg-danger-light text-danger border-danger/20',
  failed: 'bg-danger-light text-danger border-danger/20',
  inactive: 'bg-muted text-muted-foreground border-border',
  draft: 'bg-muted text-muted-foreground border-border',
  archived: 'bg-muted text-muted-foreground border-border',
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border'

  return (
    <Badge
      variant="outline"
      className={cn('capitalize font-medium', style, className)}
    >
      {status}
    </Badge>
  )
}
