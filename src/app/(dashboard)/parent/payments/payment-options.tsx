'use client'

import { useState, useEffect } from 'react'
import { StripePaymentForm } from '@/components/stripe-payment-form'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CreditCard, Building2, Copy, Check, ChevronRight } from 'lucide-react'
import { usePayment } from './payment-context'

export function PaymentOptions({
  familyId,
  balanceCents,
  familyName,
  outstandingInvoices,
}: {
  familyId: string
  balanceCents: number
  familyName?: string | null
  outstandingInvoices: { id: string; display_id: string; amount_cents: number }[]
}) {
  const [method, setMethod] = useState<'choose' | 'card' | 'bank'>('choose')
  const [copied, setCopied] = useState<string | null>(null)
  const payment = usePayment()

  // Outstanding balance (positive value for display)
  const owedCents = Math.abs(Math.min(balanceCents, 0))
  const owedDollars = (owedCents / 100).toFixed(2)

  // When a click-to-pay request comes in, auto-switch to card mode
  useEffect(() => {
    if (payment?.prefillAmountCents) {
      setMethod('card')
    }
  }, [payment?.prefillAmountCents])

  const bankBsb = process.env.NEXT_PUBLIC_BANK_BSB || ''
  const bankAccount = process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || ''
  const bankName = process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || 'Sunrise Tennis'

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  if (method === 'choose') {
    return (
      <div>
        <h2 className="text-lg font-semibold text-foreground">Make a Payment</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => setMethod('card')}
            className="group relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-5 text-left shadow-card transition-all hover:shadow-elevated hover:scale-[1.01] hover:border-primary/40"
          >
            <div className="absolute right-0 top-0 size-20 rounded-bl-full bg-primary/5" />
            <div className="relative flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 shadow-sm">
                <CreditCard className="size-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">Pay by Card</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Visa, Mastercard, AMEX via Stripe</p>
              </div>
              <ChevronRight className="size-5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>

          <button
            onClick={() => setMethod('bank')}
            className="group relative overflow-hidden rounded-xl border border-secondary/20 bg-gradient-to-br from-secondary/5 to-secondary/10 p-5 text-left shadow-card transition-all hover:shadow-elevated hover:scale-[1.01] hover:border-secondary/40"
          >
            <div className="absolute right-0 top-0 size-20 rounded-bl-full bg-secondary/5" />
            <div className="relative flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-secondary/15 shadow-sm">
                <Building2 className="size-6 text-secondary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">Bank Transfer</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Direct deposit to our account</p>
              </div>
              <ChevronRight className="size-5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        </div>
      </div>
    )
  }

  if (method === 'card') {
    // Use prefilled amount from click-to-pay if available, otherwise full balance
    const prefillCents = payment?.prefillAmountCents
    const prefillDollars = prefillCents ? (prefillCents / 100).toFixed(2) : owedDollars
    const prefillDesc = payment?.prefillDescription ?? 'Account payment'

    return (
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Pay by Card</h2>
          <Button variant="ghost" size="sm" onClick={() => { setMethod('choose'); payment?.clearPrefill() }}>
            Back
          </Button>
        </div>
        <div className="mt-4">
          <StripePaymentForm
            familyId={familyId}
            defaultAmountDollars={prefillDollars}
            maxAmountDollars={owedDollars}
            description={prefillDesc}
            payingForLabel={payment?.prefillDescription}
            editable
          />
        </div>
      </div>
    )
  }

  // Bank transfer
  const referenceText = outstandingInvoices.length === 1
    ? outstandingInvoices[0].display_id
    : familyName || 'Your family name'

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Bank Transfer</h2>
        <Button variant="ghost" size="sm" onClick={() => setMethod('choose')}>
          Back
        </Button>
      </div>
      <Card className="mt-4 overflow-hidden border-border shadow-card">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Transfer the amount to our bank account using the details below.
            Your payment will be confirmed once we receive it (usually 1-2 business days).
          </p>

          <dl className="mt-4 space-y-3">
            {bankName && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Account Name</dt>
                  <dd className="text-sm font-medium text-foreground">{bankName}</dd>
                </div>
                <button
                  onClick={() => copyToClipboard(bankName, 'name')}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied === 'name' ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                </button>
              </div>
            )}
            {bankBsb && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">BSB</dt>
                  <dd className="text-sm font-medium text-foreground tabular-nums">{bankBsb}</dd>
                </div>
                <button
                  onClick={() => copyToClipboard(bankBsb, 'bsb')}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied === 'bsb' ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                </button>
              </div>
            )}
            {bankAccount && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Account Number</dt>
                  <dd className="text-sm font-medium text-foreground tabular-nums">{bankAccount}</dd>
                </div>
                <button
                  onClick={() => copyToClipboard(bankAccount, 'account')}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied === 'account' ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                </button>
              </div>
            )}
            {(!bankBsb || !bankAccount) && (
              <div className="rounded-lg border border-warning/20 bg-warning-light px-4 py-3">
                <p className="text-sm text-warning">
                  Bank details are not configured yet. Please contact us directly for payment.
                </p>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/10 px-4 py-2.5">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Reference / Description</dt>
                <dd className="text-sm font-medium text-primary">{referenceText}</dd>
              </div>
              <button
                onClick={() => copyToClipboard(referenceText, 'ref')}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied === 'ref' ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </button>
            </div>
          </dl>

          {owedCents > 0 && (
            <p className="mt-4 text-sm font-medium text-foreground">
              Outstanding balance: <span className="tabular-nums">${owedDollars}</span>
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Please include the reference so we can match your payment. Once received, it will appear in your payment history.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
