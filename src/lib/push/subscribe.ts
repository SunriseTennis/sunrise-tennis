/**
 * Client-side push subscription helper.
 * Requests notification permission, subscribes via service worker, returns subscription JSON.
 *
 * Plan 20 follow-up — `/sw.js` is shipped in `public/` but nothing in
 * the app registered it on the client. Result: `navigator.serviceWorker.ready`
 * waited forever for a registration that never happened, the wizard's
 * "Enable notifications" button hung in "Requesting permission…" after
 * iOS granted permission. Now we register `/sw.js` ourselves before
 * subscribing.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Register `/sw.js` if not already registered. Returns the active
 * registration. Resolves quickly (no hung-await trap) — the registration
 * promise either resolves with a registration or rejects with a real
 * error.
 */
async function ensureServiceWorkerRegistered(): Promise<ServiceWorkerRegistration> {
  // Already registered? Use the existing one.
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing) {
    // If it has an active worker, return immediately.
    if (existing.active) return existing
    // Otherwise wait for it to become active.
    return navigator.serviceWorker.ready
  }

  // Not registered yet — register and wait for it to become active.
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  if (reg.active) return reg

  // Wait for installation/activation.
  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const sw = reg.installing || reg.waiting
    if (!sw) {
      // Edge case: registration succeeded but no worker reference yet.
      // Fall back to navigator.serviceWorker.ready.
      navigator.serviceWorker.ready.then(resolve).catch(reject)
      return
    }
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated') resolve(reg)
      if (sw.state === 'redundant') reject(new Error('Service worker became redundant during install'))
    })
  })
}

export async function subscribeToPush(): Promise<PushSubscriptionJSON | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return null
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    throw new Error('Notifications are not configured (missing VAPID key). Tell Maxim.')
  }

  const registration = await ensureServiceWorkerRegistered()

  // If a subscription already exists, reuse it (prevents
  // InvalidStateError on resubscribe with different applicationServerKey).
  const existingSub = await registration.pushManager.getSubscription()
  if (existingSub) return existingSub.toJSON()

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
  })

  return subscription.toJSON()
}

export async function getExistingSubscription(): Promise<PushSubscriptionJSON | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null
  }
  // Don't await `ready` here — if the SW was never registered we'd hang.
  // Return null when there's no registration yet.
  const reg = await navigator.serviceWorker.getRegistration('/')
  if (!reg) return null
  const subscription = await reg.pushManager.getSubscription()
  return subscription?.toJSON() ?? null
}
