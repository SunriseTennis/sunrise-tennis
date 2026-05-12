'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { recordPaymentForCharges } from './actions'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { createBrowserClient } from '@supabase/ssr'
import { formatPaymentMethod } from '@/lib/utils/payment-method'

const PAYMENT_METHODS = ['stripe', 'bank_transfer', 'cash', 'square_ftd']

const selectClass = 'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

interface ChargeRow {
  id: string
  description: string
  amount_cents: number
  type: string
  created_at: string | null
  /** Session date when this charge is tied to a specific session; preferred over `created_at` for display. */
  session_date?: string | null
}

export function RecordPaymentForm({
  families,
}: {
  families: { id: string; display_id: string; family_name: string }[]
}) {
  const [familyId, setFamilyId] = useState('')
  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'charge' | 'custom'>('charge')
  const router = useRouter()

  // Fetch charges when family changes
  useEffect(() => {
    if (!familyId) {
      setCharges([])
      setSelectedChargeIds(new Set())
      return
    }
    setLoading(true)
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    supabase
      .from('charges')
      .select('id, description, amount_cents, type, created_at, session_id, sessions:session_id(date)')
      .eq('family_id', familyId)
      .in('status', ['pending', 'confirmed'])
      .gt('amount_cents', 0)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data }) => {
        const rows = (data ?? []).map(c => ({
          id: c.id,
          description: c.description,
          amount_cents: c.amount_cents,
          type: c.type,
          created_at: c.created_at,
          session_date: (c.sessions as unknown as { date: string } | null)?.date ?? null,
        }))
        setCharges(rows)
        setSelectedChargeIds(new Set())
        setLoading(false)
      })
  }, [familyId])

  function toggleCharge(id: string) {
    setSelectedChargeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selectedChargeIds.size === charges.length) {
      setSelectedChargeIds(new Set())
    } else {
      setSelectedChargeIds(new Set(charges.map(c => c.id)))
    }
  }

  const selectedTotal = charges
    .filter(c => selectedChargeIds.has(c.id))
    .reduce((sum, c) => sum + c.amount_cents, 0)

  return (
    <Card>
      <CardContent>
        <h2 className="text-lg font-semibold text-foreground">Record Payment</h2>

        {/* Mode toggle */}
        <div className="mt-3 flex rounded-lg border border-border overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setMode('charge')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'charge' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            Link to charges
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'custom' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            Custom amount
          </button>
        </div>

        <form
          action={async (formData: FormData) => {
            if (mode === 'charge') {
              formData.set('charge_ids', JSON.stringify([...selectedChargeIds]))
              formData.set('amount_dollars', (selectedTotal / 100).toFixed(2))
            }
            formData.set('family_id', familyId)
            await recordPaymentForCharges(formData)
            router.refresh()
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="family_id">Family *</Label>
            <select
              id="family_id_select"
              value={familyId}
              onChange={(e) => setFamilyId(e.target.value)}
              required
              className={selectClass}
            >
              <option value="">Select family...</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.display_id} ({f.family_name})
                </option>
              ))}
            </select>
          </div>

          {/* Charge selection mode */}
          {mode === 'charge' && familyId && (
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Select charges to pay</Label>
                {charges.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-primary hover:text-primary/80"
                  >
                    {selectedChargeIds.size === charges.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              {loading ? (
                <p className="mt-2 text-sm text-muted-foreground">Loading charges...</p>
              ) : charges.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No outstanding charges for this family.</p>
              ) : (
                <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
                  {charges.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition-colors ${
                        selectedChargeIds.has(c.id) ? 'bg-primary/5' : 'hover:bg-muted/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChargeIds.has(c.id)}
                        onChange={() => toggleCharge(c.id)}
                        className="rounded border-border"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-foreground">{c.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.session_date
                            ? formatDate(c.session_date)
                            : c.created_at
                              ? formatDate(c.created_at)
                              : '-'}
                          {' · '}
                          <span className="capitalize">{c.type}</span>
                        </p>
                      </div>
                      <span className="tabular-nums font-medium text-foreground shrink-0">
                        {formatCurrency(c.amount_cents)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {selectedChargeIds.size > 0 && (
                <p className="mt-2 text-sm font-medium text-foreground">
                  Selected: {selectedChargeIds.size} charge{selectedChargeIds.size !== 1 ? 's' : ''} — {formatCurrency(selectedTotal)}
                </p>
              )}
            </div>
          )}

          {/* Custom amount mode */}
          {mode === 'custom' && (
            <>
              <div>
                <Label htmlFor="amount_dollars">Amount ($) *</Label>
                <Input
                  id="amount_dollars"
                  name="amount_dollars"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="85.00"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  name="description"
                  type="text"
                  placeholder="e.g. Term 1 group sessions"
                  className="mt-1"
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="payment_method">Payment Method *</Label>
            <select
              id="payment_method"
              name="payment_method"
              required
              className={selectClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {formatPaymentMethod(m)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              className={selectClass}
            >
              <option value="received">Received</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} className="mt-1" />
          </div>

          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={mode === 'charge' && selectedChargeIds.size === 0}
            >
              Record Payment
              {mode === 'charge' && selectedTotal > 0 && ` — ${formatCurrency(selectedTotal)}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
