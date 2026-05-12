import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { FamilyInlineCard } from './family-inline-card'
import { AddPlayerForm } from './add-player-form'
import { InviteParentForm } from './invite-parent-form'
import { PricingForm } from './pricing-form'
import { PlayerCoachesForm } from './player-coaches-form'
import { WaiveChargeSection } from './waive-charge-section'
import { FamilyDangerZone } from './family-danger-zone'
import { DeletePlayerButton } from '../../approvals/[familyId]/delete-player-button'
import { DisclosureCard } from '@/components/inline-edit/disclosure-card'
import { formatClassificationsLabel } from '@/lib/utils/player-display'
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
    supabase.from('charges').select('id, description, amount_cents, status, type, created_at, session_id, sessions:session_id(date)').eq('family_id', id).in('status', ['pending', 'confirmed']).gt('amount_cents', 0).order('created_at', { ascending: false }).limit(50),
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
        {/* Family info card — Plan 24 inline-edit */}
        <FamilyInlineCard
          familyId={id}
          primaryContact={contact}
          secondaryContact={secondaryContact}
          address={family.address ?? null}
          notes={family.notes ?? null}
          referredBy={family.referred_by ?? null}
          status={(family.status ?? 'active') as 'active' | 'inactive' | 'lead' | 'archived'}
          billingPrefs={billingPrefs}
        />

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
                        {(() => {
                          const label = formatClassificationsLabel({ classifications: (p.classifications as string[] | null) ?? [] })
                          return label ? <span>{label}</span> : null
                        })()}
                        {((p.classifications as string[] | null) ?? []).length > 0 && p.dob && ' - '}
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

        {/* Custom pricing — Plan 24 collapsed by default */}
        <DisclosureCard title="Custom pricing" hint="Per-family rate overrides for groups, squads, and privates.">
          <PricingForm
            familyId={id}
            overrides={pricingOverrides ?? []}
            programs={(allPrograms ?? []).map(p => ({ id: p.id, name: p.name, type: p.type }))}
            coaches={(coaches ?? []).map(c => ({ id: c.id, name: c.name }))}
          />
        </DisclosureCard>

        {/* Outstanding Charges / Waive */}
        {outstandingCharges && outstandingCharges.length > 0 && (
          <WaiveChargeSection charges={outstandingCharges.map(c => ({
            id: c.id,
            description: c.description,
            amount_cents: c.amount_cents,
            status: c.status,
            type: c.type,
            created_at: c.created_at,
            session_date: (c.sessions as unknown as { date: string } | null)?.date ?? null,
          }))} />
        )}

        {/* Private Lesson Coaches — Plan 24 collapsed by default */}
        {players && players.length > 0 && (
          <DisclosureCard title="Private lesson coaches" hint="Per-player allowlist for which coaches can take privates.">
            <PlayerCoachesForm
              players={(players ?? []).filter(p => p.status === 'active').map(p => ({ id: p.id, first_name: p.first_name, last_name: p.last_name }))}
              coaches={(coaches ?? []).map(c => ({
                id: c.id,
                name: c.name,
                private_opt_in_required: c.private_opt_in_required ?? false,
              }))}
              allowedCoaches={(allowedCoaches ?? []).map(a => ({ player_id: a.player_id, coach_id: a.coach_id, auto_approve: a.auto_approve ?? false }))}
            />
          </DisclosureCard>
        )}

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
          isTest={(family as { is_test?: boolean }).is_test === true}
          displayId={family.display_id}
        />
      </div>
    </div>
  )
}
