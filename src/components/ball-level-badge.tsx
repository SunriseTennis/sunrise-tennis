import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'

const ballStyles: Record<string, string> = {
  blue: 'bg-ball-blue/10 text-ball-blue border-ball-blue/20',
  red: 'bg-ball-red/10 text-ball-red border-ball-red/20',
  orange: 'bg-ball-orange/10 text-ball-orange border-ball-orange/20',
  green: 'bg-ball-green/10 text-ball-green border-ball-green/20',
  yellow: 'bg-ball-yellow/10 text-ball-yellow border-ball-yellow/20',
}

interface BallLevelBadgeProps {
  ballColor: string
  className?: string
}

export function BallLevelBadge({ ballColor, className }: BallLevelBadgeProps) {
  const style = ballStyles[ballColor.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border'

  return (
    <Badge
      variant="outline"
      className={cn('capitalize font-medium', style, className)}
    >
      {ballColor} ball
    </Badge>
  )
}
