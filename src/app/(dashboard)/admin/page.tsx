import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const [
    { count: familyCount },
    { count: playerCount },
    { count: programCount },
    { data: balances },
  ] = await Promise.all([
    supabase.from('families').select('*', { count: 'exact', head: true }),
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('programs').select('*', { count: 'exact', head: true }),
    supabase.from('family_balance').select('balance_cents, family_id, families(display_id, family_name)')
      .neq('balance_cents', 0)
      .order('balance_cents', { ascending: true }),
  ])

  const totalOutstanding = balances?.reduce((sum, b) => {
    return b.balance_cents < 0 ? sum + b.balance_cents : sum
  }, 0) ?? 0

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
      <p className="mt-1 text-sm text-gray-600">Business snapshot at a glance.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Families" value={String(familyCount ?? 0)} href="/admin/families" />
        <StatCard label="Players" value={String(playerCount ?? 0)} />
        <StatCard label="Programs" value={String(programCount ?? 0)} href="/admin/programs" />
        <StatCard
          label="Outstanding"
          value={totalOutstanding !== 0 ? formatCurrency(totalOutstanding) : '$0.00'}
          negative={totalOutstanding < 0}
        />
      </div>

      {balances && balances.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Account Balances</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Family</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {balances.map((b) => {
                  const family = b.families as unknown as { display_id: string; family_name: string } | null
                  return (
                    <tr key={b.family_id}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <Link href={`/admin/families/${b.family_id}`} className="hover:text-orange-600">
                          {family?.display_id} ({family?.family_name})
                        </Link>
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-medium ${b.balance_cents < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(b.balance_cents)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/families/new"
          className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-6 text-sm font-medium text-gray-600 hover:border-orange-400 hover:text-orange-600"
        >
          + Add new family
        </Link>
        <Link
          href="/admin/programs/new"
          className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-6 text-sm font-medium text-gray-600 hover:border-orange-400 hover:text-orange-600"
        >
          + Add new program
        </Link>
      </div>
    </div>
  )
}

function StatCard({ label, value, href, negative }: { label: string; value: string; href?: string; negative?: boolean }) {
  const content = (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${negative ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
  if (href) {
    return <Link href={href} className="block rounded-lg hover:ring-2 hover:ring-orange-200">{content}</Link>
  }
  return content
}
