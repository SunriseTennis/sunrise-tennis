'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, Bell, BellOff, CheckCircle2, Home, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { subscribeToPush, getExistingSubscription } from '@/lib/push/subscribe'
import { splitFullName } from '@/lib/utils/name'
import {
  updateOnboardingContact,
  updateOnboardingPlayers,
  completeOnboarding,
} from './actions'

// ── Types ────────────────────────────────────────────────────────────────

interface Player {
  id: string
  first_name: string
  last_name: string
  dob: string | null
  level: string | null
}

interface OnboardingWizardProps {
  initialStep: number
  error: string | null
  userEmail: string
  primaryContact: { name?: string; first_name?: string; last_name?: string; phone?: string; email?: string }
  players: Player[]
  signupSource: 'admin_invite' | 'self_signup' | 'legacy_import'
}

// ── Ball level labels ────────────────────────────────────────────────────

const BALL_LABELS: Record<string, string> = {
  red: 'Red Ball',
  orange: 'Orange Ball',
  green: 'Green Ball',
  yellow: 'Yellow Ball',
  blue: 'Blue Ball',
  competitive: 'Competitive',
}

function BallBadge({ level }: { level: string | null }) {
  if (!level) return null
  const label = BALL_LABELS[level] ?? level
  const colours: Record<string, string> = {
    red: 'bg-red-100 text-red-700',
    orange: 'bg-orange-100 text-orange-700',
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700',
    competitive: 'bg-purple-100 text-purple-700',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colours[level] ?? 'bg-muted text-muted-foreground'}`}>
      {label}
    </span>
  )
}

// ── Step indicator ───────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`block rounded-full transition-all duration-300 ${
            i + 1 === current
              ? 'size-2.5 bg-[#E87450]'
              : i + 1 < current
              ? 'size-2 bg-[#E87450]/50'
              : 'size-2 bg-muted'
          }`}
        />
      ))}
    </div>
  )
}

// ── Step 1: Contact details ──────────────────────────────────────────────

function StepContact({
  contact,
  userEmail,
  error,
}: {
  contact: { name?: string; first_name?: string; last_name?: string; phone?: string; email?: string }
  userEmail: string
  error: string | null
}) {
  const [pending, startTransition] = useTransition()

  // Plan 18 — admin-invite wizard step 1 now collects first/last as separate
  // fields to match the action's adminInviteContactSchema (which Plan 17
  // updated). Pre-fill from stored split fields, fall back to splitting the
  // legacy bundled `name` for migration-cohort families.
  const fallback = splitFullName(contact.name)
  const initialFirst = contact.first_name ?? fallback.first
  const initialLast = contact.last_name ?? fallback.last

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
        <h2 className="text-xl font-bold text-foreground">Confirm your details</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We&apos;ll use these to contact you about your child&apos;s coaching.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm font-medium text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

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
              placeholder="Your first name"
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
              placeholder="Your surname"
              className="mt-1.5"
              autoComplete="family-name"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="contact_phone">Phone number</Label>
          <Input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            defaultValue={contact.phone ?? ''}
            placeholder="04XX XXX XXX"
            className="mt-1.5"
            autoComplete="tel"
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
        {pending ? 'Saving...' : 'Save & continue'}
      </Button>
    </form>
  )
}

// ── Step 2: Review players ───────────────────────────────────────────────

function StepPlayers({
  players,
  error,
  signupSource,
}: {
  players: Player[]
  error: string | null
  signupSource: 'admin_invite' | 'self_signup' | 'legacy_import'
}) {
  const [pending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateOnboardingPlayers(formData)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Your players</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Check the details look right. You can edit names and dates of birth here.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm font-medium text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {players.length === 0 ? (
        signupSource === 'self_signup' ? (
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Add your first player</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You&apos;ll be able to fill out their details after signing up.
            </p>
            <Link
              href="/parent/players/new"
              className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              + Add a player
            </Link>
            <p className="mt-3 text-[11px] text-muted-foreground/70">
              Or skip for now and Maxim will add them after reviewing your signup.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No players linked to your account yet. Your coach will add them.
          </div>
        )
      ) : (
        <div className="space-y-3">
          {players.map((player) => {
            const isEditing = editingId === player.id
            return (
              <div
                key={player.id}
                className="rounded-xl border border-border bg-card px-4 py-4 shadow-card"
              >
                {/* Hidden field so server action sees this player */}
                <input type="hidden" name={`player_id_${player.id}`} value={player.id} />

                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor={`first_name_${player.id}`} className="text-xs">
                          First name
                        </Label>
                        <Input
                          id={`first_name_${player.id}`}
                          name={`first_name_${player.id}`}
                          type="text"
                          required
                          defaultValue={player.first_name}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Last name</Label>
                        <p className="mt-1 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                          {player.last_name}
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`dob_${player.id}`} className="text-xs">
                        Date of birth
                      </Label>
                      <Input
                        id={`dob_${player.id}`}
                        name={`dob_${player.id}`}
                        type="date"
                        defaultValue={player.dob ?? ''}
                        className="mt-1"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Done editing
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Hidden fields to preserve values when not editing */}
                    <input type="hidden" name={`first_name_${player.id}`} value={player.first_name} />
                    <input type="hidden" name={`dob_${player.id}`} value={player.dob ?? ''} />
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          {player.first_name} {player.last_name}
                        </p>
                        {player.dob ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            DOB: {player.dob}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted-foreground/60">
                            No date of birth on file
                          </p>
                        )}
                        {player.level && (
                          <div className="mt-1.5">
                            <BallBadge level={player.level} />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingId(player.id)}
                        className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                      >
                        Edit
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving...' : 'Looks good — continue'}
      </Button>
    </form>
  )
}

// ── Step 3: Notifications + home screen ─────────────────────────────────

function StepNotifications({ error }: { error: string | null }) {
  const [pushState, setPushState] = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle')
  const [subscriptionJson, setSubscriptionJson] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Detect iOS vs Android for install instructions
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as { MSStream?: unknown }).MSStream

  async function handleEnablePush() {
    setPushState('loading')

    // Check if already subscribed
    const existing = await getExistingSubscription()
    if (existing) {
      setSubscriptionJson(JSON.stringify(existing))
      setPushState('granted')
      return
    }

    const subscription = await subscribeToPush()
    if (subscription) {
      setSubscriptionJson(JSON.stringify(subscription))
      setPushState('granted')
    } else {
      setPushState('denied')
    }
  }

  function handleComplete() {
    startTransition(async () => {
      await completeOnboarding(subscriptionJson)
    })
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Stay in the loop</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Get notified about session changes, booking confirmations, and team updates.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm font-medium text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Push notifications */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FDD5D0]">
            <Bell className="size-4 text-[#E87450]" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-foreground">Push notifications</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Rain cancellations, booking updates, and important alerts.
            </p>
          </div>
        </div>

        <div className="mt-3.5">
          {pushState === 'idle' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleEnablePush}
            >
              <Bell className="mr-2 size-4" />
              Enable notifications
            </Button>
          )}
          {pushState === 'loading' && (
            <Button type="button" variant="outline" size="sm" className="w-full" disabled>
              Requesting permission...
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
              Permission not granted. You can enable this later in Settings.
            </div>
          )}
        </div>
      </div>

      {/* Add to home screen */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FDD5D0]">
            <Smartphone className="size-4 text-[#E87450]" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">Add to home screen</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Install Sunrise Tennis for quick access like a native app.
            </p>
          </div>
        </div>

        <div className="mt-3.5 rounded-lg bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground space-y-1.5">
          {isIOS ? (
            <>
              <p className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">1.</span>
                Tap the Share button <span className="font-medium">(box with arrow)</span> in Safari.
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">2.</span>
                Scroll down and tap <span className="font-medium">&ldquo;Add to Home Screen&rdquo;</span>.
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">3.</span>
                Tap <span className="font-medium">Add</span> to confirm.
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">1.</span>
                Tap the browser menu <span className="font-medium">(three dots)</span>.
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">2.</span>
                Tap <span className="font-medium">&ldquo;Add to Home screen&rdquo;</span> or{' '}
                <span className="font-medium">&ldquo;Install app&rdquo;</span>.
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">3.</span>
                Tap <span className="font-medium">Install</span> to confirm.
              </p>
            </>
          )}
        </div>
      </div>

      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        By continuing you confirm you&apos;ve reviewed our updated{' '}
        <a
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline hover:text-primary/80"
        >
          Terms &amp; Conditions
        </a>
        , including the cancellation policy for private lessons.
      </p>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleComplete}
          disabled={pending}
          className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          Skip for now
        </button>
        <Button onClick={handleComplete} disabled={pending} className="flex-1">
          <Home className="mr-2 size-4" />
          {pending ? 'Setting up...' : "Get started"}
        </Button>
      </div>
    </div>
  )
}

// ── Main wizard ──────────────────────────────────────────────────────────

export function OnboardingWizard({
  initialStep,
  error,
  userEmail,
  primaryContact,
  players,
  signupSource,
}: OnboardingWizardProps) {
  const step = initialStep

  return (
    <div className="gradient-sunrise fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-12">
      <div className="w-full max-w-md animate-fade-up">
        {/* Header */}
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
            Sunrise Tennis
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">
            Welcome aboard
          </h1>
          <p className="mt-1 text-sm text-white/70">
            Step {step} of 3 — let&apos;s get you set up
          </p>
        </div>

        {/* Step dots */}
        <div className="mb-5">
          <StepDots current={step} total={3} />
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-card/95 p-6 shadow-elevated backdrop-blur">
          {step === 1 && (
            <StepContact
              contact={primaryContact}
              userEmail={userEmail}
              error={error}
            />
          )}
          {step === 2 && (
            <StepPlayers
              players={players}
              error={error}
              signupSource={signupSource}
            />
          )}
          {step === 3 && (
            <StepNotifications error={error} />
          )}
        </div>
      </div>
    </div>
  )
}
