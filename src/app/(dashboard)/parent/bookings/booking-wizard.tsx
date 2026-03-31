'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, User, Users, Calendar, Clock, Check } from 'lucide-react'
import { requestPrivateBooking, requestStandingPrivate, fetchAvailableSlots } from './actions'
import { formatTime } from '@/lib/utils/dates'

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

interface TimeSlot {
  date: string
  startTime: string
  endTime: string
}

interface Props {
  players: Player[]
  coaches: Coach[]
  allowedCoaches: AllowedEntry[]
}

type Step = 'player' | 'coach' | 'slot' | 'confirm'

export function BookingWizard({ players, coaches, allowedCoaches }: Props) {
  const [step, setStep] = useState<Step>('player')
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [duration, setDuration] = useState(30)
  const [isStanding, setIsStanding] = useState(false)
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Filter coaches by player's allowlist
  const availableCoaches = selectedPlayer
    ? (() => {
        const playerAllowlist = allowedCoaches.filter(a => a.player_id === selectedPlayer.id)
        if (playerAllowlist.length === 0) return coaches // No restrictions
        const allowedIds = new Set(playerAllowlist.map(a => a.coach_id))
        return coaches.filter(c => allowedIds.has(c.id))
      })()
    : []

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayer(player)
    setSelectedCoach(null)
    setSelectedSlot(null)
    setStep('coach')
  }

  const handleSelectCoach = async (coach: Coach) => {
    setSelectedCoach(coach)
    setSelectedSlot(null)
    setLoadingSlots(true)
    setStep('slot')

    try {
      const availableSlots = await fetchAvailableSlots(coach.id)
      setSlots(availableSlots)
    } catch {
      setSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }

  const handleSelectSlot = (slot: TimeSlot) => {
    setSelectedSlot(slot)
    setStep('confirm')
  }

  const handleBack = () => {
    if (step === 'coach') setStep('player')
    else if (step === 'slot') setStep('coach')
    else if (step === 'confirm') setStep('slot')
  }

  const priceCents = selectedCoach
    ? Math.round((selectedCoach.rate_per_hour_cents * duration) / 60)
    : 0

  // Group slots by date
  const slotsByDate = new Map<string, TimeSlot[]>()
  for (const slot of slots) {
    const existing = slotsByDate.get(slot.date) ?? []
    existing.push(slot)
    slotsByDate.set(slot.date, existing)
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Step indicator */}
        <div className="flex items-center gap-1 border-b border-border px-4 py-3">
          <StepPill label="Player" active={step === 'player'} done={!!selectedPlayer && step !== 'player'} icon={User} />
          <ChevronRight className="size-3 text-muted-foreground" />
          <StepPill label="Coach" active={step === 'coach'} done={!!selectedCoach && step !== 'coach'} icon={Users} />
          <ChevronRight className="size-3 text-muted-foreground" />
          <StepPill label="Time" active={step === 'slot'} done={!!selectedSlot && step !== 'slot'} icon={Calendar} />
          <ChevronRight className="size-3 text-muted-foreground" />
          <StepPill label="Confirm" active={step === 'confirm'} done={false} icon={Check} />
        </div>

        <div className="p-4">
          {/* Step 1: Select Player */}
          {step === 'player' && (
            <div>
              <h3 className="text-sm font-semibold text-foreground">Who is this lesson for?</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {players.map((player) => (
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

          {/* Step 2: Select Coach */}
          {step === 'coach' && (
            <div>
              <button onClick={handleBack} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-3" /> Back
              </button>
              <h3 className="text-sm font-semibold text-foreground">
                Choose a coach for {selectedPlayer?.first_name}
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {availableCoaches.map((coach) => (
                  <button
                    key={coach.id}
                    onClick={() => handleSelectCoach(coach)}
                    className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <p className="text-sm font-medium">{coach.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      ${(coach.rate_per_hour_cents / 100).toFixed(0)}/hr
                      {' · '}
                      ${(coach.rate_per_hour_cents / 200).toFixed(0)}/30min
                    </p>
                  </button>
                ))}
                {availableCoaches.length === 0 && (
                  <p className="text-sm text-muted-foreground">No coaches available for this player</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Select Time Slot */}
          {step === 'slot' && (
            <div>
              <button onClick={handleBack} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-3" /> Back
              </button>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Pick a time with {selectedCoach?.name}
                </h3>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name="duration"
                      value={30}
                      checked={duration === 30}
                      onChange={() => setDuration(30)}
                      className="size-3"
                    />
                    30min
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name="duration"
                      value={60}
                      checked={duration === 60}
                      onChange={() => setDuration(60)}
                      className="size-3"
                    />
                    60min
                  </label>
                </div>
              </div>

              {loadingSlots ? (
                <div className="mt-6 flex items-center justify-center py-8">
                  <Clock className="size-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading available times...</span>
                </div>
              ) : slots.length === 0 ? (
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  No available slots in the next 3 weeks
                </p>
              ) : (
                <div className="mt-4 max-h-[400px] space-y-4 overflow-y-auto">
                  {Array.from(slotsByDate.entries()).map(([date, daySlots]) => {
                    // For 60min duration, filter to slots where a consecutive pair exists
                    const displaySlots = duration === 60
                      ? daySlots.filter((slot, i) => {
                          const nextSlot = daySlots[i + 1]
                          if (!nextSlot) return false
                          return timeToMinutes(nextSlot.startTime) === timeToMinutes(slot.startTime) + 30
                        })
                      : daySlots

                    if (displaySlots.length === 0) return null

                    const dateObj = new Date(date + 'T12:00:00')
                    const dayName = dateObj.toLocaleDateString('en-AU', { weekday: 'short' })
                    const dateStr = dateObj.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

                    return (
                      <div key={date}>
                        <p className="text-xs font-medium text-muted-foreground">
                          {dayName} {dateStr}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {displaySlots.map((slot) => (
                            <button
                              key={`${slot.date}-${slot.startTime}`}
                              onClick={() => handleSelectSlot(slot)}
                              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
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
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && selectedPlayer && selectedCoach && selectedSlot && (
            <div>
              <button onClick={handleBack} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-3" /> Back
              </button>
              <h3 className="text-sm font-semibold text-foreground">Confirm your booking</h3>

              <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Player</span>
                  <span className="font-medium">{selectedPlayer.first_name} {selectedPlayer.last_name}</span>
                </div>
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
