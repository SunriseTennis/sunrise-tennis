import { NavTabs } from '@/components/nav-tabs'
import {
  LayoutDashboard,
  Calendar,
  GraduationCap,
} from 'lucide-react'

const navItems = [
  { href: '/coach', label: 'Overview', icon: LayoutDashboard },
  { href: '/coach/schedule', label: 'Schedule', icon: Calendar },
  { href: '/coach/programs', label: 'Programs', icon: GraduationCap },
]

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <NavTabs items={navItems} />
      {children}
    </div>
  )
}
