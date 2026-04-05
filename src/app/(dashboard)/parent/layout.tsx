import { createClient, getSessionUser } from '@/lib/supabase/server'
import { NavWrapper } from '@/components/nav-wrapper'
import type { NavItem } from '@/components/nav-wrapper'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = await getSessionUser()

  // Query badge counts in parallel
  let paymentBadge: number | boolean = false
  let privatesBadge: number | boolean = false

  if (user) {
    const { data: role } = await supabase
      .from('user_roles')
      .select('family_id')
      .eq('user_id', user.id)
      .eq('role', 'parent')
      .single()

    if (role?.family_id) {
      const [balanceResult, pendingBookingsResult] = await Promise.all([
        // Outstanding balance (negative = owes money)
        supabase
          .from('family_balance')
          .select('balance_cents')
          .eq('family_id', role.family_id)
          .single(),
        // Pending private bookings awaiting confirmation
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('family_id', role.family_id)
          .eq('status', 'pending'),
      ])

      const balance = balanceResult.data?.balance_cents ?? 0
      if (balance < 0) paymentBadge = true
      if (pendingBookingsResult.count && pendingBookingsResult.count > 0) {
        privatesBadge = pendingBookingsResult.count
      }
    }
  }

  const navItems: NavItem[] = [
    { href: '/parent', label: 'Overview', icon: 'LayoutDashboard' },
    { href: '/parent/programs', label: 'Programs', icon: 'GraduationCap' },
    { href: '/parent/bookings', label: 'Privates', icon: 'UserPlus', badge: privatesBadge },
    { href: '/parent/payments', label: 'Payments', icon: 'CreditCard', badge: paymentBadge },
    { href: '/parent/teams', label: 'Comp', icon: 'Trophy' },
    { href: '/parent/events', label: 'Events', icon: 'CalendarDays' },
    { href: '/parent/settings', label: 'Settings', icon: 'Settings' },
  ]

  return (
    <NavWrapper items={navItems} mobileVisibleCount={4}>
      {children}
    </NavWrapper>
  )
}
