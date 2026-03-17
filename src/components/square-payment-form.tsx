'use client'

import { useEffect, useRef, useState } from 'react'
import { processSquarePayment } from '@/lib/square/payment'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

declare global {
  interface Window {
    Square?: {
      payments: (appId: string, locationId?: string) => Promise<SquarePayments>
    }
  }
}

interface SquarePayments {
  card: () => Promise<SquareCard>
}

interface SquareCard {
  attach: (containerId: string) => Promise<void>
  tokenize: () => Promise<{ status: string; token?: string; errors?: Array<{ message: string }> }>
  destroy: () => void
}

export function SquarePaymentForm({
  familyId,
  amountDollars,
  description,
  invoiceId,
}: {
  familyId: string
  amountDollars: string
  description?: string
  invoiceId?: string
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const cardRef = useRef<SquareCard | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const sourceIdRef = useRef<HTMLInputElement>(null)

  const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID

  useEffect(() => {
    if (!appId) {
      setError('Square is not configured')
      setLoading(false)
      return
    }

    // Load Square Web Payments SDK
    const script = document.createElement('script')
    const env = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'sandbox'
    script.src = env === 'production'
      ? 'https://web.squarecdn.com/v1/square.js'
      : 'https://sandbox.web.squarecdn.com/v1/square.js'
    script.async = true
    script.onload = async () => {
      try {
        if (!window.Square) throw new Error('Square SDK failed to load')
        const payments = await window.Square.payments(appId)
        const card = await payments.card()
        await card.attach('#square-card-container')
        cardRef.current = card
        setLoading(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load payment form')
        setLoading(false)
      }
    }
    script.onerror = () => {
      setError('Failed to load Square SDK')
      setLoading(false)
    }
    document.body.appendChild(script)

    return () => {
      cardRef.current?.destroy()
      document.body.removeChild(script)
    }
  }, [appId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!cardRef.current || processing) return

    setProcessing(true)
    setError(null)

    try {
      const result = await cardRef.current.tokenize()
      if (result.status === 'OK' && result.token) {
        // Set the source_id in the hidden form field and submit
        if (sourceIdRef.current) {
          sourceIdRef.current.value = result.token
        }
        formRef.current?.requestSubmit()
      } else {
        setError(result.errors?.[0]?.message || 'Card tokenisation failed')
        setProcessing(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
      setProcessing(false)
    }
  }

  if (!appId) {
    return (
      <div className="rounded-lg border border-warning/20 bg-warning-light p-4">
        <p className="text-sm text-warning">
          Card payments are not configured yet. Please pay via bank transfer or cash.
        </p>
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-lg font-semibold text-foreground">Pay by Card</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Amount: <strong className="text-foreground">${amountDollars}</strong>
        </p>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-4">
          <div id="square-card-container" className="min-h-[50px]">
            {loading && <p className="text-sm text-muted-foreground/60">Loading payment form...</p>}
          </div>
        </div>

        {/* Hidden form that submits to the server action */}
        <form ref={formRef} action={processSquarePayment} className="hidden">
          <input type="hidden" name="source_id" ref={sourceIdRef} />
          <input type="hidden" name="family_id" value={familyId} />
          <input type="hidden" name="amount_dollars" value={amountDollars} />
          {description && <input type="hidden" name="description" value={description} />}
          {invoiceId && <input type="hidden" name="invoice_id" value={invoiceId} />}
        </form>

        <Button
          onClick={handleSubmit}
          disabled={loading || processing}
          className="mt-4 w-full"
        >
          {processing ? 'Processing...' : `Pay $${amountDollars}`}
        </Button>
      </CardContent>
    </Card>
  )
}
