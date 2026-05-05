'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Copy, Mail, Search, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { bulkSendInvitations, type BulkInviteResult } from './actions'

export type BulkInviteState =
  | 'not_invited'
  | 'pending_invite'
  | 'expired_invite'
  | 'signed_up'
  | 'no_email'

export interface BulkInviteRow {
  id: string
  displayId: string
  familyName: string
  contactName: string
  contactEmail: string
  state: BulkInviteState
  pendingExpiresAt: string | null
}

const STATE_LABELS: Record<BulkInviteState, { label: string; tone: string }> = {
  not_invited: { label: 'Not invited', tone: 'bg-muted text-foreground' },
  pending_invite: { label: 'Pending invite', tone: 'bg-amber-100 text-amber-900' },
  expired_invite: { label: 'Expired invite', tone: 'bg-orange-100 text-orange-900' },
  signed_up: { label: 'Signed up', tone: 'bg-emerald-100 text-emerald-900' },
  no_email: { label: 'No email', tone: 'bg-rose-100 text-rose-900' },
}

const ANNOUNCEMENT_SUBJECT = 'Sunrise Tennis platform is ready — your signup link is in your inbox'

const ANNOUNCEMENT_BODY = `Hi everyone,

Quick heads up — I've just sent each of you a personalised signup link for the new Sunrise Tennis platform. It should be in your inbox now, from "Sunrise Tennis <noreply@send.sunrisetennis.com.au>".

What you'll see:
- Subject: "Welcome to Sunrise Tennis — finish setting up your account"
- A button to finish setting up your login (about a minute)
- That gets you onto the new dashboard for bookings, payments, schedule, and more.

If you don't see it, please check your spam/junk folder — first emails from a new domain often land there. Marking it "not spam" once helps for future emails.

If anything looks off, doesn't work, or you spot a bug, please let me know — the platform is brand new and live feedback is invaluable.

Thanks!
Maxim
Sunrise Tennis
0431 368 752`

function isEligible(state: BulkInviteState): boolean {
  return state === 'not_invited' || state === 'pending_invite' || state === 'expired_invite'
}

export function BulkInviteTable({ rows }: { rows: BulkInviteRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const initialSelected = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (isEligible(r.state)) set.add(r.id)
    return set
  }, [rows])

  const [selected, setSelected] = useState<Set<string>>(initialSelected)
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<BulkInviteResult | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.familyName.toLowerCase().includes(q) ||
        r.displayId.toLowerCase().includes(q) ||
        r.contactName.toLowerCase().includes(q) ||
        r.contactEmail.toLowerCase().includes(q),
    )
  }, [rows, search])

  const eligibleRows = useMemo(() => rows.filter((r) => isEligible(r.state)), [rows])

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllEligible() {
    setSelected(new Set(eligibleRows.map((r) => r.id)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  function selectVisible(only: 'eligible' | 'all') {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of filtered) {
        if (only === 'eligible' && !isEligible(r.state)) continue
        next.add(r.id)
      }
      return next
    })
  }

  const selectedRows = rows.filter((r) => selected.has(r.id))
  const selectedEmails = selectedRows.map((r) => r.contactEmail).filter(Boolean)
  const selectedCount = selected.size

  async function copy(text: string, hint: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyHint(hint)
      setTimeout(() => setCopyHint(null), 2000)
    } catch (e) {
      console.error('clipboard failed', e)
      setCopyHint('Copy failed — long-press the field instead')
      setTimeout(() => setCopyHint(null), 3000)
    }
  }

  function handleSend() {
    if (selectedCount === 0) return
    const ids = Array.from(selected).filter((id) => {
      const row = rows.find((r) => r.id === id)
      return row && isEligible(row.state)
    })
    if (ids.length === 0) return

    startTransition(async () => {
      const r = await bulkSendInvitations(ids)
      setResult(r)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {result && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {result.failed.length === 0 ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" />
              )}
              <div className="flex-1 text-sm">
                <p className="font-medium text-foreground">
                  {result.sent} new invite{result.sent === 1 ? '' : 's'} sent
                  {result.resent > 0 && ` · ${result.resent} resent`}
                  {result.skipped > 0 && ` · ${result.skipped} skipped (already signed up)`}
                  {result.failed.length > 0 && ` · ${result.failed.length} failed`}
                </p>
                {result.failed.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {result.failed.map((f) => {
                      const row = rows.find((r) => r.id === f.familyId)
                      return (
                        <li key={f.familyId}>
                          {row ? `${row.displayId} ${row.familyName}` : f.familyId}: {f.reason}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search families…"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllEligible}
                className="rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
              >
                Select all eligible ({eligibleRows.length})
              </button>
              <button
                type="button"
                onClick={() => selectVisible('eligible')}
                className="rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
              >
                Select visible
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
              >
                Deselect all
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Family</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No families match the current search.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const eligible = isEligible(r.state)
                    const checked = selected.has(r.id)
                    const stateMeta = STATE_LABELS[r.state]
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-border last:border-0 ${
                          !eligible ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!eligible}
                            onChange={() => toggleRow(r.id)}
                            className="size-4"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          <Link href={`/admin/families/${r.id}`} className="hover:text-primary">
                            {r.displayId}
                          </Link>
                        </td>
                        <td className="px-3 py-2 font-medium">{r.familyName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.contactName || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.contactEmail || (
                            <Link
                              href={`/admin/families/${r.id}`}
                              className="text-rose-600 underline hover:text-rose-700"
                            >
                              Add email
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${stateMeta.tone}`}
                          >
                            {stateMeta.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{selectedCount}</span> selected
              {selectedCount > 0 && ` · ${selectedEmails.length} with email`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={selectedEmails.length === 0}
                onClick={() => copy(selectedEmails.join(', '), 'Emails copied to clipboard')}
              >
                <Copy className="mr-1.5 size-4" />
                Copy {selectedEmails.length} emails
              </Button>
              <Button
                type="button"
                onClick={handleSend}
                disabled={pending || selectedCount === 0}
              >
                <Send className="mr-1.5 size-4" />
                {pending ? 'Sending…' : `Send invites to ${selectedCount}`}
              </Button>
            </div>
          </div>

          {copyHint && (
            <p className="text-right text-xs text-emerald-700">{copyHint}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-2">
            <Mail className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Announcement email (manual send)</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            After invites have gone out, send this as one email with all the recipients in <strong>BCC</strong>. Use the &quot;Copy emails&quot; button above to grab the BCC list.
          </p>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <div className="flex gap-2">
              <Input readOnly value={ANNOUNCEMENT_SUBJECT} className="flex-1" />
              <Button
                type="button"
                variant="secondary"
                onClick={() => copy(ANNOUNCEMENT_SUBJECT, 'Subject copied')}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Body</label>
            <Textarea
              readOnly
              value={ANNOUNCEMENT_BODY}
              rows={16}
              className="font-mono text-xs"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => copy(ANNOUNCEMENT_BODY, 'Body copied')}
              >
                <Copy className="mr-1.5 size-4" />
                Copy body
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Send via Gmail (info@sunrisetennis.com.au):</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>Compose new email</li>
              <li>From: info@sunrisetennis.com.au</li>
              <li>To: <span className="font-mono">info@sunrisetennis.com.au</span> (or yourself — BCC handles delivery)</li>
              <li>BCC: paste the copied email list</li>
              <li>Paste subject + body, send</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
