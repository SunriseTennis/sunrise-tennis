'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Sun } from 'lucide-react'
import { signup } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

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

function SignupForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const invite = searchParams.get('invite')
  const [referral, setReferral] = useState('')

  // 'school' wants the school name, 'other' wants the free-text detail.
  const wantsDetail = referral === 'school' || referral === 'other'
  const detailLabel = referral === 'school' ? 'Which school?' : 'Tell us a bit more'
  const detailPlaceholder = referral === 'school' ? 'e.g. McAuley Community School' : 'Optional'

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {invite && (
        <Alert className="mb-4 border-primary/20 bg-primary/5 text-primary">
          <AlertDescription>
            You&apos;ve been invited to join Sunrise Tennis. Create your account below.
          </AlertDescription>
        </Alert>
      )}

      <form action={signup} className="space-y-4">
        {invite && <input type="hidden" name="invite_token" value={invite} />}

        <div className="space-y-2">
          <Label htmlFor="full_name">Full name</Label>
          <Input
            id="full_name"
            name="full_name"
            type="text"
            required
            autoComplete="name"
          />
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

        {!invite && (
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
        )}

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
    </>
  )
}

export default function SignupPage() {
  return (
    <div className="gradient-sunrise flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm border-0 shadow-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Sun className="size-6 text-primary" />
          </div>
          <CardTitle className="mt-2 text-2xl">Sunrise Tennis</CardTitle>
          <CardDescription>Create your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <SignupForm />
          </Suspense>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
