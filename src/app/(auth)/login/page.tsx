'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Sun } from 'lucide-react'
import { login, loginWithMagicLink } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const [mode, setMode] = useState<'password' | 'magic-link'>('password')

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {mode === 'password' ? (
        <form action={login} className="space-y-4">
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
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      ) : (
        <form action={loginWithMagicLink} className="space-y-4">
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

          <Button type="submit" className="w-full">
            Send magic link
          </Button>
        </form>
      )}

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => setMode(mode === 'password' ? 'magic-link' : 'password')}
          className="text-sm text-primary hover:text-primary/80 transition-colors"
        >
          {mode === 'password' ? 'Sign in with magic link instead' : 'Sign in with password instead'}
        </button>
      </div>
    </>
  )
}

export default function LoginPage() {
  return (
    <div className="gradient-sunrise flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm border-0 shadow-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Sun className="size-6 text-primary" />
          </div>
          <CardTitle className="mt-2 text-2xl">Sunrise Tennis</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginForm />
          </Suspense>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary hover:text-primary/80 font-medium transition-colors">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
