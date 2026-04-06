import { createClient } from '@/lib/supabase/server'
import { NavWrapper } from '@/components/nav-wrapper'
import type { NavItem } from '@/components/nav-wrapper'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // Query admin badge counts in parallel
  const [pendingVouchersResult, pendingBookingsResult, unreadMessagesResult] = await Promise.all([
    // Pending voucher submissions
    supabase
      .from('vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'submitted'),
    // Pending private booking requests
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    // Unread parent messages (messages table pending migration)
    // @ts-expect-error messages table not yet in DB types
    supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_role', 'admin')
      .is('read_at', null)
      .is('archived_at', null),
  ])

  const voucherBadge = (pendingVouchersResult.count ?? 0) > 0 ? pendingVouchersResult.count! : false
  const bookingBadge = (pendingBookingsResult.count ?? 0) > 0 ? pendingBookingsResult.count! : false
  const messageBadge = (unreadMessagesResult.count ?? 0) > 0 ? unreadMessagesResult.count! : false

  const navItems: NavItem[] = [
    { href: '/admin', label: 'Overview', icon: 'LayoutDashboard' },
    { href: '/admin/programs', label: 'Programs', icon: 'GraduationCap' },
    { href: '/admin/coaches', label: 'Coaches', icon: 'UserCog' },
    { href: '/admin/privates', label: 'Privates', icon: 'UserPlus', badge: bookingBadge },
    { href: '/admin/families', label: 'Families', icon: 'Users' },
    { href: '/admin/players', label: 'Players', icon: 'UserCheck' },
    { href: '/admin/payments', label: 'Payments', icon: 'CreditCard', badge: voucherBadge },
    { href: '/admin/competitions', label: 'Comps', icon: 'Swords' },
    { href: '/admin/events', label: 'Events', icon: 'CalendarDays' },
    { href: '/admin/reports', label: 'Reports', icon: 'BarChart3' },
    { href: '/admin/messages', label: 'Messages', icon: 'MessageSquare', badge: messageBadge },
    { href: '/admin/notifications', label: 'Notifications', icon: 'Bell' },
    { href: '/admin/activity', label: 'Activity', icon: 'Shield' },
  ]

  return (
    <NavWrapper items={navItems} mobileVisibleCount={4}>
      {children}
    </NavWrapper>
  )
}
