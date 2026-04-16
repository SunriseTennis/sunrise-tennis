'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface PaymentContextValue {
  /** Amount in cents to prefill in the payment form, or null for default */
  prefillAmountCents: number | null
  /** Description for the payment (e.g. "Red Ball Group - Sophia") */
  prefillDescription: string | null
  /** Set prefill amount and scroll to payment section */
  requestPayment: (amountCents: number, description: string) => void
  /** Clear the prefill */
  clearPrefill: () => void
}

const PaymentContext = createContext<PaymentContextValue | null>(null)

export function PaymentProvider({ children }: { children: ReactNode }) {
  const [prefillAmountCents, setPrefillAmountCents] = useState<number | null>(null)
  const [prefillDescription, setPrefillDescription] = useState<string | null>(null)

  function requestPayment(amountCents: number, description: string) {
    setPrefillAmountCents(amountCents)
    setPrefillDescription(description)
    // Scroll to payment section
    document.getElementById('payment-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  function clearPrefill() {
    setPrefillAmountCents(null)
    setPrefillDescription(null)
  }

  return (
    <PaymentContext.Provider value={{ prefillAmountCents, prefillDescription, requestPayment, clearPrefill }}>
      {children}
    </PaymentContext.Provider>
  )
}

export function usePayment() {
  return useContext(PaymentContext)
}
