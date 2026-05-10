'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Collapsed-by-default card that expands when the header is clicked.
 * Used for the family page's Custom pricing + Private lesson coaches
 * sections — surfaces Maxim opens infrequently and that bloat the page
 * when always-open.
 *
 * Renders as a regular `<Card>`-shape: rounded-xl border + warm bg.
 * Header chevrons rotate on open.
 */
export function DisclosureCard({
  title,
  hint,
  defaultOpen = false,
  children,
  className,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={cn('rounded-xl border border-border bg-card shadow-sm', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <ChevronDown
          className={cn('size-5 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-6 pb-6 pt-0">
          {children}
        </div>
      )}
    </div>
  )
}
