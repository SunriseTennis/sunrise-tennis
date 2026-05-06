'use client'

/**
 * Plan 22 Phase 4 — Category × Channel matrix form.
 *
 * Shared by /parent/settings and /coach/settings. Each row is one category
 * (Booking, Schedule, Reminder, ...). Each row has three toggles: 📧 Email,
 * 📱 Push, 🔔 In-app. The mandatory "Account & security" row sits at the top
 * and is locked. Optional sub-controls (e.g. session-reminder timing) render
 * nested under their category row.
 *
 * Hidden inputs name format:
 *   pref.<channel>.<category>=on|off
 * Server-side parser maps these back into prefs.{channel}.{category} JSONB.
 *
 * Form submits a single action; the server writes
 * `user_notification_preferences.prefs` (per-user) and any per-family
 * sub-controls (session_reminders timing, while it stays per-family).
 */

import { useState, type ReactNode } from 'react'
import { Bell, Mail, Smartphone, Inbox, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils/cn'

export type Channel = 'email' | 'push' | 'in_app'

export interface MatrixCategory {
  /** Stable key written to prefs JSONB. Must match a NotificationCategory. */
  key: string
  label: string
  description: string
  /** When true, the row is locked (mandatory) and shows "Always on". */
  mandatory?: boolean
  /** Default per-channel value when the user has no explicit pref. */
  defaults: Record<Channel, boolean>
  /** Optional ReactNode rendered nested under the row (e.g. timing sub-control). */
  subControl?: ReactNode
}

interface Props {
  categories: MatrixCategory[]
  /** Existing per-user prefs blob: prefs[channel][category] = bool | undefined. */
  initialPrefs: Partial<Record<Channel, Partial<Record<string, boolean>>>>
  /** Server action that accepts the FormData. */
  action: (formData: FormData) => void | Promise<void>
}

const CHANNELS: { key: Channel; label: string; Icon: typeof Bell }[] = [
  { key: 'email', label: 'Email', Icon: Mail },
  { key: 'push', label: 'Push', Icon: Smartphone },
  { key: 'in_app', label: 'In-app', Icon: Inbox },
]

export function NotificationMatrixForm({ categories, initialPrefs, action }: Props) {
  // Hydrate state from initialPrefs ?? category defaults.
  const initialState: Record<string, Record<Channel, boolean>> = {}
  for (const c of categories) {
    initialState[c.key] = {
      email: initialPrefs.email?.[c.key] ?? c.defaults.email,
      push: initialPrefs.push?.[c.key] ?? c.defaults.push,
      in_app: initialPrefs.in_app?.[c.key] ?? c.defaults.in_app,
    }
  }
  const [state, setState] = useState(initialState)

  function toggle(catKey: string, channel: Channel) {
    setState((prev) => ({
      ...prev,
      [catKey]: { ...prev[catKey], [channel]: !prev[catKey][channel] },
    }))
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="border-b border-border/60 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
            <Bell className="size-3.5 text-primary" />
          </div>
          Notifications
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose how you'd like to hear from us. Tap a column icon to toggle that channel for the row.
        </p>
      </div>

      <form action={action} className="p-5 space-y-4">
        {/* Channel header — only shown on md+; mobile users see icon-only badges per row. */}
        <div className="hidden grid-cols-[1fr_auto] gap-4 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 md:grid">
          <span>Category</span>
          <div className="grid grid-cols-3 gap-2 justify-items-center">
            {CHANNELS.map(({ key, label, Icon }) => (
              <span key={key} className="flex items-center gap-1">
                <Icon className="size-3.5" /> {label}
              </span>
            ))}
          </div>
        </div>

        <div className="divide-y divide-border/40 -mx-1">
          {categories.map((category) => {
            const row = state[category.key]
            return (
              <div key={category.key} className="px-1 py-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-center md:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{category.label}</span>
                      {category.mandatory && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                          <Lock className="size-3" /> Always on
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{category.description}</p>
                  </div>

                  {category.mandatory ? (
                    <div className="text-xs text-muted-foreground md:text-right">
                      We always send these.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 justify-items-center">
                      {CHANNELS.map(({ key, label, Icon }) => {
                        const checked = row[key]
                        return (
                          <Label
                            key={key}
                            className={cn(
                              'flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors min-w-[58px]',
                              checked
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border bg-card text-muted-foreground hover:bg-muted/30',
                            )}
                          >
                            <input
                              type="checkbox"
                              name={`pref.${key}.${category.key}`}
                              checked={checked}
                              onChange={() => toggle(category.key, key)}
                              className="sr-only"
                            />
                            <Icon className="size-4" />
                            <span className="md:hidden">{label}</span>
                          </Label>
                        )
                      })}
                    </div>
                  )}
                </div>

                {category.subControl && !category.mandatory && (
                  <div className="mt-3 rounded-lg bg-muted/20 p-3">
                    {category.subControl}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex justify-end border-t border-border/40 pt-4">
          <Button type="submit" size="sm">Save preferences</Button>
        </div>
      </form>
    </div>
  )
}
