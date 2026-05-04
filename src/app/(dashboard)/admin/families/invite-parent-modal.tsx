'use client'

/**
 * Plan 18 — Invite-parent modal for /admin/families and
 * /admin/approvals empty state. Picks an existing family + email,
 * fires `createInvitation` (which now also auto-sends the branded email
 * via Resend). For brand-new families, the modal links out to
 * /admin/families/new.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Plus, X } from 'lucide-react'
import { createInvitation } from '../actions'
import { Button } from '@/components/ui/button'

interface FamilyOption {
  id: string
  display_id: string
  family_name: string
}

interface InviteParentModalProps {
  families: FamilyOption[]
  /** Optional CTA-button styling override. Defaults to inline header
   *  pill matching CreateCoachButton. */
  variant?: 'pill' | 'cta'
}

export function InviteParentModal({ families, variant = 'pill' }: InviteParentModalProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)
  const [familyId, setFamilyId] = useState<string>('')
  const [search, setSearch] = useState('')
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const filteredFamilies = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return families.slice(0, 50)
    return families
      .filter(f =>
        f.family_name.toLowerCase().includes(q) ||
        f.display_id.toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [families, search])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!familyId) return
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await createInvitation(familyId, fd)
      router.refresh()
      setOpen(false)
    })
  }

  const trigger = variant === 'cta' ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
    >
      <Mail className="size-4" />
      Send invite link
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
    >
      <Mail className="size-3.5" /> Invite parent
    </button>
  )

  const modal = open && mounted ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-popover p-6 shadow-elevated max-h-[85vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Invite parent</h3>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          Email a branded signup link to a parent. The link is also shown after creation so you can SMS it as a backup.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Family *</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by family name or ID…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
              {filteredFamilies.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredFamilies.map(f => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setFamilyId(f.id)
                          setSearch(`${f.display_id} — ${f.family_name}`)
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
            <p className="mt-1 text-[11px] text-muted-foreground">
              Don&apos;t see them?{' '}
              <Link href="/admin/families/new" className="font-medium text-primary underline hover:text-primary/80">
                Create a new family
              </Link>
              {' '}first.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Parent email *</label>
            <input
              name="email"
              type="email"
              required
              placeholder="parent@email.com"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <Button type="submit" disabled={pending || !familyId}>
              <Plus className="mr-1.5 size-4" />
              {pending ? 'Creating…' : 'Create + email invite'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  ) : null

  return <>{trigger}{modal}</>
}
