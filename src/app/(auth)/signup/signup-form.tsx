'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signup, signupViaInvite } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Link from 'next/link'

const REFERRAL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Select one (optional)' },
  { value: 'word_of_mouth', label: 'Friend or family told me' },
  { value: 'google', label: 'Google search' },
  { value: 'social', label: 'Instagram or Facebook' },
  { value: 'school', label: 'My child’s school' },
  { value: 'walked_past', label: 'Walked past the courts' },
  { value: 'event', label: 'Saw you at an event' },
  { value: 'other', label: 'Other' },
]

interface SignupFormProps {
  invite: string | null
  invitedEmail: string | null
  invitedFamilyName: string | null
  inviteError: string | null
}

function SignupFormInner({ invite, invitedEmail, invitedFamilyName, inviteError }: SignupFormProps) {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const [referral, setReferral] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const wantsDetail = referral === 'school' || referral === 'other'
  const detailLabel = referral === 'school' ? 'Which school?' : 'Tell us a bit more'
  const detailPlaceholder = referral === 'school' ? 'e.g. McAuley Community School' : 'Optional'

  // Plan 20 — invite-only path renders a simpler form: locked email,
  // password + confirm, T&C. Name is collected once in the wizard step 1.
  // No second confirmation email — token-bound invite is proof enough.
  const isInviteMode = !!invite && !inviteError && !!invitedEmail
  const passwordMismatch = passwordConfirm.length >= 8 && password !== passwordConfirm

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {inviteError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{inviteError}</AlertDescription>
        </Alert>
      )}

      {invite && !inviteError && (
        <Alert className="mb-4 border-primary/20 bg-primary/5 text-primary">
          <AlertDescription>
            {invitedFamilyName
              ? <>You&apos;ve been invited to join Sunrise Tennis as part of the <strong>{invitedFamilyName}</strong> family. Set a password to continue.</>
              : <>You&apos;ve been invited to join Sunrise Tennis. Set a password to continue.</>}
          </AlertDescription>
        </Alert>
      )}

      {isInviteMode ? (
        <form action={signupViaInvite} className="space-y-4">
          <input type="hidden" name="invite_token" value={invite!} />

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              readOnly
              value={invitedEmail!}
              className="cursor-not-allowed bg-muted/50 text-muted-foreground"
              aria-describedby="email-hint"
            />
            <p id="email-hint" className="text-xs text-muted-foreground">
              We sent your invite to this address — it&apos;s how we know it&apos;s you.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password_confirm">Confirm password</Label>
            <Input
              id="password_confirm"
              name="password_confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Type it again"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              aria-invalid={passwordMismatch}
            />
            {passwordMismatch && (
              <p className="text-xs text-destructive">Passwords don&apos;t match.</p>
            )}
          </div>

          <div className="flex items-start gap-2.5">
            <input
              id="accepted_terms"
              name="accepted_terms"
              type="checkbox"
              required
              className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
            />
            <Label htmlFor="accepted_terms" className="cursor-pointer text-xs leading-relaxed text-muted-foreground">
              I agree to the{' '}
              <Link href="/privacy" target="_blank" className="text-primary hover:text-primary/80 underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link href="/terms" target="_blank" className="text-primary hover:text-primary/80 underline">
                Terms of Service
              </Link>
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={passwordMismatch}>
            Create account &amp; continue
          </Button>
        </form>
      ) : (
        // Self-signup form (no invite token) — unchanged from pre-Plan-20.
        <form action={signup} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                name="first_name"
                type="text"
                required
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                name="last_name"
                type="text"
                required
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="referral_source" className="text-sm">How did you hear about us?</Label>
            <select
              id="referral_source"
              name="referral_source"
              value={referral}
              onChange={(e) => setReferral(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {REFERRAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {wantsDetail && (
              <Input
                name="referral_source_detail"
                type="text"
                placeholder={detailPlaceholder}
                aria-label={detailLabel}
                className="mt-2"
                required={referral === 'school'}
                maxLength={500}
              />
            )}
          </div>

          <div className="flex items-start gap-2.5">
            <input
              id="accepted_terms"
              name="accepted_terms"
              type="checkbox"
              required
              className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
            />
            <Label htmlFor="accepted_terms" className="cursor-pointer text-xs leading-relaxed text-muted-foreground">
              I agree to the{' '}
              <Link href="/privacy" target="_blank" className="text-primary hover:text-primary/80 underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link href="/terms" target="_blank" className="text-primary hover:text-primary/80 underline">
                Terms of Service
              </Link>
            </Label>
          </div>

          <Button type="submit" className="w-full">
            Create account
          </Button>
        </form>
      )}
    </>
  )
}

export function SignupForm(props: SignupFormProps) {
  return (
    <Suspense>
      <SignupFormInner {...props} />
    </Suspense>
  )
}
