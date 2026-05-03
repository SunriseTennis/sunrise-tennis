'use client'

/**
 * Plan 15 Phase F — Two-factor authentication (TOTP, opt-in).
 *
 * Renders inside SettingsAccordion. Lets the user enrol/disable a TOTP
 * factor via Supabase Auth MFA. No friction for users who don't enrol —
 * login still works without MFA. Once enrolled, the next login will be
 * gated by /login/mfa-challenge.
 *
 * Recovery posture: Supabase doesn't ship recovery codes natively. The
 * recommended path is enrolling a SECOND TOTP factor on a different
 * device (e.g. backup authenticator). The UI surfaces this nudge after
 * first enrolment.
 */

import { useEffect, useState, useTransition } from 'react'
import { ShieldCheck, ShieldAlert, Smartphone, Loader2, Check, X, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Factor {
  id: string
  friendly_name?: string | null
  factor_type: string
  status: string
  created_at?: string
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'enrol-loading' }
  | { kind: 'enrol-show'; factorId: string; qr: string; secret: string; friendlyName: string }
  | { kind: 'enrol-verify'; factorId: string; friendlyName: string; submitting: boolean }
  | { kind: 'unenrol-confirm'; factorId: string }

export function MfaSection() {
  const supabase = createClient()
  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function refreshFactors() {
    setLoading(true)
    const { data, error: e } = await supabase.auth.mfa.listFactors()
    if (e) { setError(e.message); setLoading(false); return }
    setFactors((data?.totp ?? []).map((f) => ({
      id: f.id,
      friendly_name: f.friendly_name,
      factor_type: f.factor_type,
      status: f.status,
      created_at: f.created_at,
    })))
    setLoading(false)
  }

  useEffect(() => {
    refreshFactors().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startEnrol() {
    setError(null)
    setSuccess(null)
    setMode({ kind: 'enrol-loading' })

    const verifiedCount = factors.filter(f => f.status === 'verified').length
    const friendlyName =
      verifiedCount === 0 ? 'Primary authenticator' : `Backup authenticator ${verifiedCount + 1}`

    const { data, error: e } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    })
    if (e || !data) {
      setError(e?.message ?? 'Enrol failed')
      setMode({ kind: 'idle' })
      return
    }
    setMode({
      kind: 'enrol-show',
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
      friendlyName,
    })
  }

  async function verifyEnrol(factorId: string, friendlyName: string) {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setMode({ kind: 'enrol-verify', factorId, friendlyName, submitting: true })
    setError(null)

    const { data: chal, error: ce } = await supabase.auth.mfa.challenge({ factorId })
    if (ce || !chal) {
      setError(ce?.message ?? 'Could not start challenge')
      setMode({ kind: 'enrol-show', factorId, friendlyName, qr: '', secret: '' })
      return
    }
    const { error: ve } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: chal.id,
      code,
    })
    if (ve) {
      setError(ve.message)
      setMode({ kind: 'enrol-verify', factorId, friendlyName, submitting: false })
      return
    }
    setCode('')
    setMode({ kind: 'idle' })
    setSuccess(
      factors.length === 0
        ? 'Two-factor authentication enabled. Add a backup authenticator on a second device — there are no recovery codes.'
        : 'Backup authenticator added.'
    )
    startTransition(() => { refreshFactors() })
  }

  async function unenrol(factorId: string) {
    setError(null)
    const { error: e } = await supabase.auth.mfa.unenroll({ factorId })
    if (e) { setError(e.message); return }
    setSuccess('Authenticator removed.')
    setMode({ kind: 'idle' })
    startTransition(() => { refreshFactors() })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking your 2FA status...
      </div>
    )
  }

  const verifiedFactors = factors.filter(f => f.status === 'verified')

  return (
    <div className="space-y-3">
      {/* Status */}
      {verifiedFactors.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Two-factor authentication is OFF.</p>
            <p className="mt-1">
              Enable it to require a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy) at every login. Adds about 5 seconds to sign-in. Optional.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success-light px-3 py-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <div className="text-xs text-success">
            <p className="font-medium">Two-factor authentication is ON.</p>
            <p className="mt-1">
              You&apos;ll be asked for a 6-digit code at sign-in.
            </p>
          </div>
        </div>
      )}

      {/* Existing factors */}
      {verifiedFactors.length > 0 && (
        <ul className="space-y-2">
          {verifiedFactors.map(f => (
            <li key={f.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Smartphone className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {f.friendly_name ?? 'Authenticator'}
                  </p>
                  {f.created_at && (
                    <p className="text-[11px] text-muted-foreground">
                      Added {new Date(f.created_at).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
              {mode.kind === 'unenrol-confirm' && mode.factorId === f.id ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => unenrol(f.id)}
                  >
                    Remove
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setMode({ kind: 'idle' })}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode({ kind: 'unenrol-confirm', factorId: f.id })}
                  className="text-xs font-medium text-destructive hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add / enrol flow */}
      {(mode.kind === 'idle' || mode.kind === 'enrol-loading') && (
        <Button
          type="button"
          variant={verifiedFactors.length === 0 ? 'default' : 'outline'}
          onClick={startEnrol}
          disabled={mode.kind === 'enrol-loading'}
          className="w-full sm:w-auto"
        >
          {mode.kind === 'enrol-loading' ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : verifiedFactors.length === 0 ? (
            <ShieldCheck className="mr-2 size-4" />
          ) : (
            <Plus className="mr-2 size-4" />
          )}
          {verifiedFactors.length === 0 ? 'Enable 2FA' : 'Add backup authenticator'}
        </Button>
      )}

      {(mode.kind === 'enrol-show' || mode.kind === 'enrol-verify') && (
        <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Scan with your authenticator app</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Open Google Authenticator, 1Password, or Authy and scan this QR code, then enter the 6-digit code shown.
            </p>
          </div>
          {mode.kind === 'enrol-show' && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mode.qr} alt="TOTP QR code" className="mx-auto h-44 w-44 rounded-md border border-border bg-white p-2" />
              <details className="text-[11px] text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">Can&apos;t scan? Enter setup key manually</summary>
                <code className="mt-2 block break-all rounded bg-muted px-2 py-1.5 font-mono text-[11px]">{mode.secret}</code>
              </details>
            </>
          )}
          <div>
            <Label htmlFor="mfa_code" className="text-xs">6-digit code from your app</Label>
            <Input
              id="mfa_code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="mt-1 font-mono tracking-widest"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => verifyEnrol(
                mode.factorId,
                mode.kind === 'enrol-show' ? mode.friendlyName : mode.friendlyName,
              )}
              disabled={mode.kind === 'enrol-verify' && mode.submitting}
              className="flex-1"
            >
              {mode.kind === 'enrol-verify' && mode.submitting ? (
                <><Loader2 className="mr-2 size-4 animate-spin" /> Verifying...</>
              ) : (
                <><Check className="mr-2 size-4" /> Verify and turn on</>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                // Cancel the in-progress enrolment by removing the unverified factor.
                supabase.auth.mfa.unenroll({ factorId: mode.factorId }).then(() => {
                  setCode('')
                  setMode({ kind: 'idle' })
                  refreshFactors()
                })
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-success/20 bg-success-light px-3 py-2 text-xs text-success">
          {success}
        </div>
      )}
    </div>
  )
}
