'use client'

import { useState, useMemo, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, Users, Calendar, User, Check } from 'lucide-react'
import { requestPrivateBooking, requestStandingPrivate } from './actions'
import { formatTime } from '@/lib/utils/dates'
import { DurationPills } from './duration-pills'
import { AvailabilityCalendar } from './availability-calendar'
import { computeAvailableSlots } from '@/lib/utils/private-booking'
import type {
  AvailabilityWindow,
  AvailabilityException,
  BookedSession,
  TimeSlot,
} from '@/lib/utils/private-booking'

interface Player {
  id: string
  first_name: string
  last_name: string
  ball_color: string | null
}

interface Coach {
  id: string
  name: string
  is_owner: boolean
  rate_per_hour_cents: number
}

interface AllowedEntry {
  player_id: string
  coach_id: string
  auto_approve: boolean
}

interface Props {
  players: Player[]
  coaches: Coach[]
  allowedCoaches: AllowedEntry[]
  coachWindows: (AvailabilityWindow & { coach_id: string })[]
  coachExceptions: (AvailabilityException & { coach_id: string })[]
  bookedSessions: (BookedSession & { coach_id: string })[]
}

type Step = 'coach' | 'time' | 'player' | 'confirm'

export function BookingWizard({
  players,
  coaches,
  allowedCoaches,
  coachWindows,
  coachExceptions,
  bookedSessions,
}: Props) {
  const [step, setStep] = useState<Step>('coach')
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [duration, setDuration] = useState<30 | 60>(30)
  const [isStanding, setIsStanding] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Pre-filter coaches: only show coaches where at least one family player can book
  const bookableCoaches = useMemo(() => {
    return coaches.filter(coach => {
      return players.some(player => {
        const entries = allowedCoaches.filter(a => a.player_id === player.id)
        return entries.length === 0 || entries.some(a => a.coach_id === coach.id)
      })
    })
  }, [coaches, players, allowedCoaches])

  // Compute available slots client-side for the selected coach
  const availableSlots = useMemo(() => {
    if (!selectedCoach) return []
    const today = new Date()
    const threeWeeks = new Date()
    threeWeeks.setDate(today.getDate() + 21)
    const startDate = today.toISOString().split('T')[0]
    const endDate = threeWeeks.toISOString().split('T')[0]

    return computeAvailableSlots(
      coachWindows.filter(w => w.coach_id === selectedCoach.id),
      coachExceptions.filter(e => e.coach_id === selectedCoach.id),
      bookedSessions.filter(s => s.coach_id === selectedCoach.id),
      startDate,
      endDate,
    )
  }, [selectedCoach, coachWindows, coachExceptions, bookedSessions])

  // For 60min: filter to slots where a consecutive pair exists
  const displaySlots = useMemo(() => {
    if (duration === 30) return availableSlots
    return availableSlots.filter((slot, i) => {
      const next = availableSlots[i + 1]
      if (!next || next.date !== slot.date) return false
      return timeToMinutes(next.startTime) === timeToMinutes(slot.startTime) + 30
    })
  }, [availableSlots, duration])

  // Group display slots by date
  const slotsByDate = useMemo(() => {
    const map = new Map<string, TimeSlot[]>()
    for (const slot of displaySlots) {
      const existing = map.get(slot.date) ?? []
      existing.push(slot)
      map.set(slot.date, existing)
    }
    return map
  }, [displaySlots])

  // Filter players who can book with the selected coach
  const eligiblePlayers = useMemo(() => {
    if (!selectedCoach) return []
    return players.filter(player => {
      const entries = allowedCoaches.filter(a => a.player_id === player.id)
      return entries.length === 0 || entries.some(a => a.coach_id === selectedCoach.id)
    })
  }, [players, allowedCoaches, selectedCoach])

  const handleSelectCoach = (coach: Coach) => {
    setSelectedCoach(coach)
    setSelectedSlot(null)
    setSelectedPlayer(null)
    setStep('time')
  }

  const handleSelectSlot = (slot: TimeSlot) => {
    setSelectedSlot(slot)
    // Auto-skip player step if only one eligible player
    if (eligiblePlayers.length === 1) {
      setSelectedPlayer(eligiblePlayers[0])
      setStep('confirm')
    } else {
      setStep('player')
    }
  }

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayer(player)
    setStep('confirm')
  }

  const handleCoachChangeOnCalendar = (coachId: string) => {
    const coach = coaches.find(c => c.id === coachId)
    if (coach) {
      setSelectedCoach(coach)
      setSelectedSlot(null)
      setSelectedPlayer(null)
    }
  }

  const handleBack = () => {
    if (step === 'time') { setStep('coach'); setSelectedSlot(null); setSelectedPlayer(null) }
    else if (step === 'player') setStep('time')
    else if (step === 'confirm') {
      if (eligiblePlayers.length === 1) setStep('time')
      else setStep('player')
    }
  }

  const priceCents = selectedCoach
    ? Math.round((selectedCoach.rate_per_hour_cents * duration) / 60)
    : 0

  return (
    <Card className="overflow-hidden rounded-xl shadow-card">
      <CardContent className="p-0">
        {/* Step indicator */}
        <div className="flex items-center gap-1 border-b border-border px-4 py-3">
          <StepPill label="Coach" active={step === 'coach'} done={!!selectedCoach && step !== 'coach'} icon={Users} />
          <ChevronRight className="size-3 text-muted-foreground" />
          <StepPill label="Time" active={step === 'time'} done={!!selectedSlot && step !== 'time'} icon={Calendar} />
          <ChevronRight className="size-3 text-muted-foreground" />
          <StepPill label="Player" active={step === 'player'} done={!!selectedPlayer && step !== 'player'} icon={User} />
          <ChevronRight className="size-3 text-muted-foreground" />
          <StepPill label="Confirm" active={step === 'confirm'} done={false} icon={Check} />
        </div>

        <div className="p-4">
          {/* Step 1: Select Coach */}
          {step === 'coach' && (
            <div>
              <h3 className="text-sm font-semibold text-foreground">Choose a coach</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {bookableCoaches.map((coach) => (
                  <button
                    key={coach.id}
                    onClick={() => handleSelectCoach(coach)}
                    className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <p className="text-sm font-medium">{coach.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      From ${(coach.rate_per_hour_cents / 200).toFixed(0)}/30min
                    </p>
                  </button>
                ))}
                {bookableCoaches.length === 0 && (
                  <p className="text-sm text-muted-foreground">No coaches available</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Select Time */}
          {step === 'time' && selectedCoach && (
            <div>
              <button onClick={handleBack} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-3" /> Back
              </button>

              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Pick a time
                </h3>
                <DurationPills
                  duration={duration}
                  onChange={(d) => { setDuration(d); setSelectedSlot(null) }}
                  hourlyRateCents={selectedCoach.rate_per_hour_cents}
                />
              </div>

              {/* Availability Calendar */}
              <div className="mt-4">
                <AvailabilityCalendar
                  coaches={bookableCoaches}
                  selectedCoachId={selectedCoach.id}
                  onCoachChange={handleCoachChangeOnCalendar}
                  coachWindows={coachWindows}
                  coachExceptions={coachExceptions}
                  bookedSessions={bookedSessions}
                  duration={duration}
                  onSlotSelect={handleSelectSlot}
                />
              </div>

              {/* Slot list below calendar */}
              <div className="mt-4">
                <h4 className="text-xs font-medium text-muted-foreground">Available times</h4>
                {displaySlots.length === 0 ? (
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    No available slots in the next 3 weeks
                  </p>
                ) : (
                  <div className="mt-2 max-h-[300px] space-y-3 overflow-y-auto">
                    {Array.from(slotsByDate.entries()).map(([date, daySlots]) => {
                      const dateObj = new Date(date + 'T12:00:00')
                      const dayName = dateObj.toLocaleDateString('en-AU', { weekday: 'short' })
                      const dateStr = dateObj.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

                      return (
                        <div key={date}>
                          <p className="text-xs font-medium text-muted-foreground">
                            {dayName} {dateStr}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {daySlots.map((slot) => (
                              <button
                                key={`${slot.date}-${slot.startTime}`}
                                onClick={() => handleSelectSlot(slot)}
                                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                  selectedSlot?.date === slot.date && selectedSlot?.startTime === slot.startTime
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border hover:border-primary hover:bg-primary/5 hover:text-primary'
                                }`}
                              >
                                {formatTime(slot.startTime)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Select Player */}
          {step === 'player' && selectedCoach && selectedSlot && (
            <div>
              <button onClick={handleBack} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-3" /> Back
              </button>
              <h3 className="text-sm font-semibold text-foreground">
                Who is this lesson for?
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {eligiblePlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => handleSelectPlayer(player)}
                    className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <p className="text-sm font-medium">{player.first_name} {player.last_name}</p>
                    {player.ball_color && (
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">{player.ball_color} ball</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && selectedCoach && selectedSlot && selectedPlayer && (
            <div>
              <button onClick={handleBack} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-3" /> Back
              </button>
              <h3 className="text-sm font-semibold text-foreground">Confirm your booking</h3>

              <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Coach</span>
                  <span className="font-medium">{selectedCoach.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">
                    {new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium">
                    {formatTime(selectedSlot.startTime)} – {formatTime(minutesToTime(timeToMinutes(selectedSlot.startTime) + duration))}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{duration} minutes</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Player</span>
                  <span className="font-medium">{selectedPlayer.first_name} {selectedPlayer.last_name}</span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Price</span>
                    <span>${(priceCents / 100).toFixed(2)} (incl. GST)</span>
                  </div>
                </div>
              </div>

              <label className="mt-4 flex items-center gap-2 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={isStanding}
                  onChange={(e) => setIsStanding(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                <div>
                  <span className="text-sm font-medium">Make this a weekly booking</span>
                  <p className="text-xs text-muted-foreground">
                    Books this slot every week for the rest of the term
                  </p>
                </div>
              </label>

              <form action={isStanding ? requestStandingPrivate : requestPrivateBooking} className="mt-4">
                <input type="hidden" name="player_id" value={selectedPlayer.id} />
                <input type="hidden" name="coach_id" value={selectedCoach.id} />
                <input type="hidden" name="date" value={selectedSlot.date} />
                <input type="hidden" name="start_time" value={selectedSlot.startTime} />
                <input type="hidden" name="duration_minutes" value={duration} />
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? 'Submitting...' : isStanding ? 'Book Weekly' : 'Request Booking'}
                </Button>
              </form>

              <p className="mt-2 text-center text-xs text-muted-foreground">
                {isPlayerAutoApproved(selectedPlayer.id, selectedCoach.id, allowedCoaches)
                  ? 'This booking will be confirmed immediately'
                  : 'Your coach will confirm within 24 hours'}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function StepPill({ label, active, done, icon: Icon }: { label: string; active: boolean; done: boolean; icon: React.ElementType }) {
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
      active ? 'bg-primary/10 text-primary' : done ? 'text-foreground' : 'text-muted-foreground'
    }`}>
      <Icon className="size-3" />
      {label}
    </span>
  )
}

function isPlayerAutoApproved(playerId: string, coachId: string, allowed: { player_id: string; coach_id: string; auto_approve: boolean }[]): boolean {
  const entry = allowed.find(a => a.player_id === playerId && a.coach_id === coachId)
  return entry?.auto_approve ?? false
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
