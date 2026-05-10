'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const ALL_CLASSIFICATIONS = ['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'] as const
type Classification = (typeof ALL_CLASSIFICATIONS)[number]

const CLASS_PILL: Record<Classification, { active: string; inactive: string }> = {
  blue:     { active: 'bg-ball-blue text-white border-ball-blue',         inactive: 'bg-ball-blue/10 text-ball-blue border-ball-blue/30 hover:bg-ball-blue/20' },
  red:      { active: 'bg-ball-red text-white border-ball-red',           inactive: 'bg-ball-red/10 text-ball-red border-ball-red/30 hover:bg-ball-red/20' },
  orange:   { active: 'bg-ball-orange text-white border-ball-orange',     inactive: 'bg-ball-orange/10 text-ball-orange border-ball-orange/30 hover:bg-ball-orange/20' },
  green:    { active: 'bg-ball-green text-white border-ball-green',       inactive: 'bg-ball-green/10 text-ball-green border-ball-green/30 hover:bg-ball-green/20' },
  yellow:   { active: 'bg-ball-yellow text-black border-ball-yellow',     inactive: 'bg-ball-yellow/10 text-yellow-700 border-ball-yellow/30 hover:bg-ball-yellow/20' },
  advanced: { active: 'bg-primary text-white border-primary',             inactive: 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20' },
  elite:    { active: 'bg-foreground text-background border-foreground',  inactive: 'bg-foreground/10 text-foreground border-foreground/30 hover:bg-foreground/20' },
}

const CLASS_INITIAL: Record<Classification, string> = {
  blue: 'B', red: 'R', orange: 'O', green: 'G', yellow: 'Y', advanced: 'A', elite: 'E',
}

/**
 * Inline-edit classifications: chip-toggle, autosave on each change.
 * Same shape as the cell in `/admin/players` table — lifted here for
 * reuse on profile pages.
 */
export function InlineClassifications({
  value,
  onSave,
  size = 'md',
}: {
  value: string[]
  onSave: (next: string[]) => Promise<{ error?: string } | void>
  size?: 'sm' | 'md'
}) {
  const [local, setLocal] = useState<string[]>(value)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setLocal(value) }, [value])

  const set = useMemo(() => new Set(local), [local])

  function toggle(c: Classification) {
    const next = new Set(set)
    if (next.has(c)) next.delete(c)
    else next.add(c)
    const arr = [...next]
    const before = local
    setLocal(arr)
    setError(null)
    startTransition(async () => {
      const res = await onSave(arr)
      if (res && 'error' in res && res.error) {
        setLocal(before)
        setError(res.error)
      }
    })
  }

  const dim = size === 'sm' ? 'size-6 text-[10px]' : 'size-7 text-[11px]'

  return (
    <span className="inline-flex items-center gap-1 flex-wrap" title={error ?? undefined}>
      {ALL_CLASSIFICATIONS.map(c => {
        const active = set.has(c)
        const style = CLASS_PILL[c]
        return (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            title={c}
            className={cn(
              'inline-flex items-center justify-center rounded-full border font-bold transition-colors',
              dim,
              active ? style.active : style.inactive,
            )}
          >
            {CLASS_INITIAL[c]}
          </button>
        )
      })}
      {isPending && <Loader2 className="ml-1 size-3 animate-spin text-muted-foreground" />}
    </span>
  )
}
