'use client'

import { useState, useEffect, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Inline-edit select. Always rendered as a select (no read/write swap)
 * because select+autosave is the cleanest UX for finite-option fields.
 * Optimistic save with rollback on error.
 */
export function InlineSelect<T extends string>({
  value,
  options,
  onSave,
  placeholder,
  className,
  styles,
}: {
  value: T | null | undefined
  options: { value: T; label: string }[]
  onSave: (next: T) => Promise<{ error?: string } | void>
  placeholder?: string
  className?: string
  /** Optional per-value styling map; key 'placeholder' for null/undefined. */
  styles?: Record<string, string>
}) {
  const [local, setLocal] = useState<T | ''>(value ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setLocal(value ?? '') }, [value])

  function change(next: T) {
    const before = local
    setLocal(next)
    setError(null)
    startTransition(async () => {
      const res = await onSave(next)
      if (res && 'error' in res && res.error) {
        setLocal(before)
        setError(res.error)
      }
    })
  }

  const styleClass = local
    ? styles?.[local] ?? 'bg-background border-border'
    : styles?.placeholder ?? 'bg-background border-border text-muted-foreground'

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={local}
        onChange={(e) => change(e.target.value as T)}
        className={cn(
          'rounded-md border px-2 py-1 text-sm text-foreground capitalize focus:outline-none focus:ring-1 focus:ring-primary',
          styleClass,
          error && 'ring-1 ring-danger/40',
          className,
        )}
        title={error ?? undefined}
      >
        {placeholder && !value && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {isPending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
    </span>
  )
}
