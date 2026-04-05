import { createClient } from '@/lib/supabase/server'
import { NavWrapper } from '@/components/nav-wrapper'
import type { NavItem } from '@/components/nav-wrapper'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // Query admin badge counts in parallel
  const [pendingVouchersResult, pendingBookingsResult] = await Promise.all([
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
  ])

  const voucherBadge = (pendingVouchersResult.count ?? 0) > 0 ? pendingVouchersResult.count! : false
  const bookingBadge = (pendingBookingsResult.count ?? 0) > 0 ? pendingBookingsResult.count! : false

  const navItems: NavItem[] = [
    { href: '/admin', label: 'Overview', icon: 'LayoutDashboard' },
    { href: '/admin/programs', label: 'Programs', icon: 'GraduationCap' },
    { href: '/admin/coaches', label: 'Coaches', icon: 'UserCog' },
    { href: '/admin/privates', label: 'Privates', icon: 'UserPlus', badge: bookingBadge },
    { href: '/admin/families', label: 'Families', icon: 'Users' },
    { href: '/admin/players', label: 'Players', icon: 'UserCheck' },
    { href: '/admin/payments', label: 'Payments', icon: 'CreditCard', badge: voucherBadge },
    { href: '/admin/competitions', label: 'Comps', icon: 'Swords' },
    { href: '/admin/notifications', label: 'Notifications', icon: 'Bell' },
    { href: '/admin/activity', label: 'Activity', icon: 'Shield' },
  ]

  return (
    <NavWrapper items={navItems} mobileVisibleCount={4}>
      {children}
    </NavWrapper>
  )
}
