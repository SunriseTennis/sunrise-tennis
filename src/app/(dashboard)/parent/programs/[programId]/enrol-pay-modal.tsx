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
import { prepareEnrolPayment, finalizeEnrolPayment, applyCreditOnlyEnrol } from '../actions'
import { Button } from '@/components/ui/button'
import { AlertCircle, X, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/currency'
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
  const [stripeAmountCents, setStripeAmountCents] = useState<number>(0)
  const [creditAppliedCents, setCreditAppliedCents] = useState<number>(0)
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null)
  // Credit-only flow has no clientSecret. Track separately so the modal
  // knows to render the "Apply credit" confirm button instead of Stripe.
  const [creditOnly, setCreditOnly] = useState(false)
  const [applyingCredit, setApplyingCredit] = useState(false)
  const router = useRouter()

  const stripeJsPromise = useMemo(() => getStripeJs(), [])

  // Kick off prepare on open
  useEffect(() => {
    if (!open || !formData || preparing) return
    if (clientSecret || creditOnly) return
    setPreparing(true)
    setError(null)
    prepareEnrolPayment(programId, formData)
      .then(result => {
        if (!result.ok) {
          setError(result.error)
        } else {
          setAmountCents(result.amountCents)
          setStripeAmountCents(result.stripeAmountCents)
          setCreditAppliedCents(result.creditAppliedCents)
          setBreakdown((result.breakdown as Breakdown | null) ?? null)
          if (result.clientSecret && result.intentId) {
            setClientSecret(result.clientSecret)
            setIntentId(result.intentId)
          } else {
            // Credit covers the whole price — no Stripe needed.
            setCreditOnly(true)
          }
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to start payment'))
      .finally(() => setPreparing(false))
  }, [open, formData, programId, clientSecret, creditOnly, preparing])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setError(null)
      setClientSecret(null)
      setIntentId(null)
      setAmountCents(0)
      setStripeAmountCents(0)
      setCreditAppliedCents(0)
      setBreakdown(null)
      setCreditOnly(false)
      setPreparing(false)
      setApplyingCredit(false)
    }
  }, [open])

  if (!open) return null

  if (!publishableKey && !creditOnly) {
    return (
      <Backdrop onClose={onClose}>
        <p className="text-sm text-warning">
          Card payments are not configured yet. Choose &quot;Pay later&quot; to enrol now and pay by bank transfer.
        </p>
      </Backdrop>
    )
  }

  async function handleApplyCredit() {
    if (!formData) return
    setApplyingCredit(true)
    setError(null)
    const result = await applyCreditOnlyEnrol(programId, formData)
    if (!result.ok) {
      setError(result.error)
      setApplyingCredit(false)
      return
    }
    window.location.assign(`/parent/programs/${result.programId}?success=Enrolled+using+account+credit`)
    router.refresh()
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

      {/* Credit-applied banner — surfaces auto-application transparently. */}
      {creditAppliedCents > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            {creditOnly ? (
              <p>
                <span className="font-semibold tabular-nums">{formatCurrency(creditAppliedCents)} credit</span> covers your{' '}
                <span className="font-semibold tabular-nums">{formatCurrency(amountCents)}</span> term enrolment — no card needed.
              </p>
            ) : (
              <p>
                Applying <span className="font-semibold tabular-nums">{formatCurrency(creditAppliedCents)}</span> from your account credit.
                Card pays <span className="font-semibold tabular-nums">{formatCurrency(stripeAmountCents)}</span>.
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {preparing && !clientSecret && !creditOnly && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Preparing payment…
        </div>
      )}

      {creditOnly && (
        <Button
          onClick={handleApplyCredit}
          disabled={applyingCredit || !!error}
          className="mt-2 w-full"
        >
          {applyingCredit ? 'Enrolling…' : `Apply ${formatCurrency(creditAppliedCents)} credit`}
        </Button>
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
            stripeAmountCents={stripeAmountCents}
            creditAppliedCents={creditAppliedCents}
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
  stripeAmountCents,
  creditAppliedCents,
  intentId,
  programId,
  onError,
}: {
  stripeAmountCents: number
  creditAppliedCents: number
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
        {submitting
          ? 'Processing…'
          : creditAppliedCents > 0
            ? `Pay ${formatCurrency(stripeAmountCents)} + apply ${formatCurrency(creditAppliedCents)} credit`
            : `Pay ${formatCurrency(stripeAmountCents)}`}
      </Button>
    </form>
  )
}
