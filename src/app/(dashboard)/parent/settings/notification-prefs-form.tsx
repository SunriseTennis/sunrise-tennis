'use client'

/**
 * Plan 22 Phase 4.1 — Parent settings notification matrix.
 *
 * Replaces the previous 2-toggle form (session_reminders 4-way + pre_charge
 * heads-up boolean) with a category × channel matrix. The Reminder row keeps
 * the legacy session_reminders timing dropdown as a nested sub-control,
 * because the cron handler still reads it per-family.
 */

import { Label } from '@/components/ui/label'
import {
  NotificationMatrixForm,
  type Channel,
  type MatrixCategory,
} from '@/components/settings/notification-matrix-form'
import { updateNotificationPreferences } from '../actions'

interface Props {
  /** Existing user_notification_preferences.prefs blob. */
  initialPrefs: Partial<Record<Channel, Partial<Record<string, boolean>>>>
  /** Per-family timing for the Reminder sub-control (4-way radio). */
  sessionReminderTiming: 'all' | 'first_week_and_privates' | 'privates_only' | 'off'
}

const TIMING_OPTIONS = [
  { value: 'all', label: 'All sessions' },
  { value: 'first_week_and_privates', label: 'First week + privates' },
  { value: 'privates_only', label: 'Privates only' },
  { value: 'off', label: 'No reminders' },
] as const

export function NotificationPrefsForm({ initialPrefs, sessionReminderTiming }: Props) {
  const reminderSubControl = (
    <div>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Session reminders timing
      </Label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        When the evening-before reminder fires (only matters if reminders are turned on above).
      </p>
      <select
        name="session_reminders"
        defaultValue={sessionReminderTiming}
        className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        {TIMING_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )

  const categories: MatrixCategory[] = [
    {
      key: 'account',
      label: 'Account & security',
      description: 'Approval status, account-state changes, password resets, login alerts.',
      mandatory: true,
      defaults: { email: true, push: true, in_app: true },
    },
    {
      key: 'booking',
      label: 'Bookings',
      description: 'Enrolment confirmations, private bookings.',
      defaults: { email: true, push: true, in_app: true },
    },
    {
      key: 'schedule',
      label: 'Schedule changes',
      description: 'Cancellations, rain-outs, partner changes.',
      defaults: { email: true, push: true, in_app: true },
    },
    {
      key: 'reminder',
      label: 'Reminders',
      description: 'Pre-charge heads-up, session reminders.',
      defaults: { email: false, push: true, in_app: true },
      subControl: reminderSubControl,
    },
    {
      key: 'availability',
      label: 'Slot availability',
      description: 'Private slot freed up.',
      defaults: { email: false, push: true, in_app: true },
    },
    {
      key: 'marketing',
      label: 'News & promotions',
      description: 'Term updates, special offers (rare).',
      defaults: { email: false, push: false, in_app: false },
    },
  ]

  return (
    <NotificationMatrixForm
      categories={categories}
      initialPrefs={initialPrefs}
      action={updateNotificationPreferences}
    />
  )
}
