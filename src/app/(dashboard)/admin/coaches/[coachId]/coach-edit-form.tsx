'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X } from 'lucide-react'
import { updateCoach } from '../actions'

type CoachData = {
  id: string
  name: string
  phone: string
  email: string
  groupRateCents: number
  privateRateCents: number
  clientPrivateRateCents: number | null
  payPeriod: string
  deliversPrivates: boolean
  privateOptInRequired: boolean
}

export function CoachEditForm({ coach }: { coach: CoachData }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('coach_id', coach.id)
    startTransition(async () => {
      await updateCoach(fd)
      router.refresh()
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Pencil className="size-3" /> Edit
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-popover p-6 shadow-elevated max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Edit Coach</h3>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input name="name" defaultValue={coach.name} required
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <input name="phone" defaultValue={coach.phone}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input name="email" type="email" defaultValue={coach.email}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Group pay ($/hr)</label>
              <input name="group_rate" type="number" step="0.01" defaultValue={(coach.groupRateCents / 100).toFixed(2)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <p className="mt-0.5 text-[11px] text-muted-foreground">What coach earns per group hour</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Private pay ($/hr)</label>
              <input name="private_rate" type="number" step="0.01" defaultValue={(coach.privateRateCents / 100).toFixed(2)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <p className="mt-0.5 text-[11px] text-muted-foreground">What coach earns per private hour</p>
            </div>
          </div>
          <div>
            {/* Marker so updateCoach knows the field was on this form */}
            <input type="hidden" name="client_private_rate_present" value="1" />
            <label className="text-xs font-medium text-muted-foreground">Parent rate ($/hr)</label>
            <input
              name="client_private_rate"
              type="number"
              step="0.01"
              defaultValue={coach.clientPrivateRateCents != null ? (coach.clientPrivateRateCents / 100).toFixed(2) : ''}
              placeholder="80.00"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-0.5 text-[11px] text-muted-foreground">What parents pay for a private with this coach. Blank = unset.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Pay period</label>
            <select name="pay_period" defaultValue={coach.payPeriod}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="end_of_term">End of term</option>
            </select>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            {/* Marker so updateCoach knows the field was on this form */}
            <input type="hidden" name="delivers_privates_present" value="1" />
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="delivers_privates"
                defaultChecked={coach.deliversPrivates}
                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Available for private lessons</span>
                <span className="block text-xs text-muted-foreground">
                  When off, parents won&apos;t see this coach as a private option even if availability is set.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <input type="hidden" name="private_opt_in_required_present" value="1" />
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="private_opt_in_required"
                defaultChecked={coach.privateOptInRequired}
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
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
              {isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
