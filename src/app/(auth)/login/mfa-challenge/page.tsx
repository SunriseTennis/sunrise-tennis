'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sun, ShieldCheck } from 'lucide-react'
import { verifyMfaChallenge, signout } from '../../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

function MfaChallengeForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  // Plan 15 Phase E — recovery flow threads `next=/auth/update-password`
  // so MFA-enrolled users still land at the password reset form.
  const rawNext = searchParams.get('next')
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form action={verifyMfaChallenge} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div className="space-y-2">
          <Label htmlFor="code">6-digit code</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            pattern="[0-9]{6}"
            placeholder="123456"
            autoFocus
            className="text-center font-mono text-lg tracking-widest"
          />
          <p className="text-xs text-muted-foreground">
            Open your authenticator app and enter the current code for Sunrise Tennis.
          </p>
        </div>

        <Button type="submit" className="w-full">
          Verify and continue
        </Button>
      </form>

      <form action={signout} className="mt-4">
        <button
          type="submit"
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </form>
    </>
  )
}

export default function MfaChallengePage() {
  return (
    <div className="gradient-sunrise flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm border-0 shadow-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <CardTitle className="mt-2 text-2xl">Two-factor authentication</CardTitle>
          <CardDescription>One more step to sign in</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <MfaChallengeForm />
          </Suspense>
          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Sun className="size-3" />
            Sunrise Tennis
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
