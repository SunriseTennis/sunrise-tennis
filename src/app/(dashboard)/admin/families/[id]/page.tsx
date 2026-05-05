import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { FamilyEditForm } from './family-edit-form'
import { AddPlayerForm } from './add-player-form'
import { InviteParentForm } from './invite-parent-form'
import { PricingForm } from './pricing-form'
import { PlayerCoachesForm } from './player-coaches-form'
import { WaiveChargeSection } from './waive-charge-section'
import { FamilyDangerZone } from './family-danger-zone'
import { DeletePlayerButton } from '../../approvals/[familyId]/delete-player-button'
import { Suspense } from 'react'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ success?: string; error?: string }>
}

export default async function FamilyDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { success, error } = await searchParams
  const supabase = await createClient()

  const [{ data: family }, { data: players }, { data: balance }, { data: pricingOverrides }, { data: allPrograms }, { data: coaches }, { data: allowedCoaches }, { data: outstandingCharges }, { data: pendingInvites }] = await Promise.all([
    supabase.from('families').select('*').eq('id', id).single(),
    supabase.from('players').select('*').eq('family_id', id).order('first_name'),
    supabase.from('family_balance').select('balance_cents, confirmed_balance_cents, projected_balance_cents').eq('family_id', id).single(),
    supabase.from('family_pricing').select('id, program_id, program_type, coach_id, per_session_cents, term_fee_cents, notes, valid_from, valid_until').eq('family_id', id).order('created_at', { ascending: false }),
    supabase.from('programs').select('id, name, type').eq('status', 'active').order('name'),
    supabase.from('coaches').select('id, name, private_opt_in_required, delivers_privates').eq('status', 'active').order('name'),
    supabase.from('player_allowed_coaches').select('player_id, coach_id, auto_approve'),
    supabase.from('charges').select('id, description, amount_cents, status, type, created_at').eq('family_id', id).in('status', ['pending', 'confirmed']).gt('amount_cents', 0).order('created_at', { ascending: false }).limit(50),
    supabase.from('invitations').select('id, email, expires_at, created_at, token').eq('family_id', id).eq('status', 'pending').order('created_at', { ascending: false }),
  ])

  if (!family) notFound()

  const contact = family.primary_contact as { name?: string; phone?: string; email?: string } | null
  const secondaryContact = family.secondary_contact as { name?: string; role?: string; phone?: string; email?: string } | null
  const billingPrefs = family.billing_prefs as { payment_method?: string; invoice_pref?: string; rate?: string; package_type?: string } | null

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${family.display_id} - ${family.family_name}`}
        breadcrumbs={[{ label: 'Families', href: '/admin/families' }]}
        action={<StatusBadge status={family.status ?? 'active'} />}
      />

      {success && (
        <div className="mt-4 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {balance && (
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Current:</span>
            <span className={`text-sm font-medium tabular-nums ${balance.confirmed_balance_cents < 0 ? 'text-danger' : balance.confirmed_balance_cents > 0 ? 'text-success' : 'text-muted-foreground'}`}>
              {formatCurrency(balance.confirmed_balance_cents)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Upcoming:</span>
            <span className={`text-sm font-medium tabular-nums ${balance.projected_balance_cents < 0 ? 'text-danger' : balance.projected_balance_cents > 0 ? 'text-success' : 'text-muted-foreground'}`}>
              {formatCurrency(balance.projected_balance_cents)}
            </span>
          </div>
          <Link
            href={`/admin/families/${id}/statement`}
            className="text-xs text-primary hover:underline"
          >
            View statement
          </Link>
        </div>
      )}

      <div className="mt-6 space-y-8">
        {/* Family info card */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Contact Information</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Primary Contact</dt>
                <dd className="text-sm text-foreground">{contact?.name ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Phone</dt>
                <dd className="text-sm text-foreground">{contact?.phone ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                <dd className="text-sm text-foreground">{contact?.email ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Address</dt>
                <dd className="text-sm text-foreground">{family.address ?? '-'}</dd>
              </div>
              {family.referred_by && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Referred By</dt>
                  <dd className="text-sm text-foreground">{family.referred_by}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Created</dt>
                <dd className="text-sm text-foreground">{family.created_at ? formatDate(family.created_at) : '-'}</dd>
              </div>
            </dl>

            {/* Secondary contact */}
            {secondaryContact && (secondaryContact.name || secondaryContact.phone || secondaryContact.email) && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-foreground">Secondary Contact</h3>
                <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                  {secondaryContact.name && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">
                        Name{secondaryContact.role ? ` (${secondaryContact.role})` : ''}
                      </dt>
                      <dd className="text-sm text-foreground">{secondaryContact.name}</dd>
                    </div>
                  )}
                  {secondaryContact.phone && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Phone</dt>
                      <dd className="text-sm text-foreground">{secondaryContact.phone}</dd>
                    </div>
                  )}
                  {secondaryContact.email && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                      <dd className="text-sm text-foreground">{secondaryContact.email}</dd>
                    </div>
                  )}
                </dl>
              </>
            )}

            {/* Billing preferences */}
            {billingPrefs && (billingPrefs.payment_method || billingPrefs.package_type) && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-foreground">Billing Preferences</h3>
                <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                  {billingPrefs.payment_method && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Payment Method</dt>
                      <dd className="text-sm capitalize text-foreground">{billingPrefs.payment_method}</dd>
                    </div>
                  )}
                  {billingPrefs.package_type && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Package Type</dt>
                      <dd className="text-sm capitalize text-foreground">{billingPrefs.package_type}</dd>
                    </div>
                  )}
                </dl>
              </>
            )}

            {/* Notes */}
            {family.notes && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-foreground">Notes</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{family.notes}</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Players */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Players</h2>

            {players && players.length > 0 ? (
              <div className="mt-4 space-y-3">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <Link
                      href={`/admin/families/${id}/players/${p.id}`}
                      className="min-w-0 flex-1"
                    >
                      <p className="font-medium text-foreground">{p.first_name} {p.last_name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {p.ball_color && <span className="capitalize">{p.ball_color} ball</span>}
                        {p.ball_color && p.dob && ' - '}
                        {p.dob && <span>DOB: {formatDate(p.dob)}</span>}
                      </p>
                    </Link>
                    <StatusBadge status={p.status ?? 'active'} />
                    <DeletePlayerButton
                      playerId={p.id}
                      familyId={id}
                      playerName={`${p.first_name} ${p.last_name}`}
                      returnTo="family"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No players added yet.</p>
            )}

            <div className="mt-4 border-t border-border pt-4">
              <AddPlayerForm familyId={id} />
            </div>
          </CardContent>
        </Card>

        {/* Invite parent */}
        <Suspense>
          <InviteParentForm
            familyId={id}
            siteUrl={process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}
            pendingInvites={pendingInvites ?? []}
          />
        </Suspense>

        {/* Custom pricing */}
        <PricingForm
          familyId={id}
          overrides={pricingOverrides ?? []}
          programs={(allPrograms ?? []).map(p => ({ id: p.id, name: p.name, type: p.type }))}
          coaches={(coaches ?? []).map(c => ({ id: c.id, name: c.name }))}
        />

        {/* Outstanding Charges / Waive */}
        {outstandingCharges && outstandingCharges.length > 0 && (
          <WaiveChargeSection charges={outstandingCharges} />
        )}

        {/* Private Lesson Coaches */}
        {players && players.length > 0 && (
          <PlayerCoachesForm
            players={(players ?? []).filter(p => p.status === 'active').map(p => ({ id: p.id, first_name: p.first_name, last_name: p.last_name }))}
            coaches={(coaches ?? []).map(c => ({
              id: c.id,
              name: c.name,
              private_opt_in_required: c.private_opt_in_required ?? false,
            }))}
            allowedCoaches={(allowedCoaches ?? []).map(a => ({ player_id: a.player_id, coach_id: a.coach_id, auto_approve: a.auto_approve ?? false }))}
          />
        )}

        {/* Edit family */}
        <FamilyEditForm family={family} />

        {/* Plan 21 — Danger zone: archive (soft, reversible) + delete
            (hard, only when no operational rows). Compute hasBlockers
            client-side from data already on the page so the Delete
            button is disabled before the click. The RPC is the
            authoritative gate. */}
        <FamilyDangerZone
          familyId={id}
          status={(family.status ?? 'active') as 'active' | 'inactive' | 'archived'}
          hasBlockers={(() => {
            const playerCount = players?.length ?? 0
            const chargeCount = outstandingCharges?.length ?? 0
            const balanceConfirmed = balance?.confirmed_balance_cents ?? 0
            return playerCount > 0 || chargeCount > 0 || balanceConfirmed !== 0
          })()}
          blockerLabel={(() => {
            const parts: string[] = []
            const playerCount = players?.length ?? 0
            const chargeCount = outstandingCharges?.length ?? 0
            const balanceConfirmed = balance?.confirmed_balance_cents ?? 0
            if (playerCount > 0) parts.push(`${playerCount} player${playerCount === 1 ? '' : 's'}`)
            if (chargeCount > 0) parts.push(`${chargeCount} outstanding charge${chargeCount === 1 ? '' : 's'}`)
            if (balanceConfirmed !== 0) parts.push('non-zero balance')
            return parts.length > 0 ? parts.join(', ') : null
          })()}
        />
      </div>
    </div>
  )
}
