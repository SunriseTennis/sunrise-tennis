import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { ImageHero } from '@/components/image-hero'
import { EmptyState } from '@/components/empty-state'
import { CalendarDays, MapPin, ExternalLink } from 'lucide-react'

const EVENT_TYPE_LABELS: Record<string, string> = {
  social: 'Social',
  internal_tournament: 'Internal Tournament',
  external_tournament: 'External Tournament',
}

const EVENT_TYPE_STYLES: Record<string, { badge: string; bar: string }> = {
  social: {
    badge: 'bg-warning-light text-warning border-warning/20',
    bar: 'bg-gradient-to-b from-[#F5B041] to-[#F7CD5D]',
  },
  internal_tournament: {
    badge: 'bg-[#E87450]/10 text-[#E87450] border-[#E87450]/20',
    bar: 'bg-gradient-to-b from-[#E87450] to-[#F5B041]',
  },
  external_tournament: {
    badge: 'bg-[#8B78B0]/10 text-[#8B78B0] border-[#8B78B0]/20',
    bar: 'bg-gradient-to-b from-[#8B78B0] to-[#6480A4]',
  },
}

function formatEventDate(startDate: string, endDate: string | null, allDay: boolean, startTime: string | null, endTime: string | null): string {
  const start = new Date(startDate + 'T00:00:00')
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const dayStr = `${DAYS[start.getDay()]}, ${start.getDate()} ${MONTHS[start.getMonth()]}`

  if (endDate && endDate !== startDate) {
    const end = new Date(endDate + 'T00:00:00')
    const endStr = `${end.getDate()} ${MONTHS[end.getMonth()]}`
    return `${dayStr} - ${endStr}`
  }

  if (!allDay && startTime && endTime) {
    const fmtTime = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      const ampm = h >= 12 ? 'pm' : 'am'
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      return m > 0 ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`
    }
    return `${dayStr} · ${fmtTime(startTime)} - ${fmtTime(endTime)}`
  }

  return allDay ? `${dayStr} · All day` : dayStr
}

export default async function ParentEventsPage() {
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]

  const { data: events } = await supabase
    .from('club_events')
    .select('*')
    .gte('start_date', today)
    .in('status', ['upcoming', 'in_progress'])
    .order('start_date', { ascending: true })
    .limit(50)

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <ImageHero>
        <div>
          <p className="text-sm font-medium text-white/80">Community</p>
          <h1 className="text-2xl font-bold">Club Events</h1>
          <p className="mt-0.5 text-sm text-white/70">Tournaments, socials, and community days</p>
        </div>
      </ImageHero>

      {events && events.length > 0 ? (
        <div className="space-y-3">
          {events.map((event, i) => {
            const styles = EVENT_TYPE_STYLES[event.event_type] ?? {
              badge: 'bg-muted text-muted-foreground border-border',
              bar: 'bg-gradient-to-b from-primary to-secondary',
            }
            return (
              <div
                key={event.id}
                className="animate-fade-up group flex overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all hover:shadow-elevated hover:scale-[1.01]"
                style={{ animationDelay: `${(i + 1) * 60}ms` }}
              >
                <div className={`w-1 shrink-0 ${styles.bar}`} />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{event.title}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles.badge}`}>
                          {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatEventDate(event.start_date, event.end_date, event.all_day, event.start_time, event.end_time)}
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
                    </div>
                    {event.external_url && (
                      <a
                        href={event.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary transition-colors hover:bg-primary/20"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <EmptyState
            icon={CalendarDays}
            illustration="/images/illustrations/calendar-sunny.svg"
            title="No upcoming events"
            description="Events for the term will appear here — watch this space!"
          />
        </div>
      )}
    </div>
  )
}
