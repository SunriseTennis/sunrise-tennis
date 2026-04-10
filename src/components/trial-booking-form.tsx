'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2 } from 'lucide-react'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const AGES = Array.from({ length: 14 }, (_, i) => i + 3) // 3-16

export function TrialBookingForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedDays, setSelectedDays] = useState<string[]>([])

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')

    const form = e.currentTarget
    const data = new FormData(form)

    const body = {
      parentName: data.get('parentName') as string,
      email: data.get('email') as string,
      phone: data.get('phone') as string,
      childName: data.get('childName') as string,
      childAge: parseInt(data.get('childAge') as string, 10),
      childGender: data.get('childGender') as string,
      preferredDays: selectedDays,
      message: (data.get('message') as string) || undefined,
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

      {/* Preferred days */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[#1A2332]">
          Preferred day(s)
        </label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                selectedDays.includes(day)
                  ? 'bg-[#2B5EA7] text-white shadow-sm'
                  : 'border border-[#E0D0BE] bg-white text-[#556270] hover:border-[#2B5EA7]/40'
              }`}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

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
