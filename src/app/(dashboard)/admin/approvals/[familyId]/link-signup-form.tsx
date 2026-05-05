'use client'

/**
 * Plan 21 — Link a self-signup parent to an existing legacy/admin-
 * invite family. Reuses the type-ahead family-search pattern from
 * `<InviteParentModal>` (familiar to Maxim from the same approvals
 * empty state and /admin/families header). On submit, fires the
 * `linkSignupToExistingFamily` action.
 *
 * Mounted only when the approval-detail family has
 * `signup_source = 'self_signup'`.
 */

import { useMemo, useState, useTransition } from 'react'
import { Link2 } from 'lucide-react'
import { linkSignupToExistingFamily } from '../actions'
import { Button } from '@/components/ui/button'

interface FamilyOption {
  id: string
  display_id: string
  family_name: string
}

interface Props {
  signupFamilyId: string
  parentName: string | null
  families: FamilyOption[]
}

export function LinkSignupForm({ signupFamilyId, parentName, families }: Props) {
  const [familyId, setFamilyId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return families.slice(0, 50)
    return families
      .filter(f =>
        f.family_name.toLowerCase().includes(q) ||
        f.display_id.toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [families, search])

  const selected = families.find(f => f.id === familyId)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!familyId) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    const fd = new FormData()
    fd.append('target_family_id', familyId)
    startTransition(async () => {
      await linkSignupToExistingFamily(signupFamilyId, fd)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Pick the existing Sunrise Tennis family
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setConfirming(false) }}
          placeholder="Search by family name or ID…"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map(f => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setFamilyId(f.id)
                      setSearch(`${f.display_id} — ${f.family_name}`)
                      setConfirming(false)
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      familyId === f.id ? 'bg-primary/10 text-primary' : 'text-foreground'
                    }`}
                  >
                    <span className="font-medium">{f.family_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{f.display_id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirming && selected && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Confirm</p>
          <p className="mt-1">
            Link <span className="font-medium">{parentName ?? 'this parent'}</span> to{' '}
            <span className="font-medium">{selected.display_id} — {selected.family_name}</span>?
            This drops the self-signup family + its players, re-points
            the parent&apos;s account, and emails them a log-in link.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!familyId || pending} variant={confirming ? 'destructive' : 'default'}>
          <Link2 className="mr-1.5 size-4" />
          {pending ? 'Linking…' : confirming ? 'Confirm + email parent' : 'Link to this family'}
        </Button>
        {confirming && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
