'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { createPaymentIntent } from '@/lib/stripe/payment'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

// Singleton — loadStripe must only be called once per page load
let stripePromise: Promise<StripeJs | null> | null = null
function getStripeJs() {
  if (!stripePromise && publishableKey) {
    stripePromise = loadStripe(publishableKey)
  }
  return stripePromise
}

export function StripePaymentForm({
  familyId,
  defaultAmountDollars,
  maxAmountDollars,
  description,
  invoiceId,
  editable = false,
}: {
  familyId: string
  defaultAmountDollars: string
  maxAmountDollars?: string
  description?: string
  invoiceId?: string
  editable?: boolean
}) {
  const [amountDollars, setAmountDollars] = useState(defaultAmountDollars)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creatingIntent, setCreatingIntent] = useState(false)

  const stripeJsPromise = useMemo(() => getStripeJs(), [])

  if (!publishableKey) {
    return (
      <div className="rounded-lg border border-warning/20 bg-warning-light p-4">
        <p className="text-sm text-warning">
          Card payments are not configured yet. Please pay via bank transfer or cash.
        </p>
      </div>
    )
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (/^\d*\.?\d{0,2}$/.test(val)) {
      setAmountDollars(val)
      // Reset any previously created intent — amount changed
      setClientSecret(null)
      setError(null)
    }
  }

  async function handleStartPayment() {
    setError(null)

    const cents = Math.round(parseFloat(amountDollars) * 100)
    if (isNaN(cents) || cents < 100) {
      setError('Minimum payment is $1.00')
      return
    }
    if (maxAmountDollars) {
      const maxCents = Math.round(parseFloat(maxAmountDollars) * 100)
      if (cents > maxCents) {
        setError(`Maximum payment is $${maxAmountDollars}`)
        return
      }
    }

    setCreatingIntent(true)
    try {
      const fd = new FormData()
      fd.set('family_id', familyId)
      fd.set('amount_dollars', amountDollars)
      if (description) fd.set('description', description)
      if (invoiceId) fd.set('invoice_id', invoiceId)

      const result = await createPaymentIntent(fd)
      if (!result.ok) {
        setError(result.error)
        setCreatingIntent(false)
        return
      }
      setClientSecret(result.clientSecret)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start payment')
    } finally {
      setCreatingIntent(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-lg font-semibold text-foreground">Pay by Card</h3>

        {editable ? (
          <div className="mt-3">
            <label htmlFor="payment-amount" className="text-sm font-medium text-foreground">
              Amount
            </label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input
                id="payment-amount"
                type="text"
                inputMode="decimal"
                value={amountDollars}
                onChange={handleAmountChange}
                disabled={!!clientSecret}
                className="block w-full rounded-lg border border-border bg-background py-2.5 pl-7 pr-3 text-sm text-foreground tabular-nums shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
              />
            </div>
            {maxAmountDollars && (
              <p className="mt-1 text-xs text-muted-foreground">
                Outstanding balance: ${maxAmountDollars}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Amount: <strong className="text-foreground">${amountDollars}</strong>
          </p>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {!clientSecret && (
          <Button
            onClick={handleStartPayment}
            disabled={creatingIntent || !amountDollars || parseFloat(amountDollars) < 1}
            className="mt-4 w-full"
          >
            {creatingIntent ? 'Preparing…' : `Continue to pay $${amountDollars || '0.00'}`}
          </Button>
        )}

        {clientSecret && stripeJsPromise && (
          <div className="mt-4">
            <Elements
              stripe={stripeJsPromise}
              options={{
                clientSecret,
                appearance: { theme: 'stripe' },
              }}
            >
              <ConfirmStep amountDollars={amountDollars} />
            </Elements>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ConfirmStep({ amountDollars }: { amountDollars: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If Stripe redirects back to /parent/payments after a redirect-based
  // method (some wallets), the page reload will pick up the success param.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const status = params.get('redirect_status')
    if (status === 'succeeded') {
      // Webhook will flip the row; no client action needed here.
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setError(null)

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/parent/payments?stripe_redirect=1`,
      },
      // For card payments without redirect, this returns directly.
      redirect: 'if_required',
    })

    if (confirmError) {
      setError(confirmError.message || 'Payment failed')
      setSubmitting(false)
      return
    }

    // Payment succeeded synchronously (most card flows). Webhook will mark
    // the row as received. Reload to refresh the balance + payment list.
    window.location.assign('/parent/payments?success=Payment+processed+successfully')
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}
      <Button type="submit" disabled={!stripe || submitting} className="mt-4 w-full">
        {submitting ? 'Processing…' : `Pay $${amountDollars}`}
      </Button>
    </form>
  )
}
