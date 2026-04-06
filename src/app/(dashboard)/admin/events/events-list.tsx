'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { CalendarDays, Edit2, Trash2, MapPin, ExternalLink } from 'lucide-react'
import { EventForm } from './event-form'
import { deleteEvent } from './actions'

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
  created_at: string
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  social: 'Social',
  internal_tournament: 'Club Tournament',
  external_tournament: 'External Tournament',
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  social: 'bg-[#2B5EA7]/10 text-[#2B5EA7]',
  internal_tournament: 'bg-[#E87450]/10 text-[#E87450]',
  external_tournament: 'bg-[#8B78B0]/10 text-[#8B78B0]',
}

const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-primary/10 text-primary',
  in_progress: 'bg-success-light text-success',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-danger/10 text-danger',
}

function formatDate(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m > 0 ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`
}

interface EventsListProps {
  events: EventData[]
}

export function EventsList({ events }: EventsListProps) {
  const [editingEvent, setEditingEvent] = useState<EventData | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all')

  const filtered = filter === 'all' ? events : events.filter((e) => e.status === filter)

  return (
    <>
      {/* Filter pills */}
      <div className="mt-4 flex items-center gap-2">
        {(['all', 'upcoming', 'completed', 'cancelled'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="flex-1" />
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <CalendarDays className="size-4" />
          New Event
        </Button>
      </div>

      {/* Events list */}
      {filtered.length > 0 ? (
        <div className="mt-4 space-y-3">
          {filtered.map((event, i) => (
            <div
              key={event.id}
              className="rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:shadow-elevated animate-fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{event.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${EVENT_TYPE_COLORS[event.event_type] ?? 'bg-muted text-muted-foreground'}`}>
                      {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
                    </span>
                    <Badge variant="secondary" className={STATUS_COLORS[event.status]}>
                      {event.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(event.start_date)}
                    {event.end_date && event.end_date !== event.start_date && ` - ${formatDate(event.end_date)}`}
                    {event.all_day ? ' · All day' : ''}
                    {!event.all_day && event.start_time && ` · ${formatTime(event.start_time)}`}
                    {!event.all_day && event.end_time && ` - ${formatTime(event.end_time)}`}
                  </p>

                  {event.location && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" />
                      {event.location}
                    </p>
                  )}

                  {event.description && (
                    <p className="mt-2 text-sm text-muted-foreground/80 line-clamp-2">{event.description}</p>
                  )}

                  {event.external_url && (
                    <a
                      href={event.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      External link
                    </a>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button size="icon-xs" variant="ghost" onClick={() => setEditingEvent(event)}>
                    <Edit2 className="size-3.5" />
                  </Button>
                  <form action={deleteEvent}>
                    <input type="hidden" name="id" value={event.id} />
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      type="submit"
                      className="text-muted-foreground hover:text-danger"
                      onClick={(e) => {
                        if (!confirm(`Delete "${event.title}"?`)) e.preventDefault()
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={CalendarDays}
            title="No events"
            description={filter === 'all' ? 'Create your first club event.' : `No ${filter} events.`}
            action={
              filter === 'all' ? (
                <Button size="sm" onClick={() => setShowCreate(true)}>Create Event</Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Create modal */}
      {showCreate && <EventForm onClose={() => setShowCreate(false)} />}

      {/* Edit modal */}
      {editingEvent && <EventForm event={editingEvent} onClose={() => setEditingEvent(null)} />}
    </>
  )
}
