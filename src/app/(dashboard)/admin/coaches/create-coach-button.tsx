'use client'

import { useState, useTransition, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { createCoach } from './actions'
import { Button } from '@/components/ui/button'

export function CreateCoachButton() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)
  const router = useRouter()

  // Required for createPortal — document is not available during SSR.
  useEffect(() => { setMounted(true) }, [])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await createCoach(fd)
      router.refresh()
      setOpen(false)
    })
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
    >
      <Plus className="size-3.5" /> Add Coach
    </button>
  )

  // Portal the modal to <body> so the gradient header's backdrop-blur /
  // overflow doesn't create a containing block that traps `position: fixed`
  // and clips the modal under the header.
  const modal = open && mounted ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-popover p-6 shadow-elevated max-h-[85vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Add Coach</h3>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <input name="phone" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input name="email" type="email" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Group pay ($/hr)</label>
              <input name="group_rate" type="number" step="0.01" placeholder="30.00" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <p className="mt-0.5 text-[11px] text-muted-foreground">What the coach earns per group hour</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Private pay ($/hr)</label>
              <input name="private_rate" type="number" step="0.01" placeholder="40.00" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <p className="mt-0.5 text-[11px] text-muted-foreground">What the coach earns per private hour</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Parent rate ($/hr)</label>
            <input name="client_private_rate" type="number" step="0.01" placeholder="80.00" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <p className="mt-0.5 text-[11px] text-muted-foreground">What parents pay for a private with this coach. Leave blank if unset; you can fill it later.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Pay period</label>
            <select name="pay_period" defaultValue="weekly" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="end_of_term">End of term</option>
            </select>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="delivers_privates"
                defaultChecked={false}
                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Available for private lessons</span>
                <span className="block text-xs text-muted-foreground">
                  Off by default — flip on once the coach is approved for privates and has a rate set.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="private_opt_in_required"
                defaultChecked={false}
                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Opt-in only for privates</span>
                <span className="block text-xs text-muted-foreground">
                  When on, parents only see this coach as a private option for players explicitly added via Bulk Allowed Coaches.
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create Coach'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  ) : null

  return <>{trigger}{modal}</>
}
