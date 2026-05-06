'use client'

/**
 * Plan 22 Phase 4.2 — Coach settings notification matrix.
 *
 * Coach-relevant categories: account (mandatory), booking, schedule,
 * reminder, coach. Same matrix shape as parent — different category set.
 */

import {
  NotificationMatrixForm,
  type Channel,
  type MatrixCategory,
} from '@/components/settings/notification-matrix-form'
import { updateCoachNotificationPreferences } from '../actions'

interface Props {
  initialPrefs: Partial<Record<Channel, Partial<Record<string, boolean>>>>
}

export function CoachNotificationPrefsForm({ initialPrefs }: Props) {
  // Account & security category is intentionally NOT rendered — the dispatcher
  // forces those rules through (MANDATORY_CATEGORIES) regardless of prefs, and
  // showing a locked "Always on" row added noise without giving coaches
  // anything to do.
  const categories: MatrixCategory[] = [
    {
      key: 'booking',
      label: 'New booking requests',
      description: 'Parent requests for private lessons with you.',
      defaults: { email: false, push: true, in_app: true },
    },
    {
      key: 'schedule',
      label: 'Schedule changes',
      description: 'Cancellations, rain-outs, partner changes affecting you.',
      defaults: { email: false, push: true, in_app: true },
    },
    {
      key: 'reminder',
      label: 'Reminders',
      description: 'Daily session digest and other operational reminders.',
      defaults: { email: false, push: true, in_app: true },
    },
    {
      key: 'coach',
      label: 'Coach operations',
      description: 'Player marked away, late cancellations, ops alerts.',
      defaults: { email: false, push: true, in_app: true },
    },
  ]

  return (
    <NotificationMatrixForm
      categories={categories}
      initialPrefs={initialPrefs}
      action={updateCoachNotificationPreferences}
    />
  )
}
