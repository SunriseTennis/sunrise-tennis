import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { FamilyEditForm } from './family-edit-form'
import { AddPlayerForm } from './add-player-form'
import { InviteParentForm } from './invite-parent-form'
import { Suspense } from 'react'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'

export default async function FamilyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: family }, { data: players }, { data: balance }] = await Promise.all([
    supabase.from('families').select('*').eq('id', id).single(),
    supabase.from('players').select('*').eq('family_id', id).order('first_name'),
    supabase.from('family_balance').select('balance_cents').eq('family_id', id).single(),
  ])

  if (!family) notFound()

  const contact = family.primary_contact as { name?: string; phone?: string; email?: string } | null

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${family.display_id} - ${family.family_name}`}
        breadcrumbs={[{ label: 'Families', href: '/admin/families' }]}
        action={<StatusBadge status={family.status ?? 'active'} />}
      />

      {balance && (
        <p className={`mt-2 text-sm font-medium ${balance.balance_cents < 0 ? 'text-danger' : balance.balance_cents > 0 ? 'text-success' : 'text-muted-foreground'}`}>
          Balance: {formatCurrency(balance.balance_cents)}
        </p>
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
          </CardContent>
        </Card>

        {/* Players */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Players</h2>

            {players && players.length > 0 ? (
              <div className="mt-4 space-y-3">
                {players.map((p) => (
                  <Link
                    key={p.id}
                    href={`/admin/families/${id}/players/${p.id}`}
                    className="block rounded-lg border border-border p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{p.first_name} {p.last_name}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {p.ball_color && <span className="capitalize">{p.ball_color} ball</span>}
                          {p.ball_color && p.dob && ' - '}
                          {p.dob && <span>DOB: {formatDate(p.dob)}</span>}
                        </p>
                      </div>
                      <StatusBadge status={p.status ?? 'active'} />
                    </div>
                  </Link>
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
          />
        </Suspense>

        {/* Edit family */}
        <FamilyEditForm family={family} />
      </div>
    </div>
  )
}
