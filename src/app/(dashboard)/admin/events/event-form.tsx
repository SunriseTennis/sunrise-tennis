'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createEvent, updateEvent } from './actions'

interface EventData {
  id: string
  title: string
  description: string | null
  event_type: string
  location: string | null
  start_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  all_day: boolean
  external_url: string | null
  status: string
}

interface EventFormProps {
  event?: EventData
  onClose: () => void
}

export function EventForm({ event, onClose }: EventFormProps) {
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const isEdit = !!event

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-elevated animate-fade-up max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-foreground">{isEdit ? 'Edit Event' : 'Create Event'}</h2>

        <form action={isEdit ? updateEvent : createEvent} className="mt-4 space-y-4">
          {isEdit && <input type="hidden" name="id" value={event.id} />}

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-foreground">Title</label>
            <input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={event?.title ?? ''}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="End of Term Social"
            />
          </div>

          {/* Event Type */}
          <div>
            <label htmlFor="event_type" className="block text-sm font-medium text-foreground">Type</label>
            <select
              id="event_type"
              name="event_type"
              defaultValue={event?.event_type ?? 'social'}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="social">Social</option>
              <option value="internal_tournament">Internal Tournament</option>
              <option value="external_tournament">External Tournament</option>
            </select>
          </div>

          {/* Status (edit only) */}
          {isEdit && (
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-foreground">Status</label>
              <select
                id="status"
                name="status"
                defaultValue={event?.status ?? 'upcoming'}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="upcoming">Upcoming</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}

          {/* Location */}
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-foreground">Location</label>
            <input
              id="location"
              name="location"
              type="text"
              defaultValue={event?.location ?? 'Somerton Park Tennis Club'}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="start_date" className="block text-sm font-medium text-foreground">Start Date</label>
              <input
                id="start_date"
                name="start_date"
                type="date"
                required
                defaultValue={event?.start_date ?? ''}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="end_date" className="block text-sm font-medium text-foreground">End Date</label>
              <input
                id="end_date"
                name="end_date"
                type="date"
                defaultValue={event?.end_date ?? ''}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* All Day Toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="all_day"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="size-4 rounded border-border"
            />
            <span className="text-foreground">All day event</span>
          </label>

          {/* Times (hidden if all day) */}
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="start_time" className="block text-sm font-medium text-foreground">Start Time</label>
                <input
                  id="start_time"
                  name="start_time"
                  type="time"
                  defaultValue={event?.start_time ?? ''}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="end_time" className="block text-sm font-medium text-foreground">End Time</label>
                <input
                  id="end_time"
                  name="end_time"
                  type="time"
                  defaultValue={event?.end_time ?? ''}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-foreground">Description</label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={event?.description ?? ''}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              placeholder="Tell families what to expect..."
            />
          </div>

          {/* External URL */}
          <div>
            <label htmlFor="external_url" className="block text-sm font-medium text-foreground">External Link</label>
            <input
              id="external_url"
              name="external_url"
              type="url"
              defaultValue={event?.external_url ?? ''}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="https://..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">{isEdit ? 'Save Changes' : 'Create Event'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
