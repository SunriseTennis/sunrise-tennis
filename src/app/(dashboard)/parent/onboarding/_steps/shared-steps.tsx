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
  PlusCircle,
  Smartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConsentToggle, CONSENT_LABELS } from '@/components/consent-toggle'
import { subscribeToPush, getExistingSubscription } from '@/lib/push/subscribe'
import {
  acknowledgeOnboardingTerms,
  addOnboardingPlayer,
  advancePastA2HS,
  completeOnboarding,
} from '../actions'

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

  // Plan 20 follow-up — auto-skip-if-standalone removed. On Maxim's
  // phone the wizard briefly flashed step 4 then advanced on its own
  // because Safari reported standalone (cached install state from a
  // previous test). The parent should always be able to read the
  // instructions and explicitly press "I've installed it" — installs
  // are short, the auto-skip saved nothing, and the flash was
  // disorienting. If we ever want to short-circuit, it should be a
  // page-level redirect (server-side) not a useEffect that fires
  // mid-render.

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
  /** When provided, renders a "Back" link to that step. */
  backToStep?: number
}

// Plan 19 — `showTermsCheckbox` removed. Both wizards now ack T&C on a
// dedicated earlier step (TermsAndConsentStep), so the Push step is
// purely about notifications + finishing.
export function PushStep({
  error,
  stepNumber,
  totalSteps,
  backToStep,
}: PushStepProps) {
  const [platform] = useState<PushPlatform>(() => detectPushPlatform())
  const [pushState, setPushState] = useState<'idle' | 'loading' | 'granted' | 'denied' | 'unsupported'>(
    () => detectPushPlatform() === 'ios-not-standalone' ? 'unsupported' : 'idle',
  )
  const [subscriptionJson, setSubscriptionJson] = useState<string | null>(null)
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
      await completeOnboarding(subscriptionJson)
    })
  }

  const iosBridgeURL =
    typeof window !== 'undefined'
      ? `${window.location.origin}/parent/onboarding?step=${stepNumber}`
      : `/parent/onboarding?step=${stepNumber}`

  const finishDisabled = pending

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

// ── Add-player form (Plan 19) ─────────────────────────────────────────
//
// Reusable add-player form fired by the wizard's "Add player" step
// (admin-invite path; self-signup wizard has its own copy). Required:
// first/last/dob/gender/best-guess ball-colour. Optional collapsible:
// preferred name, school, medical notes. Classifications auto-fill
// from ball_color in the action; not asked here (admin-only concern).

const BALL_LEVELS = [
  { value: 'unsure', label: "I'm not sure", hint: 'Maxim will assess and confirm.' },
  { value: 'blue', label: 'Blue', hint: 'Tots, ages 3-5.' },
  { value: 'red', label: 'Red', hint: 'Beginners, ages 5-8.' },
  { value: 'orange', label: 'Orange', hint: 'Ages 8-10, transitioning.' },
  { value: 'green', label: 'Green', hint: 'Ages 9-12, low-compression ball.' },
  { value: 'yellow', label: 'Yellow', hint: 'Standard ball, ages 10+.' },
]

interface AddPlayerFormProps {
  onSubmitting?: () => void
  hideHeading?: boolean
  submitLabel?: string
}

export function AddPlayerForm({
  onSubmitting,
  hideHeading = false,
  submitLabel = 'Save player',
}: AddPlayerFormProps) {
  const [pending, startTransition] = useTransition()
  const [showOptional, setShowOptional] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    onSubmitting?.()
    startTransition(async () => {
      await addOnboardingPlayer(formData)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {!hideHeading && (
        <p className="text-sm font-semibold text-foreground">Add a player</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="first_name">First name *</Label>
          <Input id="first_name" name="first_name" required className="mt-1.5" autoComplete="given-name" />
        </div>
        <div>
          <Label htmlFor="last_name">Last name *</Label>
          <Input id="last_name" name="last_name" required className="mt-1.5" autoComplete="family-name" />
        </div>
      </div>

      <div>
        <Label htmlFor="dob">Date of birth *</Label>
        <Input id="dob" name="dob" type="date" required className="mt-1.5" />
      </div>

      <div>
        <Label htmlFor="gender">Gender *</Label>
        <select
          id="gender"
          name="gender"
          required
          defaultValue=""
          className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="" disabled>Select…</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="non_binary">Non-binary</option>
        </select>
      </div>

      <div>
        <Label htmlFor="ball_color">Best-guess ball level *</Label>
        <select
          id="ball_color"
          name="ball_color"
          required
          defaultValue=""
          className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {BALL_LEVELS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}{b.hint ? ` — ${b.hint}` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Whatever feels closest. Maxim will confirm before their first session.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowOptional((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
      >
        <span>{showOptional ? 'Hide' : 'Add'} optional details (preferred name, school, medical notes)</span>
        <span className="text-muted-foreground">{showOptional ? '–' : '+'}</span>
      </button>

      {showOptional && (
        <div className="space-y-3.5 rounded-lg border border-border bg-card p-3.5">
          <div>
            <Label htmlFor="preferred_name">Preferred name</Label>
            <Input id="preferred_name" name="preferred_name" placeholder="e.g. Em (instead of Emma)" className="mt-1.5" />
          </div>

          <div>
            <Label htmlFor="school">School</Label>
            <Input id="school" name="school" placeholder="e.g. McAuley Community School" className="mt-1.5" />
          </div>

          <div>
            <Label htmlFor="medical_notes">Medical notes</Label>
            <Textarea id="medical_notes" name="medical_notes" rows={3} placeholder="Allergies, asthma, recent injuries…" className="mt-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">
              Anything we should know to keep your child safe on court.
            </p>
          </div>
        </div>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        <PlusCircle className="mr-1.5 size-4" />
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}

// ── Terms + per-player media consent step (Plan 19) ───────────────────
//
// Mirrors self-signup wizard step 4 — required T&C ack + per-player
// three-toggle media consent. Used by both wizards so admin-invite
// parents are also asked.

interface SharedConsentPlayer {
  id: string
  first_name: string
  last_name: string
  media_consent_coaching: boolean
  media_consent_social: boolean
}

interface TermsAndConsentStepProps {
  players: SharedConsentPlayer[]
  error: string | null
  stepNumber: number
  totalSteps: number
  backToStep?: number
}

export function TermsAndConsentStep({
  players,
  error,
  stepNumber,
  totalSteps,
  backToStep,
}: TermsAndConsentStepProps) {
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await acknowledgeOnboardingTerms(formData)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        {backToStep ? <BackLink toStep={backToStep} /> : <span />}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Step {stepNumber} of {totalSteps}
        </span>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Terms &amp; media consent</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Quick acknowledgements so we know what we can and can&apos;t do with photos.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <p className="text-sm font-semibold text-foreground">Terms &amp; Conditions</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Please read our{' '}
          <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-primary underline hover:text-primary/80">
            Terms &amp; Conditions
          </a>{' '}
          (covers cancellation policies for private lessons + general use) and our{' '}
          <a href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-primary underline hover:text-primary/80">
            Privacy Policy
          </a>.
        </p>
        <label className="mt-3 flex items-start gap-2.5">
          <input
            type="checkbox"
            name="terms_accepted"
            required
            className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-xs text-foreground">
            I&apos;ve read and accept the Terms &amp; Conditions and Privacy Policy.
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <p className="text-sm font-semibold text-foreground">Media consent (per player)</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          We take photos and short videos during sessions. Pick which uses you&apos;re OK with — leave the rest off. Change any time in Settings.
        </p>
        <ul className="mt-3 space-y-4">
          {players.map((p) => (
            <li key={p.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground">{p.first_name} {p.last_name}</p>
              <div className="mt-2 space-y-1.5">
                <ConsentToggle
                  id={`coaching_${p.id}`}
                  name={`media_consent_coaching_${p.id}`}
                  defaultChecked={p.media_consent_coaching}
                  label={CONSENT_LABELS.coaching.label}
                  hint={CONSENT_LABELS.coaching.hint}
                />
                <ConsentToggle
                  id={`social_${p.id}`}
                  name={`media_consent_social_${p.id}`}
                  defaultChecked={p.media_consent_social}
                  label={CONSENT_LABELS.social.label}
                  hint={CONSENT_LABELS.social.hint}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  )
}
