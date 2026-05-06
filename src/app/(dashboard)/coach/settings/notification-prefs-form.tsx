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
  const categories: MatrixCategory[] = [
    {
      key: 'account',
      label: 'Account & security',
      description: 'Account-state changes, password resets, login alerts.',
      mandatory: true,
      defaults: { email: true, push: true, in_app: true },
    },
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
