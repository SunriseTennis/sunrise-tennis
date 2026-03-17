'use client'

import { useEffect, useState } from 'react'
import { subscribeToPush, getExistingSubscription } from '@/lib/push/subscribe'

export function PushPrompt() {
  const [show, setShow] = useState(false)
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    // Don't show if not supported or already dismissed
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (localStorage.getItem('push-prompt-dismissed')) return

    getExistingSubscription().then((sub) => {
      if (!sub) setShow(true)
    })
  }, [])

  async function handleEnable() {
    setSubscribing(true)
    try {
      const subscription = await subscribeToPush()
      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription),
        })
        setShow(false)
      }
    } finally {
      setSubscribing(false)
    }
  }

  function handleDismiss() {
    localStorage.setItem('push-prompt-dismissed', '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
      <p className="text-sm text-blue-800">
        Enable notifications to get rain cancellations, booking confirmations, and team updates.
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleDismiss}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          Later
        </button>
        <button
          onClick={handleEnable}
          disabled={subscribing}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {subscribing ? 'Enabling...' : 'Enable'}
        </button>
      </div>
    </div>
  )
}
