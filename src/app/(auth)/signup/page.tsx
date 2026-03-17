'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Sun } from 'lucide-react'
import { signup } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

function SignupForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const invite = searchParams.get('invite')

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

        <Button type="submit" className="w-full">
          Create account
        </Button>
      </form>
    </>
  )
}

export default function SignupPage() {
  return (
    <div className="gradient-sunrise flex min-h-screen items-center justify-center px-4">
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
