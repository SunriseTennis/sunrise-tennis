'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { KeyRound, Sun, MailCheck } from 'lucide-react'
import { requestPasswordReset } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const sent = searchParams.get('sent') === '1'

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <MailCheck className="size-6" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">Check your inbox</p>
          <p className="text-xs text-muted-foreground">
            If an account exists for that email, we&apos;ve sent a reset link. It expires in 1 hour.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Don&apos;t see it? Check spam, or{' '}
          <Link href="/forgot-password" className="font-medium text-primary hover:text-primary/80">
            try again
          </Link>.
        </p>
      </div>
    )
  }

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form action={requestPasswordReset} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            We&apos;ll email you a link to set a new password.
          </p>
        </div>

        <Button type="submit" className="w-full">
          Send reset link
        </Button>
      </form>
    </>
  )
}

export default function ForgotPasswordPage() {
  return (
    <div className="gradient-sunrise flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm border-0 shadow-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="size-6 text-primary" />
          </div>
          <CardTitle className="mt-2 text-2xl">Forgot your password?</CardTitle>
          <CardDescription>We&apos;ll send you a reset link</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <ForgotPasswordForm />
          </Suspense>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Sun className="size-3" />
            <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
