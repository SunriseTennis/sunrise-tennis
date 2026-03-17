'use client'

import { useState } from 'react'
import { sendNotification } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const NOTIFICATION_TYPES = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'rain_cancel', label: 'Rain Cancellation' },
  { value: 'tournament_open', label: 'Tournament Open' },
  { value: 'payment_reminder', label: 'Payment Reminder' },
  { value: 'availability_check', label: 'Availability Check' },
]

const LEVELS = ['red', 'orange', 'green', 'yellow', 'blue', 'competitive']

const selectClass = 'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

interface Props {
  programs: { id: string; name: string }[]
  teams: { id: string; name: string }[]
  families: { id: string; family_name: string; display_id: string }[]
}

export function ComposeNotificationForm({ programs, teams, families }: Props) {
  const [targetType, setTargetType] = useState('all')
  const [sending, setSending] = useState(false)

  async function handleSubmit(formData: FormData) {
    setSending(true)
    try {
      await sendNotification(formData)
    } finally {
      setSending(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="type">
          Notification Type
        </Label>
        <select
          id="type"
          name="type"
          required
          className={selectClass}
        >
          {NOTIFICATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="target_type">
          Target Audience
        </Label>
        <select
          id="target_type"
          name="target_type"
          required
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          className={selectClass}
        >
          <option value="all">All Users</option>
          <option value="program">Program</option>
          <option value="level">Level</option>
          <option value="team">Team</option>
          <option value="family">Specific Family</option>
        </select>
      </div>

      {targetType === 'program' && (
        <div>
          <Label htmlFor="target_id">
            Program
          </Label>
          <select
            id="target_id"
            name="target_id"
            required
            className={selectClass}
          >
            <option value="">Select program...</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {targetType === 'level' && (
        <div>
          <Label htmlFor="target_level">
            Ball Level
          </Label>
          <select
            id="target_level"
            name="target_level"
            required
            className={selectClass}
          >
            <option value="">Select level...</option>
            {LEVELS.map((l) => (
              <option key={l} value={l} className="capitalize">{l}</option>
            ))}
          </select>
        </div>
      )}

      {targetType === 'team' && (
        <div>
          <Label htmlFor="target_id">
            Team
          </Label>
          <select
            id="target_id"
            name="target_id"
            required
            className={selectClass}
          >
            <option value="">Select team...</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {targetType === 'family' && (
        <div>
          <Label htmlFor="target_id">
            Family
          </Label>
          <select
            id="target_id"
            name="target_id"
            required
            className={selectClass}
          >
            <option value="">Select family...</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>{f.display_id} - {f.family_name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label htmlFor="title">
          Title
        </Label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          maxLength={100}
          placeholder="e.g. Rain cancellation - Tuesday sessions"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="body">
          Message
        </Label>
        <Textarea
          id="body"
          name="body"
          rows={3}
          placeholder="Notification details..."
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="url">
          Link URL <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="url"
          name="url"
          type="text"
          placeholder="/parent/programs"
          className="mt-1"
        />
        <p className="mt-1 text-xs text-muted-foreground">Page to open when notification is tapped.</p>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={sending}
        >
          {sending ? 'Sending...' : 'Send Notification'}
        </Button>
      </div>
    </form>
  )
}
