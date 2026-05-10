'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { Loader2, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Inline editor for `text[]` columns rendered as comma-separated tags.
 * Read-mode shows pill chips; click to swap to a comma-separated input.
 * Used for `players.current_focus`.
 */
export function InlineTags({
  value,
  onSave,
  placeholder = '-',
  className,
}: {
  value: string[] | null | undefined
  onSave: (next: string[]) => Promise<{ error?: string } | void>
  placeholder?: string
  className?: string
}) {
  const list = value ?? []
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(list.join(', '))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { setLocal((value ?? []).join(', ')) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    const next = local.split(',').map(s => s.trim()).filter(Boolean)
    if (next.join('|') === list.join('|')) return
    setError(null)
    const before = list
    startTransition(async () => {
      const res = await onSave(next)
      if (res && 'error' in res && res.error) {
        setLocal(before.join(', '))
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
          'group inline-flex items-center gap-1.5 text-left flex-wrap',
          'rounded px-1.5 py-0.5 -mx-1.5 -my-0.5',
          'hover:bg-primary/5 hover:ring-1 hover:ring-primary/20 transition-colors',
          error && 'ring-1 ring-danger/40',
          className,
        )}
        title={error ?? 'Click to edit (comma-separated)'}
      >
        {list.length > 0 ? (
          list.map(t => (
            <span key={t} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
              {t}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground italic">{placeholder}</span>
        )}
        <Pencil className="size-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        {isPending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </button>
    )
  }

  return (
    <input
      ref={ref}
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setLocal(list.join(', ')) }
        if (e.key === 'Enter') { e.preventDefault(); commit() }
      }}
      placeholder="comma, separated, tags"
      className="block w-full rounded-md border border-primary bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
    />
  )
}
