'use client'

import { useState } from 'react'
import { addFamilyPricing, removeFamilyPricing } from './pricing-actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/currency'
import { Trash2, DollarSign } from 'lucide-react'

interface PricingOverride {
  id: string
  program_id: string | null
  program_type: string | null
  coach_id: string | null
  per_session_cents: number | null
  term_fee_cents: number | null
  notes: string | null
  valid_from: string
  valid_until: string | null
}

interface Program {
  id: string
  name: string
  type: string
}

interface CoachOption {
  id: string
  name: string
}

function describeOverride(o: PricingOverride, programs: Program[], coaches: CoachOption[]): string {
  if (o.coach_id) {
    const coachName = coaches.find(c => c.id === o.coach_id)?.name ?? 'a coach'
    return `Private with ${coachName}`
  }
  if (o.program_id) {
    return programs.find(p => p.id === o.program_id)?.name ?? 'Specific program'
  }
  if (o.program_type) {
    return `All ${o.program_type} programs`
  }
  return 'All programs'
}

function formatDate(d: string | null): string | null {
  if (!d) return null
  const dt = new Date(d + 'T00:00:00')
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function PricingForm({
  familyId,
  overrides,
  programs,
  coaches,
}: {
  familyId: string
  overrides: PricingOverride[]
  programs: Program[]
  coaches: CoachOption[]
}) {
  const addWithFamily = addFamilyPricing.bind(null, familyId)
  const [programType, setProgramType] = useState('')

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <DollarSign className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Custom Pricing</h2>
            <p className="text-xs text-muted-foreground">Override standard rates for this family</p>
          </div>
        </div>

        {/* Existing overrides */}
        {overrides.length > 0 && (
          <div className="mt-4 space-y-2">
            {overrides.map((o) => {
              const label = describeOverride(o, programs, coaches)
              const validUntilLabel = formatDate(o.valid_until)
              const isPrivate = !!o.coach_id || o.program_type === 'private'

              return (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{label}</p>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {o.per_session_cents != null && (
                        <span>
                          {isPrivate ? `${formatCurrency(o.per_session_cents)}/30min` : `Session: ${formatCurrency(o.per_session_cents)}`}
                        </span>
                      )}
                      {o.term_fee_cents != null && <span>Term: {formatCurrency(o.term_fee_cents)}</span>}
                      {validUntilLabel && <span>until {validUntilLabel}</span>}
                      {o.notes && <span>- {o.notes}</span>}
                    </div>
                  </div>
                  <form action={removeFamilyPricing.bind(null, familyId, o.id)}>
                    <button type="submit" className="text-muted-foreground hover:text-danger transition-colors">
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>
              )
            })}
          </div>
        )}

        {/* Add new override */}
        <form action={addWithFamily} className="mt-4 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Add override</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="program_id">Program (optional)</Label>
              <select
                id="program_id"
                name="program_id"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All programs</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="program_type">Or by type</Label>
              <select
                id="program_type"
                name="program_type"
                value={programType}
                onChange={(e) => setProgramType(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-</option>
                <option value="group">All groups</option>
                <option value="squad">All squads</option>
                <option value="private">All privates</option>
                <option value="school">All school programs</option>
              </select>
            </div>

            {/* Coach picker only meaningful when scoping to privates */}
            {programType === 'private' && (
              <div className="sm:col-span-2">
                <Label htmlFor="coach_id">For coach (optional)</Label>
                <select
                  id="coach_id"
                  name="coach_id"
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All coaches</option>
                  {coaches.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick a coach to apply this rate only to privates with that coach (e.g. grandfathered Maxim rate).
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="per_session_dollars">
                {programType === 'private' ? 'Per 30min ($)' : 'Per session ($)'}
              </Label>
              <input
                id="per_session_dollars"
                name="per_session_dollars"
                type="text"
                inputMode="decimal"
                placeholder={programType === 'private' ? 'e.g. 40.00' : 'e.g. 80.00'}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <Label htmlFor="term_fee_dollars">Term fee ($)</Label>
              <input
                id="term_fee_dollars"
                name="term_fee_dollars"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 160.00"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <Label htmlFor="valid_until">Valid until (optional)</Label>
              <input
                id="valid_until"
                name="valid_until"
                type="date"
                placeholder="2026-07-21"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">e.g. 2026-07-21 (start of Term 3)</p>
            </div>
          </div>

          <div className="mt-3">
            <Label htmlFor="notes">Notes</Label>
            <input
              id="notes"
              name="notes"
              type="text"
              placeholder="e.g. Grandfathered rate from 2025"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <input type="hidden" name="valid_from" value={new Date().toISOString().split('T')[0]} />

          <div className="mt-3 flex justify-end">
            <Button type="submit" size="sm">Add Override</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
