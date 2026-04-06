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
  BarChart3,
  MessageSquare,
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
  BarChart3,
  MessageSquare,
}

export type NavIconName = keyof typeof NAV_ICONS
