import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'

export default async function FamiliesPage() {
  const supabase = await createClient()

  const { data: families } = await supabase
    .from('families')
    .select('id, display_id, family_name, primary_contact, status, family_balance(balance_cents)')
    .order('display_id')

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Families</h1>
        <Link
          href="/admin/families/new"
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          + Add family
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Family Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Primary Contact</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {families && families.length > 0 ? (
              families.map((f) => {
                const contact = f.primary_contact as { name?: string; phone?: string; email?: string } | null
                const balanceRow = f.family_balance as unknown as { balance_cents: number } | null
                const balance = balanceRow?.balance_cents ?? 0
                return (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <Link href={`/admin/families/${f.id}`} className="hover:text-orange-600">
                        {f.display_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <Link href={`/admin/families/${f.id}`} className="hover:text-orange-600">
                        {f.family_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {contact?.name}{contact?.phone ? ` - ${contact.phone}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        f.status === 'active' ? 'bg-green-100 text-green-700' :
                        f.status === 'lead' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {f.status}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-medium ${balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {balance !== 0 ? formatCurrency(balance) : '-'}
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  No families yet. <Link href="/admin/families/new" className="text-orange-600 hover:text-orange-500">Add one</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
