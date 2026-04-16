import { createClient, getSessionUser } from '@/lib/supabase/server'
import { NavWrapper } from '@/components/nav-wrapper'
import type { NavItem } from '@/components/nav-wrapper'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = await getSessionUser()

  // Query badge counts in parallel
  let paymentBadge: number | boolean = false
  let privatesBadge: number | boolean = false

  let messagesBadge: number | boolean = false

  if (user) {
    const { data: role } = await supabase
      .from('user_roles')
      .select('family_id')
      .eq('user_id', user.id)
      .eq('role', 'parent')
      .single()

    if (role?.family_id) {
      const [balanceResult, pendingBookingsResult, unreadRepliesResult] = await Promise.all([
        // Outstanding confirmed balance (negative = owes money for completed sessions)
        supabase
          .from('family_balance')
          .select('confirmed_balance_cents')
          .eq('family_id', role.family_id)
          .single(),
        // Pending private bookings awaiting confirmation
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('family_id', role.family_id)
          .eq('status', 'pending'),
        // Unread message replies (cast until DB types updated)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('sender_id', user.id)
          .not('admin_reply', 'is', null)
          .is('read_at', null),
      ])

      const confirmedBalance = balanceResult.data?.confirmed_balance_cents ?? 0
      if (confirmedBalance < 0) paymentBadge = true
      if (pendingBookingsResult.count && pendingBookingsResult.count > 0) {
        privatesBadge = pendingBookingsResult.count
      }
      if (unreadRepliesResult.count && unreadRepliesResult.count > 0) {
        messagesBadge = unreadRepliesResult.count
      }
    }
  }

  const navItems: NavItem[] = [
    { href: '/parent', label: 'Overview', icon: 'LayoutDashboard' },
    { href: '/parent/programs', label: 'Programs', icon: 'GraduationCap' },
    { href: '/parent/bookings', label: 'Privates', icon: 'UserPlus', badge: privatesBadge },
    { href: '/parent/payments', label: 'Payments', icon: 'CreditCard', badge: paymentBadge },
    { href: '/parent/messages', label: 'Messages', icon: 'MessageSquare', badge: messagesBadge },
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
