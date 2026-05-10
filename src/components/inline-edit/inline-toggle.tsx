'use client'

import { useState, useEffect, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Inline boolean toggle. Optimistic local update + rollback on error.
 * Used for media-consent flags. Renders as a small pill-style switch.
 */
export function InlineToggle({
  value,
  onSave,
  label,
  hint,
}: {
  value: boolean
  onSave: (next: boolean) => Promise<{ error?: string } | void>
  label?: string
  hint?: string
}) {
  const [local, setLocal] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setLocal(value) }, [value])

  function toggle() {
    const before = local
    const next = !local
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

  return (
    <span className="inline-flex items-center gap-2" title={error ?? hint}>
      <button
        type="button"
        role="switch"
        aria-checked={local}
        aria-label={label}
        onClick={toggle}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary/40',
          local ? 'bg-success' : 'bg-muted-foreground/30',
          error && 'ring-1 ring-danger/40',
        )}
      >
        <span
          className={cn(
            'inline-block size-4 transform rounded-full bg-white shadow transition-transform',
            local ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      {isPending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
    </span>
  )
}
