'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Trash2, CreditCard, Loader2 } from 'lucide-react'

const selectClass = 'block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

interface Family {
  id: string
  displayId: string
  familyName: string
  balanceCents: number
}

interface PaymentRow {
  key: number
  familyId: string
  amount: string
  method: string
  notes: string
}

export function BulkPaymentForm({ families }: { families: Family[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<PaymentRow[]>([
    { key: 1, familyId: '', amount: '', method: 'bank_transfer', notes: '' },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')

  let nextKey = Math.max(...rows.map(r => r.key), 0) + 1

  const addRow = () => {
    setRows(prev => [...prev, { key: nextKey++, familyId: '', amount: '', method: 'bank_transfer', notes: '' }])
  }

  const removeRow = (key: number) => {
    setRows(prev => prev.filter(r => r.key !== key))
  }

  const updateRow = (key: number, field: keyof PaymentRow, value: string) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))
  }

  const validRows = rows.filter(r => r.familyId && r.amount && parseFloat(r.amount) > 0)
  const totalCents = validRows.reduce((sum, r) => sum + Math.round(parseFloat(r.amount || '0') * 100), 0)

  // Filter families with outstanding balance for quick selection
  const owingFamilies = useMemo(() =>
    families.filter(f => f.balanceCents < 0).sort((a, b) => a.balanceCents - b.balanceCents),
    [families]
  )

  const handleSubmit = async () => {
    if (validRows.length === 0) return
    setSubmitting(true)

    try {
      const res = await fetch('/api/admin/bulk-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: validRows.map(r => ({
            familyId: r.familyId,
            amountCents: Math.round(parseFloat(r.amount) * 100),
            paymentMethod: r.method,
            notes: r.notes || null,
          })),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        router.push('/admin/payments/bulk?error=' + encodeURIComponent(data.error || 'Failed to record payments'))
        return
      }

      const data = await res.json()
      router.push('/admin/payments/bulk?success=' + encodeURIComponent(`Recorded ${data.count} payment(s) totalling $${(data.totalCents / 100).toFixed(2)}`))
      router.refresh()
    } catch {
      router.push('/admin/payments/bulk?error=' + encodeURIComponent('Network error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-border bg-card shadow-card">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Payment Entries</h2>
          <span className="text-xs text-muted-foreground">
            {validRows.length} payment{validRows.length !== 1 ? 's' : ''} - ${(totalCents / 100).toFixed(2)} total
          </span>
        </div>

        {/* Payment rows */}
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={row.key} className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_auto_auto_1fr_auto]">
              <div>
                {i === 0 && <Label className="text-xs text-muted-foreground">Family</Label>}
                <select
                  className={selectClass}
                  value={row.familyId}
                  onChange={(e) => updateRow(row.key, 'familyId', e.target.value)}
                >
                  <option value="">Select family...</option>
                  {owingFamilies.length > 0 && (
                    <optgroup label="Outstanding balance">
                      {owingFamilies.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.displayId} {f.familyName} (owes ${(Math.abs(f.balanceCents) / 100).toFixed(2)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="All families">
                    {families.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.displayId} {f.familyName}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="w-28">
                {i === 0 && <Label className="text-xs text-muted-foreground">Amount ($)</Label>}
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={row.amount}
                  onChange={(e) => updateRow(row.key, 'amount', e.target.value)}
                />
              </div>
              <div className="w-36">
                {i === 0 && <Label className="text-xs text-muted-foreground">Method</Label>}
                <select
                  className={selectClass}
                  value={row.method}
                  onChange={(e) => updateRow(row.key, 'method', e.target.value)}
                >
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="stripe">Stripe</option>
                </select>
              </div>
              <div>
                {i === 0 && <Label className="text-xs text-muted-foreground">Notes</Label>}
                <Input
                  type="text"
                  placeholder="Optional notes"
                  value={row.notes}
                  onChange={(e) => updateRow(row.key, 'notes', e.target.value)}
                />
              </div>
              <div className="flex items-end">
                {rows.length > 1 && (
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeRow(row.key)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5">
            <Plus className="size-3.5" />
            Add Row
          </Button>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={validRows.length === 0 || submitting}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CreditCard className="size-4" />
            )}
            Record {validRows.length} Payment{validRows.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
