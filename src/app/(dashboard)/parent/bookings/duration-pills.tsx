'use client'

import { cn } from '@/lib/utils/cn'

interface Props {
  duration: 30 | 60
  onChange: (d: 30 | 60) => void
}

export function DurationPills({ duration, onChange }: Props) {
  const options: { value: 30 | 60; label: string }[] = [
    { value: 30, label: '30min' },
    { value: 60, label: '60min' },
  ]

  return (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
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
