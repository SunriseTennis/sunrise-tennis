'use client'

/**
 * Plan 18 — Shared wizard steps for both onboarding paths.
 *
 * Extracted from self-signup-wizard.tsx so the admin-invite wizard
 * gets the same iOS-aware A2HS / Push UX. Step numbering + back-link
 * targets are parameterized so each caller can position them in its
 * own flow (self-signup is 6-step; admin-invite is 4-step).
 */

import { useEffect, useState, useTransition } from 'react'
import {
  AlertCircle,
  Bell,
  BellOff,
  ChevronLeft,
  CheckCircle2,
  Home,
  Smartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { subscribeToPush, getExistingSubscription } from '@/lib/push/subscribe'
import { advancePastA2HS, completeOnboarding } from '../actions'

// ── Tiny shared helpers ─────────────────────────────────────────────────

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm font-medium text-destructive">
      <AlertCircle className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function BackLink({ toStep }: { toStep: number }) {
  return (
    <a
      href={`?step=${toStep}`}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      Back
    </a>
  )
}

// ── Push platform detection ─────────────────────────────────────────────

export type PushPlatform = 'ios-not-standalone' | 'ios-standalone' | 'android' | 'desktop'

export function detectPushPlatform(): PushPlatform {
  if (typeof window === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true
  const isAndroid = /Android/.test(ua)
  if (isIOS && !isStandalone) return 'ios-not-standalone'
  if (isIOS) return 'ios-standalone'
  if (isAndroid) return 'android'
  return 'desktop'
}

// ── A2HS step ───────────────────────────────────────────────────────────

interface A2HSStepProps {
  error: string | null
  stepNumber: number
  totalSteps: number
  /** When provided, renders a "Back" link to that step. */
  backToStep?: number
}

export function A2HSStep({ error, stepNumber, totalSteps, backToStep }: A2HSStepProps) {
  const [pending, startTransition] = useTransition()

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as { MSStream?: unknown }).MSStream

  // Auto-skip if already standalone.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true
    if (isStandalone) {
      startTransition(async () => {
        await advancePastA2HS()
      })
    }
  }, [])

  function handleContinue() {
    startTransition(async () => {
      await advancePastA2HS()
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        {backToStep ? <BackLink toStep={backToStep} /> : <span />}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Step {stepNumber} of {totalSteps}
        </span>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Install Sunrise on your phone</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Quicker access. Better notifications. Feels native.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FDD5D0]">
            <Smartphone className="size-4 text-[#E87450]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Add to home screen</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isIOS ? 'Safari' : 'Browser'} install — takes 10 seconds.
            </p>
          </div>
        </div>

        <div className="mt-3.5 rounded-lg bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground space-y-2">
          {isIOS ? (
            <>
              <p>
                <span className="font-medium text-foreground">1.</span>{' '}
                Tap the <span className="font-medium">Share</span> icon at the bottom of Safari (a square with an arrow up).
              </p>
              <p>
                <span className="font-medium text-foreground">2.</span>{' '}
                Scroll and tap <span className="font-medium">&ldquo;Add to Home Screen&rdquo;</span>.
              </p>
              <p>
                <span className="font-medium text-foreground">3.</span>{' '}
                Tap <span className="font-medium">Add</span>. Sunrise appears on your home screen.
              </p>
              <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-amber-900">
                <span className="font-medium">iOS note:</span> push notifications only work from the installed app — open Sunrise from your home screen for the next step.
              </p>
            </>
          ) : (
            <>
              <p>
                <span className="font-medium text-foreground">1.</span>{' '}
                Tap the browser menu (three dots in Chrome).
              </p>
              <p>
                <span className="font-medium text-foreground">2.</span>{' '}
                Tap <span className="font-medium">&ldquo;Install app&rdquo;</span> or <span className="font-medium">&ldquo;Add to Home screen&rdquo;</span>.
              </p>
              <p>
                <span className="font-medium text-foreground">3.</span>{' '}
                Tap <span className="font-medium">Install</span>.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleContinue}
          disabled={pending}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Skip for now
        </button>
        <Button onClick={handleContinue} disabled={pending} className="flex-1">
          {pending ? 'Continuing…' : "I've installed it"}
        </Button>
      </div>
    </div>
  )
}

// ── Push step ───────────────────────────────────────────────────────────

interface PushStepProps {
  error: string | null
  stepNumber: number
  totalSteps: number
  /** When true, renders the explicit T&C checkbox. Used by admin-invite
   *  path which doesn't have a separate terms step. Self-signup acks
   *  terms at step 4 already. */
  showTermsCheckbox?: boolean
  /** When provided, renders a "Back" link to that step. */
  backToStep?: number
}

export function PushStep({
  error,
  stepNumber,
  totalSteps,
  showTermsCheckbox = false,
  backToStep,
}: PushStepProps) {
  const [platform] = useState<PushPlatform>(() => detectPushPlatform())
  const [pushState, setPushState] = useState<'idle' | 'loading' | 'granted' | 'denied' | 'unsupported'>(
    () => detectPushPlatform() === 'ios-not-standalone' ? 'unsupported' : 'idle',
  )
  const [subscriptionJson, setSubscriptionJson] = useState<string | null>(null)
  const [termsChecked, setTermsChecked] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (platform === 'ios-not-standalone') return
    void (async () => {
      const existing = await getExistingSubscription()
      if (existing) {
        setSubscriptionJson(JSON.stringify(existing))
        setPushState('granted')
      }
    })()
  }, [platform])

  async function handleEnablePush() {
    setPushState('loading')
    const subscription = await subscribeToPush()
    if (subscription) {
      setSubscriptionJson(JSON.stringify(subscription))
      setPushState('granted')
    } else {
      setPushState('denied')
    }
  }

  function handleFinish() {
    startTransition(async () => {
      await completeOnboarding(subscriptionJson, showTermsCheckbox ? termsChecked : undefined)
    })
  }

  const iosBridgeURL =
    typeof window !== 'undefined'
      ? `${window.location.origin}/parent/onboarding?step=${stepNumber}`
      : `/parent/onboarding?step=${stepNumber}`

  const finishDisabled = pending || (showTermsCheckbox && !termsChecked)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        {backToStep ? <BackLink toStep={backToStep} /> : <span />}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {stepNumber === totalSteps ? 'Last step' : `Step ${stepNumber} of ${totalSteps}`}
        </span>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Stay in the loop</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Rain cancellations, booking updates, and important alerts.
        </p>
      </div>

      <ErrorBanner message={error} />

      {platform === 'ios-not-standalone' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Smartphone className="size-4" />
            One more step on iPhone
          </p>
          <p className="mt-2 text-xs text-amber-900">
            Apple only allows push notifications from the installed Sunrise app on iPhone. Open Sunrise from your home screen, then come back to this step to turn them on.
          </p>
          <p className="mt-2 text-xs text-amber-900">
            Open Sunrise → tap Profile → tap <span className="font-medium">&ldquo;Finish setting up&rdquo;</span>. Or copy this link and open it from the installed app:
          </p>
          <code className="mt-2 block break-all rounded bg-white/50 px-2 py-1.5 text-[11px] text-amber-900">
            {iosBridgeURL}
          </code>
          <p className="mt-3 text-xs text-amber-900">
            Or skip and finish setup. You can enable notifications later from Settings inside the app.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FDD5D0]">
              <Bell className="size-4 text-[#E87450]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Push notifications</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Real-time updates without opening the app.
              </p>
            </div>
          </div>

          <div className="mt-3.5">
            {pushState === 'idle' && (
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleEnablePush}>
                <Bell className="mr-2 size-4" />
                Enable notifications
              </Button>
            )}
            {pushState === 'loading' && (
              <Button type="button" variant="outline" size="sm" className="w-full" disabled>
                Requesting permission…
              </Button>
            )}
            {pushState === 'granted' && (
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                <CheckCircle2 className="size-4 shrink-0" />
                Notifications enabled
              </div>
            )}
            {pushState === 'denied' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BellOff className="size-4 shrink-0" />
                Permission not granted. You can enable later in Settings.
              </div>
            )}
          </div>
        </div>
      )}

      {showTermsCheckbox && (
        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            required
            checked={termsChecked}
            onChange={(e) => setTermsChecked(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-border text-primary focus:ring-primary"
          />
          <span className="leading-relaxed">
            I&apos;ve reviewed and agree to the{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-primary underline hover:text-primary/80">
              Terms &amp; Conditions
            </a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-primary underline hover:text-primary/80">
              Privacy Policy
            </a>
            , including the cancellation policy for private lessons.
          </span>
        </label>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleFinish}
          disabled={finishDisabled}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Skip notifications
        </button>
        <Button onClick={handleFinish} disabled={finishDisabled} className="flex-1">
          <Home className="mr-2 size-4" />
          {pending ? 'Finishing…' : 'Finish setup'}
        </Button>
      </div>
    </div>
  )
}
