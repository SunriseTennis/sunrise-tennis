'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Bell,
  BellOff,
  ChevronLeft,
  CheckCircle2,
  Home,
  PlusCircle,
  Smartphone,
  Trash2,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'
import { subscribeToPush, getExistingSubscription } from '@/lib/push/subscribe'
import {
  acknowledgeOnboardingTerms,
  addOnboardingPlayer,
  advancePastA2HS,
  completeOnboarding,
  removeOnboardingPlayer,
  updateOnboardingContact,
} from './actions'
import { SELF_SIGNUP_TOTAL_STEPS } from './constants'
import { ConsentToggle, CONSENT_LABELS } from '@/components/consent-toggle'

// ── Types ────────────────────────────────────────────────────────────────

interface Player {
  id: string
  first_name: string
  last_name: string
  dob: string | null
  gender: string | null
  level: string | null
  media_consent_coaching: boolean
  media_consent_social: boolean
}

interface SelfSignupWizardProps {
  initialStep: number
  error: string | null
  userEmail: string
  primaryContact: { name?: string; first_name?: string; last_name?: string; phone?: string; email?: string }
  address: string | null
  players: Player[]
  termsAcknowledgedAt: string | null
}

// ── Ball-level reference ────────────────────────────────────────────────

// Sentinel `unsure` lets the parent pick "I'm not sure" without HTML5 `required`
// rejecting an empty option value. Normalised to null in `addOnboardingPlayer`.
const BALL_LEVELS: { value: string; label: string; hint: string }[] = [
  { value: 'unsure', label: "I'm not sure", hint: 'Maxim will assess and confirm.' },
  { value: 'blue', label: 'Blue', hint: 'Tots, ages 3-5.' },
  { value: 'red', label: 'Red', hint: 'Beginners, ages 5-8.' },
  { value: 'orange', label: 'Orange', hint: 'Ages 8-10, transitioning to a bigger court.' },
  { value: 'green', label: 'Green', hint: 'Ages 9-12, full court with low-compression ball.' },
  { value: 'yellow', label: 'Yellow', hint: 'Standard tennis ball, ages 10+.' },
]

const BALL_BADGE: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
}

// ── Step indicator ───────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'block rounded-full transition-all duration-300',
            i + 1 === current && 'size-2.5 bg-[#E87450]',
            i + 1 < current && 'size-2 bg-[#E87450]/50',
            i + 1 > current && 'size-2 bg-muted',
          )}
        />
      ))}
    </div>
  )
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm font-medium text-destructive">
      <AlertCircle className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function BackLink({ toStep }: { toStep: number }) {
  return (
    <Link
      href={`/parent/onboarding?step=${toStep}`}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      Back
    </Link>
  )
}

// ── Step 1 — Contact ─────────────────────────────────────────────────────

function StepContact({
  contact,
  address,
  userEmail,
  error,
}: {
  contact: { name?: string; first_name?: string; last_name?: string; phone?: string; email?: string }
  address: string | null
  userEmail: string
  error: string | null
}) {
  // Plan 17 follow-up — split stored full name into first + last for the
  // edit fields. New self-signups arrive with first_name/last_name already
  // populated from the signup form via dashboard handoff.
  const fullName = contact.name ?? ''
  const spaceIdx = fullName.indexOf(' ')
  const fallbackFirst = spaceIdx >= 0 ? fullName.slice(0, spaceIdx) : fullName
  const fallbackLast = spaceIdx >= 0 ? fullName.slice(spaceIdx + 1).trim() : ''
  const initialFirst = contact.first_name ?? fallbackFirst
  const initialLast = contact.last_name ?? fallbackLast
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateOnboardingContact(formData)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Your contact details</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          So we know who to reach about lessons, schedule changes, and payments.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="contact_first_name">First name</Label>
            <Input
              id="contact_first_name"
              name="contact_first_name"
              type="text"
              required
              defaultValue={initialFirst}
              className="mt-1.5"
              autoComplete="given-name"
            />
          </div>
          <div>
            <Label htmlFor="contact_last_name">Last name</Label>
            <Input
              id="contact_last_name"
              name="contact_last_name"
              type="text"
              required
              defaultValue={initialLast}
              className="mt-1.5"
              autoComplete="family-name"
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Your last name is used as your family name across the platform.
        </p>
        <div>
          <Label htmlFor="contact_phone">Mobile number</Label>
          <Input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            defaultValue={contact.phone ?? ''}
            placeholder="04XX XXX XXX"
            className="mt-1.5"
            autoComplete="tel"
          />
          <p className="mt-1 text-xs text-muted-foreground">For SMS alerts about rain cancellations.</p>
        </div>
        <div>
          <Label htmlFor="address">Address <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            id="address"
            name="address"
            type="text"
            defaultValue={address ?? ''}
            placeholder="Street, suburb"
            className="mt-1.5"
            autoComplete="street-address"
          />
        </div>
        <div>
          <Label htmlFor="contact_email_display" className="text-xs">
            Email <span className="text-muted-foreground">(from your account)</span>
          </Label>
          <Input
            id="contact_email_display"
            type="email"
            value={userEmail}
            readOnly
            disabled
            className="mt-1.5 cursor-not-allowed opacity-60"
          />
        </div>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Save & continue'}
      </Button>
    </form>
  )
}

// ── Step 2 — Add a player ───────────────────────────────────────────────

function StepAddPlayer({
  error,
  hasExistingPlayers,
}: {
  error: string | null
  hasExistingPlayers: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [showOptional, setShowOptional] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await addOnboardingPlayer(formData)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        {hasExistingPlayers ? <BackLink toStep={3} /> : <span />}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {hasExistingPlayers ? 'Add another player' : 'Your first player'}
        </span>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">
          {hasExistingPlayers ? 'Add another player' : 'Tell us about your player'}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We&apos;ll only ask the essentials. The optional bits help us tailor coaching.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="space-y-3.5">
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
              <option key={b.value || 'unknown'} value={b.value}>
                {b.label}{b.hint ? ` — ${b.hint}` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Whatever feels closest. Maxim will confirm before their first session.
          </p>
        </div>
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
            <p className="mt-1 text-xs text-muted-foreground">
              Helps us match school programs and stay coordinated.
            </p>
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
        {pending ? 'Saving…' : (hasExistingPlayers ? 'Add player' : 'Save & continue')}
      </Button>
    </form>
  )
}

// ── Step 3 — Players summary ────────────────────────────────────────────

function StepPlayersSummary({
  players,
  error,
}: {
  players: Player[]
  error: string | null
}) {
  const [pending, startTransition] = useTransition()

  function handleRemove(playerId: string) {
    if (!confirm('Remove this player? You can add them again later.')) return
    startTransition(async () => {
      await removeOnboardingPlayer(playerId)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackLink toStep={2} />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Players ({players.length})
        </span>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Your players</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Add more if you have multiple kids playing. Otherwise continue.
        </p>
      </div>

      <ErrorBanner message={error} />

      <ul className="space-y-2.5">
        {players.map((p) => (
          <li
            key={p.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#FDD5D0]">
                <User className="size-4 text-[#E87450]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {p.first_name} {p.last_name}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {p.dob ? new Date(p.dob).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No DOB'}
                  {p.level && (
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', BALL_BADGE[p.level] ?? 'bg-muted text-muted-foreground')}>
                      {p.level}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(p.id)}
              disabled={pending}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
              aria-label={`Remove ${p.first_name}`}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      <Link
        href="/parent/onboarding?step=2"
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
      >
        <PlusCircle className="size-4" />
        Add another player
      </Link>

      <Link href="/parent/onboarding?step=4">
        <Button className="w-full">Continue</Button>
      </Link>
    </div>
  )
}

// ── Step 4 — Terms + per-player media consent ───────────────────────────

function StepTermsAndConsent({
  players,
  error,
}: {
  players: Player[]
  error: string | null
}) {
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
        <BackLink toStep={3} />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Consents
        </span>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Terms & media consent</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Quick acknowledgements so we know what we can and can&apos;t do with photos.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <p className="text-sm font-semibold text-foreground">Terms & Conditions</p>
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

// ── Step 5 — Add to home screen ─────────────────────────────────────────

function StepA2HS({ error }: { error: string | null }) {
  const [pending, startTransition] = useTransition()

  // Detect platform for instructions.
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as { MSStream?: unknown }).MSStream

  // Check if already running standalone — if so, auto-skip A2HS.
  // Note: we deliberately call startTransition(server-action) inside the effect
  // — it's a navigation, not a state update.
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
        <BackLink toStep={4} />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Step 5 of 6
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

// ── Step 6 — Push notifications ─────────────────────────────────────────

type PushPlatform = 'ios-not-standalone' | 'ios-standalone' | 'android' | 'desktop'

function detectPushPlatform(): PushPlatform {
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

function StepPushNotifications({ error }: { error: string | null }) {
  // Lazy init runs once on first client render. SSR returns 'desktop' (the
  // gradient-screen flash is fine — UI hydrates on the client immediately).
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

  const iosBridgeURL = typeof window !== 'undefined' ? `${window.location.origin}/parent/onboarding?step=6` : '/parent/onboarding?step=6'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackLink toStep={5} />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Last step
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

      <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-3 text-xs text-muted-foreground">
        After this we&apos;ll review your account and approve it (usually within 24 hours). You can browse programs and player details meanwhile.
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleFinish}
          disabled={pending}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Skip notifications
        </button>
        <Button onClick={handleFinish} disabled={pending} className="flex-1">
          <Home className="mr-2 size-4" />
          {pending ? 'Finishing…' : 'Finish setup'}
        </Button>
      </div>
    </div>
  )
}

// ── Main wizard ─────────────────────────────────────────────────────────

export function SelfSignupWizard({
  initialStep,
  error,
  userEmail,
  primaryContact,
  address,
  players,
  termsAcknowledgedAt,
}: SelfSignupWizardProps) {
  const step = initialStep
  const stepLabel = (() => {
    switch (step) {
      case 1: return 'Your contact details'
      case 2: return players.length === 0 ? 'Add your first player' : 'Add another player'
      case 3: return 'Players summary'
      case 4: return 'Terms & consents'
      case 5: return 'Install on phone'
      case 6: return 'Push notifications'
      default: return ''
    }
  })()
  // termsAcknowledgedAt is read by the page-level gate (step >= 5 requires it).
  void termsAcknowledgedAt

  return (
    <div className="gradient-sunrise fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-8">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
            Sunrise Tennis
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">
            Welcome aboard
          </h1>
          <p className="mt-1 text-sm text-white/70">
            Step {step} of {SELF_SIGNUP_TOTAL_STEPS} — {stepLabel}
          </p>
        </div>

        <div className="mb-5">
          <StepDots current={step} total={SELF_SIGNUP_TOTAL_STEPS} />
        </div>

        <div className="rounded-2xl bg-card/95 p-5 shadow-elevated backdrop-blur sm:p-6">
          {step === 1 && (
            <StepContact
              contact={primaryContact}
              address={address}
              userEmail={userEmail}
              error={error}
            />
          )}
          {step === 2 && (
            <StepAddPlayer error={error} hasExistingPlayers={players.length > 0} />
          )}
          {step === 3 && (
            <StepPlayersSummary players={players} error={error} />
          )}
          {step === 4 && (
            <StepTermsAndConsent players={players} error={error} />
          )}
          {step === 5 && (
            <StepA2HS error={error} />
          )}
          {step === 6 && (
            <StepPushNotifications error={error} />
          )}
        </div>
      </div>
    </div>
  )
}
