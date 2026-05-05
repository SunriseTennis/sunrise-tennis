import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, AlertCircle, XCircle, MessageSquare, ChevronLeft, ExternalLink, Mail } from 'lucide-react'
import { createClient, requireAdmin, decryptMedicalNotes } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  approveFamilyAction,
  requestChangesAction,
  rejectFamilyAction,
  resendApprovalNotification,
} from '../actions'

interface PageProps {
  params: Promise<{ familyId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}

export const dynamic = 'force-dynamic'

const BALL_LEVEL_BADGE: Record<string, string> = {
  red: 'bg-red-100 text-red-800 border-red-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  green: 'bg-green-100 text-green-800 border-green-200',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  advanced: 'bg-amber-100 text-amber-800 border-amber-200',
  elite: 'bg-purple-100 text-purple-800 border-purple-200',
}

export default async function ApprovalDetailPage({ params, searchParams }: PageProps) {
  await requireAdmin()
  const { familyId } = await params
  const { error, success } = await searchParams
  const supabase = await createClient()

  const [{ data: family }, { data: players }] = await Promise.all([
    supabase
      .from('families')
      .select('id, display_id, family_name, primary_contact, secondary_contact, address, approval_status, signup_source, approval_note, created_at, referral_source, referral_source_detail')
      .eq('id', familyId)
      .single(),
    supabase
      .from('players')
      .select('id, first_name, last_name, dob, gender, ball_color, level, classifications, track, medical_notes, media_consent_coaching, media_consent_social, status')
      .eq('family_id', familyId)
      .order('first_name'),
  ])

  if (!family) notFound()

  // Decrypt medical notes for each player so admin can review them.
  // Plan 19 — physical_notes column dropped.
  const playersWithDecrypted = await Promise.all(
    (players ?? []).map(async (p) => {
      if (p.medical_notes) {
        const dec = await decryptMedicalNotes(supabase, p.id)
        return { ...p, medical_notes: dec.medical_notes }
      }
      return p
    })
  )

  const contact = (family.primary_contact ?? {}) as { name?: string; email?: string; phone?: string }
  const isPending = family.approval_status === 'pending_review' || family.approval_status === 'changes_requested'

  const REFERRAL_LABEL: Record<string, string> = {
    word_of_mouth: 'Friend or family',
    google: 'Google search',
    social: 'Instagram or Facebook',
    school: 'School',
    walked_past: 'Walked past',
    event: 'Event',
    other: 'Other',
  }
  const referralLabel = (family as { referral_source?: string }).referral_source
    ? REFERRAL_LABEL[(family as { referral_source: string }).referral_source] ?? (family as { referral_source: string }).referral_source
    : null
  const referralDetail = (family as { referral_source_detail?: string }).referral_source_detail || null

  const approveBound = approveFamilyAction.bind(null, familyId)
  const requestChangesBound = requestChangesAction.bind(null, familyId)
  const rejectBound = rejectFamilyAction.bind(null, familyId)
  const resendBound = resendApprovalNotification.bind(null, familyId)

  return (
    <div className="max-w-4xl space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/approvals" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          All approvals
        </Link>
      </div>

      {/* Header */}
      <header>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">{family.family_name}</h1>
          {family.approval_status === 'changes_requested' && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Changes requested — awaiting parent
            </span>
          )}
          {family.approval_status === 'approved' && (
            <span className="inline-flex items-center rounded-full border border-success/30 bg-success-light px-2 py-0.5 text-xs font-medium text-success">
              Approved
            </span>
          )}
          {family.approval_status === 'rejected' && (
            <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              Rejected
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {family.signup_source === 'self_signup' ? 'Self-signup' : 'Admin-invited'} ·
          submitted {family.created_at ? new Date(family.created_at).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          {family.display_id ? ` · ${family.display_id}` : ''}
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-success/30 bg-success-light px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}

      {family.approval_note && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Last note to parent</p>
          <p className="mt-1 whitespace-pre-wrap">{family.approval_note}</p>
        </div>
      )}

      {/* Contact */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-foreground">Contact details</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Parent name</dt>
              <dd className="text-sm text-foreground">{contact.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Email</dt>
              <dd className="text-sm text-foreground">{contact.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Phone</dt>
              <dd className="text-sm text-foreground">{contact.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Address</dt>
              <dd className="text-sm text-foreground">{family.address ?? '—'}</dd>
            </div>
            {referralLabel && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">How they heard about us</dt>
                <dd className="text-sm text-foreground">
                  {referralLabel}
                  {referralDetail ? <span className="text-muted-foreground"> — {referralDetail}</span> : null}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Players */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Players ({playersWithDecrypted.length})
            </h2>
            <p className="text-xs font-medium uppercase tracking-wider text-amber-700">
              Confirm ball level + classifications
            </p>
          </div>

          {playersWithDecrypted.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              No players yet. Use &ldquo;Request changes&rdquo; below to ask the parent to add at least one player.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {playersWithDecrypted.map(p => (
                <li key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">
                          {p.first_name} {p.last_name}
                        </span>
                        {(p.ball_color || p.level) && (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${BALL_LEVEL_BADGE[p.ball_color || p.level || ''] ?? 'bg-muted text-muted-foreground border-border'}`}>
                            {p.ball_color || p.level}
                          </span>
                        )}
                        {p.track && (
                          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {p.track}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.dob ? `Born ${new Date(p.dob).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'No DOB'}
                        {p.gender ? ` · ${p.gender}` : ''}
                        {' · Media: '}
                        {(() => {
                          const flags = [p.media_consent_coaching, p.media_consent_social].map(Boolean)
                          const on = flags.filter(Boolean).length
                          if (on === 0) return <span className="font-medium text-amber-700">none</span>
                          if (on === 2) return <span className="font-medium text-success">all</span>
                          const labels: string[] = []
                          if (p.media_consent_coaching) labels.push('coaching')
                          if (p.media_consent_social) labels.push('social')
                          return <span className="font-medium text-foreground">{labels.join(', ')}</span>
                        })()}
                      </p>
                      {(p.classifications && (p.classifications as string[]).length > 0) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Classifications: {(p.classifications as string[]).join(', ')}
                        </p>
                      )}
                      {p.medical_notes && (
                        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-900">
                          <span className="font-medium">Medical: </span>{p.medical_notes}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/admin/families/${familyId}/players/${p.id}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      Edit
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Action panel */}
      {isPending && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Decide</h2>

            <form action={approveBound} className="space-y-3">
              <div>
                <Label htmlFor="approve_note" className="text-xs font-medium">
                  Optional welcome note to parent
                </Label>
                <textarea
                  id="approve_note"
                  name="note"
                  rows={2}
                  placeholder="e.g. Welcome aboard! Looking forward to working with Sam."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto">
                <CheckCircle2 className="mr-2 size-4" />
                Approve and let them book
              </Button>
            </form>

            <div className="border-t border-border pt-4">
              <form action={requestChangesBound} className="space-y-3">
                <div>
                  <Label htmlFor="changes_note" className="text-xs font-medium">
                    What needs to change? (parent sees this)
                  </Label>
                  <textarea
                    id="changes_note"
                    name="note"
                    rows={3}
                    required
                    placeholder="e.g. Could you add Sam's date of birth and pick a ball level?"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <Button type="submit" variant="outline" className="w-full sm:w-auto">
                  <MessageSquare className="mr-2 size-4" />
                  Request changes
                </Button>
              </form>
            </div>

            <details className="border-t border-border pt-4">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                Reject this signup (rare — for spam / not-real-family)
              </summary>
              <form action={rejectBound} className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="reject_note" className="text-xs font-medium">
                    Reason (kept for the audit trail)
                  </Label>
                  <textarea
                    id="reject_note"
                    name="note"
                    rows={2}
                    required
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/20"
                  />
                </div>
                <Button type="submit" variant="destructive" className="w-full sm:w-auto">
                  <XCircle className="mr-2 size-4" />
                  Reject
                </Button>
              </form>
            </details>
          </CardContent>
        </Card>
      )}

      {!isPending && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <AlertCircle className="size-4" />
            This family has already been {family.approval_status === 'approved' ? 'approved' : 'rejected'}. Manage them from
            <Link href={`/admin/families/${familyId}`} className="font-medium text-primary hover:text-primary/80">
              their family page
            </Link>.
          </CardContent>
        </Card>
      )}

      {family.approval_status === 'approved' && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Resend welcome notification</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Re-fires the &ldquo;You&apos;re in&rdquo; notification across all configured channels (email, push, in-app). Use if the family was approved before email was wired or didn&apos;t see the original.
              </p>
            </div>
            <form action={resendBound}>
              <Button type="submit" variant="outline" size="sm">
                <Mail className="mr-2 size-4" />
                Resend welcome notification
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
