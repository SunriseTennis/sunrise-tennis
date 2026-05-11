'use client'

import { useState, useEffect, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'muted'

const TONE_ACTIVE: Record<Tone, string> = {
  primary: 'bg-primary text-primary-foreground border-primary shadow-sm',
  success: 'bg-success text-white border-success shadow-sm',
  warning: 'bg-warning text-white border-warning shadow-sm',
  danger:  'bg-danger text-white border-danger shadow-sm',
  muted:   'bg-muted text-foreground border-border shadow-sm',
}

/**
 * Segmented button group — replaces multi-click `<select>` for short status sets.
 * One click sets the value; visible active state via tone-tinted pill.
 *
 * Optimistic save with rollback on server error (mirrors the inline-edit pattern).
 * If `onSave` is omitted, the component is purely controlled (parent handles persistence).
 */
export function InlineSegmented<T extends string>({
  value,
  options,
  onSave,
  onChange,
  size = 'md',
  className,
  disabled,
}: {
  value: T
  options: { value: T; label: string; tone?: Tone; icon?: React.ReactNode }[]
  /** Async — optimistic save with rollback. */
  onSave?: (next: T) => Promise<{ error?: string } | void>
  /** Sync — controlled-mode change handler (no save). */
  onChange?: (next: T) => void
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
}) {
  const [local, setLocal] = useState<T>(value)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setLocal(value) }, [value])

  function pick(next: T) {
    if (next === local || disabled) return
    const before = local
    setLocal(next)
    setError(null)
    if (onChange) onChange(next)
    if (onSave) {
      startTransition(async () => {
        const res = await onSave(next)
        if (res && 'error' in res && res.error) {
          setLocal(before)
          setError(res.error)
        }
      })
    }
  }

  const padX = size === 'sm' ? 'px-2.5' : 'px-3'
  const padY = size === 'sm' ? 'py-1' : 'py-1.5'
  const txt  = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-border bg-background/60 p-0.5',
        error && 'ring-1 ring-danger/40',
        className,
      )}
      role="group"
      title={error ?? undefined}
    >
      {options.map((o) => {
        const active = o.value === local
        const tone = o.tone ?? 'primary'
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            disabled={disabled || isPending}
            className={cn(
              'rounded-md border border-transparent font-medium transition-all',
              padX, padY, txt,
              active
                ? TONE_ACTIVE[tone]
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              (disabled || isPending) && 'opacity-60 cursor-not-allowed',
              'flex items-center gap-1.5',
            )}
            aria-pressed={active}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
      {isPending && <Loader2 className="size-3 animate-spin text-muted-foreground ml-0.5" />}
    </div>
  )
}
