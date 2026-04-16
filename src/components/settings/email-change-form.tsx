'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

interface EmailChangeFormProps {
  currentEmail: string
  pendingEmail?: string | null
}

export function EmailChangeForm({ currentEmail, pendingEmail }: EmailChangeFormProps) {
  const [newEmail, setNewEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'pending' | 'error'>
    (pendingEmail ? 'pending' : 'idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [cooldown, setCooldown] = useState(false)

  const canSubmit = newEmail.length > 0
    && newEmail !== currentEmail
    && status !== 'submitting'
    && !cooldown

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setStatus('submitting')
    setErrorMsg('')

    const supabase = createClient()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${siteUrl}/auth/callback` },
    )

    if (error) {
      console.error('Email change failed:', error.message)
      setStatus('error')
      setErrorMsg('Could not initiate email change. The email may already be in use.')
      return
    }

    setStatus('pending')
    setNewEmail('')

    // Cooldown to prevent rapid re-submissions
    setCooldown(true)
    setTimeout(() => setCooldown(false), 60_000)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="border-b border-border/60 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
            <Mail className="size-3.5 text-primary" />
          </div>
          Login Email
        </h2>
      </div>

      <div className="p-5">
        <p className="text-xs text-muted-foreground">
          Your current login email is <span className="font-medium text-foreground">{currentEmail}</span>
        </p>

        {/* Pending banner */}
        {(status === 'pending' || pendingEmail) && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <p className="font-medium">Confirmation required</p>
              <p className="mt-0.5">
                Confirmation emails have been sent to both your current and new email addresses.
                You must click the link in <strong>both</strong> emails to complete the change.
              </p>
            </div>
          </div>
        )}

        {/* Error banner */}
        {status === 'error' && errorMsg && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-danger-light/30 px-3 py-2.5 text-xs text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4">
          <div>
            <Label htmlFor="new_email" className="text-xs">New Email Address</Label>
            <Input
              id="new_email"
              type="email"
              required
              placeholder="Enter new email address"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value)
                if (status === 'error') setStatus('idle')
              }}
              className="mt-1"
              autoComplete="email"
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            {cooldown && (
              <p className="text-xs text-muted-foreground">
                <CheckCircle2 className="mr-1 inline size-3" />
                Request sent. You can submit again shortly.
              </p>
            )}
            <div className="ml-auto">
              <Button type="submit" size="sm" disabled={!canSubmit}>
                {status === 'submitting' && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Change Email
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
