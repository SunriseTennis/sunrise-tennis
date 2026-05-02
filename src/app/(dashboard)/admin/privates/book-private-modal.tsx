'use client'

import { useEffect, useState } from 'react'
import { X, User, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AdminBookForm } from './bookings/admin-book-form'
import { SharedPrivateForm } from './bookings/shared-private-form'

type Mode = 'single' | 'shared'

interface Props {
  families: { id: string; display_id: string; family_name: string; primary_contact: { name?: string } | null; players: { id: string; first_name: string; last_name: string }[] }[]
  coaches: { id: string; name: string; rate: number }[]
}

export function BookPrivateModal({ families, coaches }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('single')

  // Lock scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const sharedFamilies = families.map(f => ({ id: f.id, display_id: f.display_id, family_name: f.family_name }))

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        Book Private
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="animate-slide-up w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-t-2xl bg-popover shadow-elevated sm:rounded-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/40 bg-popover/95 px-5 py-4 backdrop-blur-sm">
              <h2 className="text-base font-semibold text-foreground">Book Private Lesson</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Tab toggle */}
            <div className="px-5 pt-4">
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === 'single' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <User className="size-3.5" />
                  1-on-1
                </button>
                <button
                  type="button"
                  onClick={() => setMode('shared')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === 'shared' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Users className="size-3.5" />
                  Shared (2 players)
                </button>
              </div>
            </div>

            {/* Form body */}
            <div className="p-5">
              {mode === 'single' ? (
                <AdminBookForm families={families} coaches={coaches} alwaysExpanded />
              ) : (
                <SharedPrivateForm families={sharedFamilies} coaches={coaches} alwaysExpanded />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
