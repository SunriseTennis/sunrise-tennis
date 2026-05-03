import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { KeyRound, Sun } from 'lucide-react'
import { getSessionUser } from '@/lib/supabase/server'
import { updatePassword } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

// Plan 15 Phase E — set new password after recovery email click.
// The user reaches this page via /auth/callback which has already exchanged
// the PKCE code and set a recovery session. If somehow we land here without
// a session, redirect to /forgot-password so they can request a fresh link.

interface PageProps {
  searchParams: Promise<{ error?: string }>
}

function UpdatePasswordForm({ error }: { error: string | null }) {
  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form action={updatePassword} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm_password">Confirm new password</Label>
          <Input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Re-enter the same password"
          />
        </div>

        <Button type="submit" className="w-full">
          Update password
        </Button>
      </form>

      <p className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        After updating, you&apos;ll be signed out and asked to sign in with your new password.
      </p>
    </>
  )
}

export default async function UpdatePasswordPage({ searchParams }: PageProps) {
  const user = await getSessionUser()
  if (!user) {
    redirect('/forgot-password?error=' + encodeURIComponent('Your reset link has expired. Please request a new one.'))
  }

  const { error } = await searchParams

  return (
    <div className="gradient-sunrise flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm border-0 shadow-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="size-6 text-primary" />
          </div>
          <CardTitle className="mt-2 text-2xl">Set a new password</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <UpdatePasswordForm error={error ?? null} />
          </Suspense>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Sun className="size-3" />
            <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
              Cancel and sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
