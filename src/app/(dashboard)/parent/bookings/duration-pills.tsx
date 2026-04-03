'use client'

import { cn } from '@/lib/utils/cn'

interface Props {
  duration: 30 | 60
  onChange: (d: 30 | 60) => void
  hourlyRateCents: number
}

export function DurationPills({ duration, onChange, hourlyRateCents }: Props) {
  const options: { value: 30 | 60; label: string }[] = [
    { value: 30, label: `30 min — $${(hourlyRateCents / 200).toFixed(0)}` },
    { value: 60, label: `60 min — $${(hourlyRateCents / 100).toFixed(0)}` },
  ]

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            duration === opt.value
              ? 'bg-primary text-white shadow-sm'
              : 'border border-border text-foreground hover:bg-muted/50'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
