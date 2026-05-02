'use client'

import { updateCoachNotificationPreferences } from '../actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Bell } from 'lucide-react'

const TOGGLES = [
  {
    key: 'booking_requests',
    label: 'New booking requests',
    description: 'Get notified when a parent requests a private lesson with you.',
    defaultOn: true,
  },
  {
    key: 'daily_session_digest',
    label: 'Daily session digest',
    description: 'Morning push summarising your sessions for the day.',
    defaultOn: true,
  },
  {
    key: 'late_cancellations',
    label: 'Late cancellations',
    description: 'Notify me when a session is cancelled inside the cutoff window.',
    defaultOn: true,
  },
] as const

export function CoachNotificationPrefsForm({
  prefs,
}: {
  prefs: Record<string, boolean>
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="border-b border-border/60 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
            <Bell className="size-3.5 text-primary" />
          </div>
          Notifications
        </h2>
      </div>

      <form action={updateCoachNotificationPreferences} className="p-5 space-y-3">
        {TOGGLES.map(t => {
          const checked = prefs[t.key] ?? t.defaultOn
          return (
            <Label
              key={t.key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/30 has-[:checked]:border-primary/30 has-[:checked]:bg-primary/5"
            >
              <input
                type="checkbox"
                name={t.key}
                defaultChecked={checked}
                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
              />
              <div>
                <span className="text-sm font-medium text-foreground">{t.label}</span>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
            </Label>
          )
        })}

        <div className="flex justify-end border-t border-border/40 pt-4">
          <Button type="submit" size="sm">Save preferences</Button>
        </div>
      </form>
    </div>
  )
}
