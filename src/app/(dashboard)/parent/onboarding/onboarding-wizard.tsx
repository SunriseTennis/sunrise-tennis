'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { splitFullName } from '@/lib/utils/name'
import { updateOnboardingContact } from './actions'
import { ADMIN_INVITE_TOTAL_STEPS } from './constants'
import { A2HSStep, AddPlayerForm, PushStep, TermsAndConsentStep } from './_steps/shared-steps'

// ── Types ────────────────────────────────────────────────────────────────

interface Player {
  id: string
  first_name: string
  last_name: string
  dob: string | null
  level: string | null
  media_consent_coaching: boolean
  media_consent_social: boolean
}

interface OnboardingWizardProps {
  initialStep: number
  error: string | null
  userEmail: string
  primaryContact: { name?: string; first_name?: string; last_name?: string; phone?: string; email?: string }
  players: Player[]
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

// ── Step 2: Players list + inline add ────────────────────────────────────
//
// Plan 19 — admin-invite parents can now add players in the wizard
// (matches self-signup). At least one player is required to advance.
// In-line edit of pre-existing names/DOB is gone (parent edits later
// via /parent/players/[id]); the migration cohort already passed
// through the old flow, so removing it doesn't regress anyone.

function StepPlayers({
  players,
  error,
}: {
  players: Player[]
  error: string | null
}) {
  const [showAddForm, setShowAddForm] = useState(players.length === 0)

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">
          {players.length === 0 ? 'Add your first player' : 'Your players'}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {players.length === 0
            ? 'You&apos;ll need at least one player before we can finish setup.'
            : 'Add another, or continue once you&apos;re happy with the list.'}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm font-medium text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {players.length > 0 && (
        <div className="space-y-2">
          {players.map((player) => (
            <div
              key={player.id}
              className="flex items-start justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-card"
            >
              <div>
                <p className="font-semibold text-sm text-foreground">
                  {player.first_name} {player.last_name}
                </p>
                {player.dob && (
                  <p className="mt-0.5 text-xs text-muted-foreground">DOB: {player.dob}</p>
                )}
                {player.level && (
                  <div className="mt-1.5">
                    <BallBadge level={player.level} />
                  </div>
                )}
              </div>
              <Link
                href={`/parent/players/${player.id}`}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Edit later →
              </Link>
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <AddPlayerForm
            hideHeading={players.length === 0}
            submitLabel={players.length === 0 ? 'Save & continue' : 'Save player'}
          />
          {players.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="mt-3 w-full text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="w-full rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
        >
          + Add another player
        </button>
      )}

      {players.length > 0 && (
        <Button asChild className="w-full">
          <Link href="/parent/onboarding?step=3">Continue to consent</Link>
        </Button>
      )}
    </div>
  )
}

// Plan 18 — Steps 4 (A2HS) and 5 (Push) are shared with the self-signup
// wizard via _steps/shared-steps.tsx. Plan 19 — Step 3 (Terms + media
// consent) is also now shared; T&C tick moved off the Push step.

// ── Main wizard ──────────────────────────────────────────────────────────

export function OnboardingWizard({
  initialStep,
  error,
  userEmail,
  primaryContact,
  players,
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
            Step {step} of {ADMIN_INVITE_TOTAL_STEPS} — let&apos;s get you set up
          </p>
        </div>

        {/* Step dots */}
        <div className="mb-5">
          <StepDots current={step} total={ADMIN_INVITE_TOTAL_STEPS} />
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
            <StepPlayers players={players} error={error} />
          )}
          {step === 3 && (
            <TermsAndConsentStep
              players={players}
              error={error}
              stepNumber={3}
              totalSteps={ADMIN_INVITE_TOTAL_STEPS}
              backToStep={2}
            />
          )}
          {step === 4 && (
            <A2HSStep
              error={error}
              stepNumber={4}
              totalSteps={ADMIN_INVITE_TOTAL_STEPS}
              backToStep={3}
            />
          )}
          {step === 5 && (
            <PushStep
              error={error}
              stepNumber={5}
              totalSteps={ADMIN_INVITE_TOTAL_STEPS}
              backToStep={4}
            />
          )}
        </div>
      </div>
    </div>
  )
}
