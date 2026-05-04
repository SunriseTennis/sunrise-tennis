import Link from 'next/link'
import { Sun } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { SignupForm } from './signup-form'

interface PeekResult {
  valid: boolean
  reason?: 'missing_token' | 'not_found_or_claimed' | 'expired'
  email?: string
  family_name?: string | null
  expires_at?: string | null
}

async function peekInvitation(token: string): Promise<PeekResult> {
  try {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('peek_invitation_email', { p_token: token })
    if (error) {
      console.error('[signup] peek_invitation_email RPC:', error)
      return { valid: false, reason: 'not_found_or_claimed' }
    }
    return (data ?? { valid: false }) as PeekResult
  } catch (e) {
    console.error('[signup] peek_invitation_email threw:', e)
    return { valid: false, reason: 'not_found_or_claimed' }
  }
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; error?: string }>
}) {
  const { invite } = await searchParams

  let invitedEmail: string | null = null
  let invitedFamilyName: string | null = null
  let inviteError: string | null = null

  if (invite) {
    const peeked = await peekInvitation(invite)
    if (peeked.valid) {
      invitedEmail = peeked.email ?? null
      invitedFamilyName = peeked.family_name ?? null
    } else if (peeked.reason === 'expired') {
      inviteError = 'This invite has expired. Please ask Maxim to send a new one.'
    } else {
      inviteError = "We couldn't find that invite — it may have already been used. If you've already signed up, just sign in below."
    }
  }

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
          <SignupForm
            invite={invite ?? null}
            invitedEmail={invitedEmail}
            invitedFamilyName={invitedFamilyName}
            inviteError={inviteError}
          />

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
