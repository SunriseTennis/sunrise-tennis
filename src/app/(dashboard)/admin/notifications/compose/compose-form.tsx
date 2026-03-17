'use client'

import { useState } from 'react'
import { sendNotification } from '../actions'

const NOTIFICATION_TYPES = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'rain_cancel', label: 'Rain Cancellation' },
  { value: 'tournament_open', label: 'Tournament Open' },
  { value: 'payment_reminder', label: 'Payment Reminder' },
  { value: 'availability_check', label: 'Availability Check' },
]

const LEVELS = ['red', 'orange', 'green', 'yellow', 'blue', 'competitive']

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
        <label htmlFor="type" className="block text-sm font-medium text-gray-700">
          Notification Type
        </label>
        <select
          id="type"
          name="type"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          {NOTIFICATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="target_type" className="block text-sm font-medium text-gray-700">
          Target Audience
        </label>
        <select
          id="target_type"
          name="target_type"
          required
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
          <label htmlFor="target_id" className="block text-sm font-medium text-gray-700">
            Program
          </label>
          <select
            id="target_id"
            name="target_id"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
          <label htmlFor="target_level" className="block text-sm font-medium text-gray-700">
            Ball Level
          </label>
          <select
            id="target_level"
            name="target_level"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
          <label htmlFor="target_id" className="block text-sm font-medium text-gray-700">
            Team
          </label>
          <select
            id="target_id"
            name="target_id"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
          <label htmlFor="target_id" className="block text-sm font-medium text-gray-700">
            Family
          </label>
          <select
            id="target_id"
            name="target_id"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">Select family...</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>{f.display_id} - {f.family_name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={100}
          placeholder="e.g. Rain cancellation - Tuesday sessions"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      <div>
        <label htmlFor="body" className="block text-sm font-medium text-gray-700">
          Message
        </label>
        <textarea
          id="body"
          name="body"
          rows={3}
          placeholder="Notification details..."
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      <div>
        <label htmlFor="url" className="block text-sm font-medium text-gray-700">
          Link URL <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="url"
          name="url"
          type="text"
          placeholder="/parent/programs"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <p className="mt-1 text-xs text-gray-500">Page to open when notification is tapped.</p>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-orange-600 px-6 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send Notification'}
        </button>
      </div>
    </form>
  )
}
