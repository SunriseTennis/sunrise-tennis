import { createClient, getSessionUser } from '@/lib/supabase/server'
import { NavWrapper } from '@/components/nav-wrapper'
import type { NavItem } from '@/components/nav-wrapper'

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = await getSessionUser()

  let privatesBadge: number | boolean = false
  let messagesBadge: number | boolean = false

  if (user) {
    // Get coach_id for this user
    const { data: role } = await supabase
      .from('user_roles')
      .select('coach_id')
      .eq('user_id', user.id)
      .eq('role', 'coach')
      .single()

    if (role?.coach_id) {
      const [bookingsResult, messagesResult] = await Promise.all([
        // Pending private booking requests for this coach
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', role.coach_id)
          .eq('status', 'pending'),
        // Unread messages for this coach
        // @ts-expect-error messages table pending migration
        supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_role', 'coach')
          .eq('recipient_id', user.id)
          .is('read_at', null),
      ])

      if (bookingsResult.count && bookingsResult.count > 0) privatesBadge = bookingsResult.count
      messagesBadge = (messagesResult.count ?? 0) > 0 ? messagesResult.count! : false
    }
  }

  const navItems: NavItem[] = [
    { href: '/coach', label: 'Overview', icon: 'LayoutDashboard' },
    { href: '/coach/schedule', label: 'Schedule', icon: 'Calendar' },
    { href: '/coach/availability', label: 'Availability', icon: 'Clock' },
    { href: '/coach/privates', label: 'Privates', icon: 'Users', badge: privatesBadge },
    { href: '/coach/messages', label: 'Messages', icon: 'MessageSquare', badge: messagesBadge },
    { href: '/coach/earnings', label: 'Earnings', icon: 'DollarSign' },
  ]

  return (
    <NavWrapper items={navItems} mobileVisibleCount={5}>
      {children}
    </NavWrapper>
  )
}
