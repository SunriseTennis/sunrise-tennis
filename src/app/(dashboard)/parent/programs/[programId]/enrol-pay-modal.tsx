'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { prepareEnrolPayment, finalizeEnrolPayment } from '../actions'
import { Button } from '@/components/ui/button'
import { AlertCircle, X } from 'lucide-react'
import { PricingBreakdownPanel, type PricingBreakdownData } from '@/components/pricing-breakdown-panel'

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

let stripePromise: Promise<StripeJs | null> | null = null
function getStripeJs() {
  if (!stripePromise && publishableKey) {
    stripePromise = loadStripe(publishableKey)
  }
  return stripePromise
}

type Breakdown = PricingBreakdownData

export function EnrolPayModal({
  open,
  onClose,
  programId,
  programName,
  playerName,
  formData,
}: {
  open: boolean
  onClose: () => void
  programId: string
  programName: string
  playerName: string
  /** Snapshot of the parent EnrolForm's FormData. */
  formData: FormData | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [intentId, setIntentId] = useState<string | null>(null)
  const [amountCents, setAmountCents] = useState<number>(0)
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null)

  const stripeJsPromise = useMemo(() => getStripeJs(), [])

  // Kick off prepare on open
  useEffect(() => {
    if (!open || !formData || clientSecret || preparing) return
    setPreparing(true)
    setError(null)
    prepareEnrolPayment(programId, formData)
      .then(result => {
        if (!result.ok) {
          setError(result.error)
        } else {
          setClientSecret(result.clientSecret)
          setIntentId(result.intentId)
          setAmountCents(result.amountCents)
          setBreakdown((result.breakdown as Breakdown | null) ?? null)
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to start payment'))
      .finally(() => setPreparing(false))
  }, [open, formData, programId, clientSecret, preparing])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setError(null)
      setClientSecret(null)
      setIntentId(null)
      setAmountCents(0)
      setBreakdown(null)
      setPreparing(false)
    }
  }, [open])

  if (!open) return null

  if (!publishableKey) {
    return (
      <Backdrop onClose={onClose}>
        <p className="text-sm text-warning">
          Card payments are not configured yet. Choose &quot;Pay later&quot; to enrol now and pay by bank transfer.
        </p>
      </Backdrop>
    )
  }

  return (
    <Backdrop onClose={onClose}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Enrol &amp; Pay</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {programName} — {playerName}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>

      {/* Breakdown — uses shared component so labels/expiry/tier-2 stay consistent */}
      {breakdown && (
        <PricingBreakdownPanel
          breakdown={breakdown}
          className="mb-4 rounded-lg border border-border bg-muted/30 px-4 py-3"
        />
      )}

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {preparing && !clientSecret && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Preparing payment…
        </div>
      )}

      {clientSecret && intentId && stripeJsPromise && (
        <Elements
          stripe={stripeJsPromise}
          options={{
            clientSecret,
            appearance: { theme: 'stripe' },
          }}
        >
          <ConfirmStep
            amountCents={amountCents}
            intentId={intentId}
            programId={programId}
            onError={setError}
          />
        </Elements>
      )}
    </Backdrop>
  )
}

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-popover p-6 shadow-elevated max-h-[85vh] overflow-y-auto sm:rounded-2xl">
        {children}
      </div>
    </div>
  )
}

function ConfirmStep({
  amountCents,
  intentId,
  programId,
  onError,
}: {
  amountCents: number
  intentId: string
  programId: string
  onError: (msg: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    onError('')

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/parent/programs/${programId}?stripe_redirect=1`,
      },
      redirect: 'if_required',
    })

    if (confirmError) {
      onError(confirmError.message || 'Payment failed')
      setSubmitting(false)
      return
    }

    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      onError(`Payment not complete (status: ${paymentIntent?.status ?? 'unknown'})`)
      setSubmitting(false)
      return
    }

    // Now finalize on the server: create booking + charge + allocate.
    const finalize = await finalizeEnrolPayment(intentId)
    if (!finalize.ok) {
      onError(finalize.error)
      setSubmitting(false)
      return
    }

    // Hard-navigate so revalidated paths refresh on landing
    window.location.assign(`/parent/programs/${finalize.programId}?success=Enrolled+and+paid`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: 'tabs', wallets: { link: 'never' } }} />
      <Button type="submit" disabled={!stripe || submitting} className="mt-4 w-full">
        {submitting ? 'Processing…' : `Pay ${(amountCents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}`}
      </Button>
    </form>
  )
}
