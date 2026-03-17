import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { FamilyEditForm } from './family-edit-form'
import { AddPlayerForm } from './add-player-form'

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
      <div className="flex items-center gap-3">
        <Link href="/admin/families" className="text-sm text-gray-500 hover:text-gray-700">&larr; Families</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">{family.display_id} - {family.family_name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
          family.status === 'active' ? 'bg-green-100 text-green-700' :
          family.status === 'lead' ? 'bg-blue-100 text-blue-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {family.status}
        </span>
      </div>

      {balance && (
        <p className={`mt-2 text-sm font-medium ${balance.balance_cents < 0 ? 'text-red-600' : balance.balance_cents > 0 ? 'text-green-600' : 'text-gray-500'}`}>
          Balance: {formatCurrency(balance.balance_cents)}
        </p>
      )}

      <div className="mt-6 space-y-8">
        {/* Family info card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">Primary Contact</dt>
              <dd className="text-sm text-gray-900">{contact?.name ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Phone</dt>
              <dd className="text-sm text-gray-900">{contact?.phone ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Email</dt>
              <dd className="text-sm text-gray-900">{contact?.email ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Address</dt>
              <dd className="text-sm text-gray-900">{family.address ?? '-'}</dd>
            </div>
            {family.referred_by && (
              <div>
                <dt className="text-xs font-medium text-gray-500">Referred By</dt>
                <dd className="text-sm text-gray-900">{family.referred_by}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-gray-500">Created</dt>
              <dd className="text-sm text-gray-900">{family.created_at ? formatDate(family.created_at) : '-'}</dd>
            </div>
          </dl>
        </div>

        {/* Players */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Players</h2>
          </div>

          {players && players.length > 0 ? (
            <div className="mt-4 space-y-3">
              {players.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/families/${id}/players/${p.id}`}
                  className="block rounded-lg border border-gray-200 p-4 hover:border-orange-300 hover:bg-orange-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{p.first_name} {p.last_name}</p>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {p.ball_color && <span className="capitalize">{p.ball_color} ball</span>}
                        {p.ball_color && p.dob && ' - '}
                        {p.dob && <span>DOB: {formatDate(p.dob)}</span>}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">No players added yet.</p>
          )}

          <div className="mt-4 border-t border-gray-200 pt-4">
            <AddPlayerForm familyId={id} />
          </div>
        </div>

        {/* Edit family */}
        <FamilyEditForm family={family} />
      </div>
    </div>
  )
}
