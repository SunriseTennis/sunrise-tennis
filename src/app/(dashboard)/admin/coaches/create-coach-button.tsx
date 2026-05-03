'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { createCoach } from './actions'
import { Button } from '@/components/ui/button'

export function CreateCoachButton() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await createCoach(fd)
      router.refresh()
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
      >
        <Plus className="size-3.5" /> Add Coach
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
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
              <label className="text-xs font-medium text-muted-foreground">Group rate ($/hr)</label>
              <input name="group_rate" type="number" step="0.01" placeholder="60.00" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Private rate ($/hr)</label>
              <input name="private_rate" type="number" step="0.01" placeholder="60.00" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
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
    </div>
  )
}
