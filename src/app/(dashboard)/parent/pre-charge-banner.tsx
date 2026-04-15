import Link from 'next/link'
import { Receipt, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

/**
 * Banner shown on parent overview when a pre-charge heads-up notification
 * was dispatched to this family in the last 10 days. Lets the parent
 * review upcoming charges before they land.
 */
export async function PreChargeBanner({ familyId }: { familyId: string }) {
  const supabase = await createClient()

  const tenDaysAgo = new Date()
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

  const { data: recent } = await supabase
    .from('notifications')
    .select('id, title, body, url, sent_at')
    .eq('type', 'pre_charge')
    .eq('target_type', 'family')
    .eq('target_id', familyId)
    .gte('sent_at', tenDaysAgo.toISOString())
    .order('sent_at', { ascending: false })
    .limit(1)

  const n = recent?.[0]
  if (!n) return null

  return (
    <Link
      href={n.url || '/parent/payments'}
      className="animate-fade-up flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm shadow-card transition-all hover:shadow-elevated press-scale"
      style={{ animationDelay: '50ms' }}
    >
      <Receipt className="mt-0.5 size-4 shrink-0 text-sky-600" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sky-900">{n.title}</p>
        {n.body && <p className="mt-0.5 text-sky-700 line-clamp-2">{n.body}</p>}
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-sky-400" />
    </Link>
  )
}
