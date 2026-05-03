'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_DOW: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
}
const PRIVATE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const PRIVATE_TIMES: string[] = (() => {
  const out: string[] = []
  for (let h = 7; h <= 20; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`)
    out.push(`${String(h).padStart(2, '0')}:30`)
  }
  return out
})()
const AGES = Array.from({ length: 16 }, (_, i) => i + 3) // 3-18

interface Program {
  id: string
  name: string
  type: string
  level: string
  day_of_week: number | null
  start_time: string | null
  end_time: string | null
  per_session_cents: number | null
}

type InterestType = 'program' | 'private'

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

export function TrialBookingForm({ programs = [] }: { programs?: Program[] }) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [interestType, setInterestType] = useState<InterestType>('program')

  // Program-mode state
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null)
  const [expandedProgramDay, setExpandedProgramDay] = useState<number | null>(null)

  // Private-mode state — { day -> Set of HH:MM }
  const [privateSlots, setPrivateSlots] = useState<Record<string, string[]>>({})
  const [expandedPrivateDay, setExpandedPrivateDay] = useState<string | null>(null)

  // Group programs by day-of-week (school programs sit at the top by their day too).
  const programsByDay = useMemo(() => {
    const map = new Map<number, Program[]>()
    for (const p of programs) {
      if (p.day_of_week == null) continue
      const list = map.get(p.day_of_week) ?? []
      list.push(p)
      map.set(p.day_of_week, list)
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    }
    return map
  }, [programs])

  const selectedProgram = selectedProgramId ? programs.find(p => p.id === selectedProgramId) : null

  function togglePrivateDay(day: string) {
    setExpandedPrivateDay(prev => (prev === day ? null : day))
    setPrivateSlots(prev => (prev[day] ? prev : { ...prev, [day]: [] }))
  }

  function togglePrivateTime(day: string, time: string) {
    setPrivateSlots(prev => {
      const cur = prev[day] ?? []
      const next = cur.includes(time) ? cur.filter(t => t !== time) : [...cur, time].sort()
      return { ...prev, [day]: next }
    })
  }

  function clearPrivateDay(day: string) {
    setPrivateSlots(prev => {
      const next = { ...prev }
      delete next[day]
      return next
    })
    if (expandedPrivateDay === day) setExpandedPrivateDay(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')

    const form = e.currentTarget
    const data = new FormData(form)

    const interest = interestType === 'program'
      ? selectedProgram
        ? {
            interestType: 'program' as const,
            programId: selectedProgram.id,
            programName: selectedProgram.name,
            programDay: selectedProgram.day_of_week,
            programStart: selectedProgram.start_time,
            programEnd: selectedProgram.end_time,
          }
        : null
      : {
          interestType: 'private' as const,
          preferredSlots: Object.entries(privateSlots)
            .filter(([, times]) => times.length > 0)
            .map(([day, times]) => ({ day, times })),
        }

    if (interestType === 'program' && !selectedProgram) {
      setStatus('error')
      setErrorMsg('Please pick a program — or switch to Private enquiry below.')
      return
    }
    if (interestType === 'private' && (!interest || (interest as { preferredSlots: unknown[] }).preferredSlots.length === 0)) {
      setStatus('error')
      setErrorMsg('Please tick at least one day & time that suits you.')
      return
    }

    const body = {
      parentName: data.get('parentName') as string,
      email: data.get('email') as string,
      phone: data.get('phone') as string,
      childName: data.get('childName') as string,
      childAge: parseInt(data.get('childAge') as string, 10),
      childGender: data.get('childGender') as string,
      message: (data.get('message') as string) || undefined,
      interest,
    }

    try {
      const res = await fetch('/api/public/trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Something went wrong' }))
        throw new Error(json.error || 'Something went wrong')
      }

      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-[#2D8A4E]/10">
          <CheckCircle className="size-8 text-[#2D8A4E]" />
        </div>
        <h3 className="mt-4 text-xl font-bold text-[#1A2332]">You&apos;re booked in!</h3>
        <p className="mt-2 max-w-sm text-[#556270]">
          Thanks for your interest! We&apos;ll be in touch within 24 hours to confirm your child&apos;s free trial session.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Parent details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="parentName" className="mb-1 block text-sm font-medium text-[#1A2332]">
            Your name
          </label>
          <input
            type="text"
            id="parentName"
            name="parentName"
            required
            className="w-full rounded-lg border border-[#E0D0BE] bg-white px-3 py-2.5 text-sm text-[#1A2332] placeholder:text-[#8899A6] focus:border-[#2B5EA7] focus:ring-1 focus:ring-[#2B5EA7] focus:outline-none"
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-[#1A2332]">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="w-full rounded-lg border border-[#E0D0BE] bg-white px-3 py-2.5 text-sm text-[#1A2332] placeholder:text-[#8899A6] focus:border-[#2B5EA7] focus:ring-1 focus:ring-[#2B5EA7] focus:outline-none"
            placeholder="jane@example.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="phone" className="mb-1 block text-sm font-medium text-[#1A2332]">
          Phone number
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          required
          className="w-full rounded-lg border border-[#E0D0BE] bg-white px-3 py-2.5 text-sm text-[#1A2332] placeholder:text-[#8899A6] focus:border-[#2B5EA7] focus:ring-1 focus:ring-[#2B5EA7] focus:outline-none"
          placeholder="0412 345 678"
        />
      </div>

      {/* Child details */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="childName" className="mb-1 block text-sm font-medium text-[#1A2332]">
            Child&apos;s name
          </label>
          <input
            type="text"
            id="childName"
            name="childName"
            required
            className="w-full rounded-lg border border-[#E0D0BE] bg-white px-3 py-2.5 text-sm text-[#1A2332] placeholder:text-[#8899A6] focus:border-[#2B5EA7] focus:ring-1 focus:ring-[#2B5EA7] focus:outline-none"
            placeholder="Oliver"
          />
        </div>
        <div>
          <label htmlFor="childAge" className="mb-1 block text-sm font-medium text-[#1A2332]">
            Child&apos;s age
          </label>
          <select
            id="childAge"
            name="childAge"
            required
            className="w-full rounded-lg border border-[#E0D0BE] bg-white px-3 py-2.5 text-sm text-[#1A2332] focus:border-[#2B5EA7] focus:ring-1 focus:ring-[#2B5EA7] focus:outline-none"
            defaultValue=""
          >
            <option value="" disabled>Select age</option>
            {AGES.map((age) => (
              <option key={age} value={age}>{age} years old</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="childGender" className="mb-1 block text-sm font-medium text-[#1A2332]">
            Gender
          </label>
          <select
            id="childGender"
            name="childGender"
            required
            className="w-full rounded-lg border border-[#E0D0BE] bg-white px-3 py-2.5 text-sm text-[#1A2332] focus:border-[#2B5EA7] focus:ring-1 focus:ring-[#2B5EA7] focus:outline-none"
            defaultValue=""
          >
            <option value="" disabled>Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      {/* Interest type */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[#1A2332]">
          What are you interested in?
        </label>
        <div className="inline-flex w-full rounded-full border border-[#E0D0BE] bg-white p-1 shadow-sm sm:w-auto">
          <button
            type="button"
            onClick={() => setInterestType('program')}
            className={`flex-1 rounded-full px-4 py-1.5 text-xs font-semibold transition-all sm:flex-none sm:px-5 sm:text-sm ${
              interestType === 'program' ? 'bg-[#2B5EA7] text-white shadow-sm' : 'text-[#556270]'
            }`}
          >
            Group / squad / school
          </button>
          <button
            type="button"
            onClick={() => setInterestType('private')}
            className={`flex-1 rounded-full px-4 py-1.5 text-xs font-semibold transition-all sm:flex-none sm:px-5 sm:text-sm ${
              interestType === 'private' ? 'bg-[#2B5EA7] text-white shadow-sm' : 'text-[#556270]'
            }`}
          >
            Private enquiry
          </button>
        </div>
      </div>

      {/* Program picker */}
      {interestType === 'program' && (
        <div className="space-y-2">
          {selectedProgram && (
            <div className="flex items-center justify-between rounded-lg border border-[#2B5EA7]/30 bg-[#2B5EA7]/5 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1A2332]">{selectedProgram.name}</p>
                <p className="text-xs text-[#556270]">
                  {selectedProgram.day_of_week != null && DAYS[selectedProgram.day_of_week === 0 ? 6 : selectedProgram.day_of_week - 1]}
                  {selectedProgram.start_time && ` · ${formatTime(selectedProgram.start_time)}`}
                  {selectedProgram.end_time && ` – ${formatTime(selectedProgram.end_time)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProgramId(null)}
                className="ml-3 shrink-0 text-xs font-semibold text-[#E87450] hover:underline"
              >
                Change
              </button>
            </div>
          )}

          {!selectedProgram && (
            <>
              <p className="text-xs text-[#8899A6]">Tap a day to see programs that run that day.</p>
              {DAYS.map((dayLabel) => {
                const dow = DAY_DOW[dayLabel]
                const dayProgs = programsByDay.get(dow) ?? []
                if (dayProgs.length === 0) return null
                const isOpen = expandedProgramDay === dow
                return (
                  <div key={dayLabel} className="overflow-hidden rounded-lg border border-[#E0D0BE]/60 bg-white">
                    <button
                      type="button"
                      onClick={() => setExpandedProgramDay(isOpen ? null : dow)}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-[#1A2332]"
                    >
                      <span className="flex items-center gap-2">
                        {dayLabel}
                        <span className="rounded-full bg-[#FFF6ED] px-2 py-0.5 text-[10px] text-[#8899A6]">
                          {dayProgs.length}
                        </span>
                      </span>
                      <ChevronDown className={`size-4 text-[#8899A6] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="space-y-1.5 border-t border-[#E0D0BE]/40 bg-[#FFFBF7] p-2">
                        {dayProgs.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProgramId(p.id)
                              setExpandedProgramDay(null)
                            }}
                            className="flex w-full items-center justify-between rounded-md border border-transparent bg-white px-3 py-2 text-left transition-all hover:border-[#2B5EA7]/30 hover:bg-[#2B5EA7]/5"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[#1A2332]">{p.name}</p>
                              <p className="text-xs text-[#556270]">
                                {p.start_time && formatTime(p.start_time)}
                                {p.end_time && ` – ${formatTime(p.end_time)}`}
                                {p.per_session_cents ? ` · $${(p.per_session_cents / 100).toFixed(0)}/session` : ''}
                              </p>
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-[#8899A6]" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* Private enquiry slot picker */}
      {interestType === 'private' && (
        <div className="space-y-2">
          <p className="text-xs text-[#8899A6]">
            Tick the days that work, then choose times that suit. We&apos;ll come back to you with what&apos;s available.
          </p>
          {PRIVATE_DAYS.map((day) => {
            const isOpen = expandedPrivateDay === day
            const selected = privateSlots[day] ?? []
            const hasSelection = selected.length > 0
            return (
              <div key={day} className="overflow-hidden rounded-lg border border-[#E0D0BE]/60 bg-white">
                <button
                  type="button"
                  onClick={() => togglePrivateDay(day)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-[#1A2332]"
                >
                  <span className="flex items-center gap-2">
                    {day}
                    {hasSelection && (
                      <span className="rounded-full bg-[#2D8A4E]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2D8A4E]">
                        {selected.length} time{selected.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </span>
                  <ChevronDown className={`size-4 text-[#8899A6] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="border-t border-[#E0D0BE]/40 bg-[#FFFBF7] p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {PRIVATE_TIMES.map((t) => {
                        const active = selected.includes(t)
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => togglePrivateTime(day, t)}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                              active
                                ? 'bg-[#2B5EA7] text-white shadow-sm'
                                : 'border border-[#E0D0BE] bg-white text-[#556270] hover:border-[#2B5EA7]/40'
                            }`}
                          >
                            {formatTime(t)}
                          </button>
                        )
                      })}
                    </div>
                    {hasSelection && (
                      <button
                        type="button"
                        onClick={() => clearPrivateDay(day)}
                        className="mt-2 text-[11px] font-semibold text-[#E87450] hover:underline"
                      >
                        Clear {day}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Message */}
      <div>
        <label htmlFor="message" className="mb-1 block text-sm font-medium text-[#1A2332]">
          Anything else we should know? <span className="text-[#8899A6]">(optional)</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          className="w-full resize-none rounded-lg border border-[#E0D0BE] bg-white px-3 py-2.5 text-sm text-[#1A2332] placeholder:text-[#8899A6] focus:border-[#2B5EA7] focus:ring-1 focus:ring-[#2B5EA7] focus:outline-none"
          placeholder="E.g. previous tennis experience, any medical considerations..."
        />
      </div>

      {status === 'error' && (
        <p className="rounded-lg bg-[#C53030]/10 px-3 py-2 text-sm text-[#C53030]">{errorMsg}</p>
      )}

      <Button
        type="submit"
        disabled={status === 'submitting'}
        size="lg"
        className="w-full rounded-lg bg-[#E87450] text-base font-semibold text-white hover:bg-[#D06040]"
      >
        {status === 'submitting' ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Sending...
          </>
        ) : (
          'Book Your Free Trial'
        )}
      </Button>

      <p className="text-center text-xs text-[#8899A6]">
        No account needed. We&apos;ll contact you to confirm a session.
      </p>
    </form>
  )
}
