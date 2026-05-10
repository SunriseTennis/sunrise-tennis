'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatDate } from '@/lib/utils/dates'

/**
 * Click-to-edit date input. Read-mode renders the formatted date.
 * Stores ISO yyyy-MM-dd string for the column.
 */
export function InlineDate({
  value,
  onSave,
  placeholder = '-',
  className,
}: {
  value: string | null | undefined
  onSave: (next: string | null) => Promise<{ error?: string } | void>
  placeholder?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { setLocal(value ?? '') }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    const next = local || null
    if ((next ?? '') === (value ?? '')) return
    setError(null)
    const before = value ?? null
    startTransition(async () => {
      const res = await onSave(next)
      if (res && 'error' in res && res.error) {
        setLocal(before ?? '')
        setError(res.error)
      }
    })
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'group inline-flex items-center gap-1.5 text-left',
          'rounded px-1.5 py-0.5 -mx-1.5 -my-0.5',
          'hover:bg-primary/5 hover:ring-1 hover:ring-primary/20 transition-colors',
          error && 'ring-1 ring-danger/40',
          className,
        )}
        title={error ?? 'Click to edit'}
      >
        <span className={cn(!value && 'text-muted-foreground italic')}>
          {value ? formatDate(value) : placeholder}
        </span>
        <Pencil className="size-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        {isPending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </button>
    )
  }

  return (
    <input
      ref={ref}
      type="date"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setLocal(value ?? '') }
        if (e.key === 'Enter') { e.preventDefault(); commit() }
      }}
      className="block rounded-md border border-primary bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
    />
  )
}
