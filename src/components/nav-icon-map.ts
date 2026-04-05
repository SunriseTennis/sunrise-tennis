import {
  LayoutDashboard,
  Users,
  UserCheck,
  GraduationCap,
  CreditCard,
  Bell,
  Swords,
  UserPlus,
  UserCog,
  Shield,
  Trophy,
  Settings,
  CalendarDays,
  Calendar,
  Clock,
  DollarSign,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const NAV_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  UserCheck,
  GraduationCap,
  CreditCard,
  Bell,
  Swords,
  UserPlus,
  UserCog,
  Shield,
  Trophy,
  Settings,
  CalendarDays,
  Calendar,
  Clock,
  DollarSign,
}

export type NavIconName = keyof typeof NAV_ICONS
