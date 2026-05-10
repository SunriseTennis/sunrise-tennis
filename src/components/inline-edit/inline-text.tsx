'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Click-to-edit text. Read-mode renders as plain styled text; click swaps
 * to an input that autosaves on blur or Enter. Esc cancels.
 *
 * `onSave` is async and may return `{ error }` to roll back; otherwise
 * the optimistic value sticks.
 */
export function InlineText({
  value,
  onSave,
  placeholder = '-',
  type = 'text',
  className,
  inputClassName,
  multiline = false,
}: {
  value: string | null | undefined
  onSave: (next: string) => Promise<{ error?: string } | void>
  placeholder?: string
  type?: 'text' | 'email' | 'tel' | 'url'
  className?: string
  inputClassName?: string
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    setLocal(value ?? '')
  }, [value])

  useEffect(() => {
    if (editing && ref.current) ref.current.focus()
  }, [editing])

  function commit() {
    const trimmed = local.trim()
    setEditing(false)
    if (trimmed === (value ?? '')) return
    setError(null)
    const before = value ?? ''
    startTransition(async () => {
      const res = await onSave(trimmed)
      if (res && 'error' in res && res.error) {
        setLocal(before)
        setError(res.error)
      }
    })
  }

  function cancel() {
    setLocal(value ?? '')
    setEditing(false)
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
          {value || placeholder}
        </span>
        <Pencil className="size-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        {isPending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </button>
    )
  }

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); cancel() }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
        }}
        rows={3}
        className={cn(
          'block w-full rounded-md border border-primary bg-background px-2 py-1 text-sm text-foreground',
          'focus:outline-none focus:ring-1 focus:ring-primary',
          inputClassName,
        )}
      />
    )
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); cancel() }
        if (e.key === 'Enter') { e.preventDefault(); commit() }
      }}
      className={cn(
        'block rounded-md border border-primary bg-background px-2 py-1 text-sm text-foreground',
        'focus:outline-none focus:ring-1 focus:ring-primary',
        inputClassName,
      )}
    />
  )
}
