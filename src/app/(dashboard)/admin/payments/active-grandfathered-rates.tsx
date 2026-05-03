'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cancelFamilyPricing } from './actions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShieldCheck, ChevronDown, ChevronRight, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'

type Row = {
  id: string
  family_id: string
  family_display_id: string
  family_name: string
  program_type: string
  coach_id: string | null
  coach_name: string | null
  per_session_cents: number | null
  term_fee_cents: number | null
  valid_from: string | null
  valid_until: string | null
  notes: string | null
  // True when valid_until is null OR >= today
  is_active: boolean
}

function rateLabel(row: Row): string {
  if (row.per_session_cents != null) {
    if (row.program_type === 'private') {
      return `${formatCurrency(row.per_session_cents)} / 30min`
    }
    return `${formatCurrency(row.per_session_cents)} / session`
  }
  if (row.term_fee_cents != null) {
    return `${formatCurrency(row.term_fee_cents)} / term`
  }
  return '—'
}

function CancelButton({ id }: { id: string }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  async function onClick(e: React.MouseEvent) {
    e.preventDefault()
    if (!confirm('End this grandfathered rate today? Future charges will use the standard rate.')) return
    setSubmitting(true)
    const fd = new FormData()
    fd.set('pricing_id', id)
    await cancelFamilyPricing(fd)
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={submitting}
      className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/5 px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
      aria-label="End this rate"
    >
      <X className="size-3" /> {submitting ? 'Ending…' : 'End'}
    </button>
  )
}

export function ActiveGrandfatheredRates({
  rows,
}: {
  rows: Row[]
}) {
  const active = rows.filter(r => r.is_active)
  const archived = rows.filter(r => !r.is_active)
  const [showArchive, setShowArchive] = useState(false)

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Active Grandfathered Rates
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {active.length}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Per-family pricing overrides currently in force. Cancelling sets the end date to today and preserves the history.
            </p>
          </div>
        </div>

        {active.length === 0 ? (
          <p className="mt-4 rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            No active grandfathered rates. Use the form below to set one.
          </p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Family</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Coach</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-left">From</th>
                  <th className="px-3 py-2 text-left">Until</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                  <th className="px-3 py-2 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {active.map(row => (
                  <tr key={row.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/families/${row.family_id}`}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {row.family_display_id} {row.family_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{row.program_type}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.coach_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{rateLabel(row)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.valid_from ? formatDate(row.valid_from) : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.valid_until ? formatDate(row.valid_until) : 'No end'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate" title={row.notes ?? ''}>
                      {row.notes ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CancelButton id={row.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {archived.length > 0 && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowArchive(s => !s)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showArchive ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              Archive ({archived.length} ended)
            </button>
            {showArchive && (
              <div className="mt-2 overflow-hidden rounded-lg border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Family</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Coach</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-left">Period</th>
                      <th className="px-3 py-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 text-muted-foreground">
                    {archived.map(row => (
                      <tr key={row.id}>
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/families/${row.family_id}`}
                            className="hover:text-primary transition-colors"
                          >
                            {row.family_display_id} {row.family_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 capitalize">{row.program_type}</td>
                        <td className="px-3 py-2">{row.coach_name ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rateLabel(row)}</td>
                        <td className="px-3 py-2 text-xs">
                          {row.valid_from ? formatDate(row.valid_from) : '—'}
                          {' → '}
                          {row.valid_until ? formatDate(row.valid_until) : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={row.notes ?? ''}>
                          {row.notes ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
