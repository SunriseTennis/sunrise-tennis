'use client'

import { useState } from 'react'

interface Props {
  /** Form field name. Emits a 24hr "HH:MM" string. */
  name: string
  /** Initial value as 24hr "HH:MM" string. */
  defaultValue?: string
  /** Controlled value (24hr "HH:MM"). When provided, prefer onChange. */
  value?: string
  onChange?: (value: string) => void
  required?: boolean
  /** Minute step. Default 15. */
  step?: number
  /** Layout — "row" (default) or "compact" (tighter for table cells). */
  variant?: 'row' | 'compact'
  id?: string
}

function parse(v: string | undefined): { h12: number; m: number; ampm: 'AM' | 'PM' } | null {
  if (!v) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const h24 = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (isNaN(h24) || isNaN(min) || h24 < 0 || h24 > 23 || min < 0 || min > 59) return null
  const ampm: 'AM' | 'PM' = h24 < 12 ? 'AM' : 'PM'
  let h12 = h24 % 12
  if (h12 === 0) h12 = 12
  return { h12, m: min, ampm }
}

function serialize(h12: number, m: number, ampm: 'AM' | 'PM'): string {
  let h24 = h12 % 12
  if (ampm === 'PM') h24 += 12
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function TimePicker12h({
  name,
  defaultValue,
  value,
  onChange,
  required,
  step = 15,
  variant = 'row',
  id,
}: Props) {
  const initial = parse(value ?? defaultValue) ?? { h12: 12, m: 0, ampm: 'PM' as const }
  const [h12, setH12] = useState(initial.h12)
  const [m, setM] = useState(initial.m)
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(initial.ampm)
  const [touched, setTouched] = useState(!!(value ?? defaultValue))

  // Sync from controlled value (render-time prop-change pattern; React docs).
  const [prevValue, setPrevValue] = useState(value)
  if (value !== undefined && value !== prevValue) {
    setPrevValue(value)
    const parsed = parse(value)
    if (parsed) {
      setH12(parsed.h12)
      setM(parsed.m)
      setAmpm(parsed.ampm)
      setTouched(true)
    }
  }

  function bump(nextH: number, nextM: number, nextAmpm: 'AM' | 'PM') {
    setH12(nextH)
    setM(nextM)
    setAmpm(nextAmpm)
    setTouched(true)
    onChange?.(serialize(nextH, nextM, nextAmpm))
  }

  // Generate minute options at the requested step (00, 15, 30, 45 by default).
  const minutes: number[] = []
  for (let i = 0; i < 60; i += step) minutes.push(i)

  // Hidden input emits the canonical 24hr string. Empty until touched (so the
  // browser's `required` validation triggers when the user hasn't picked one).
  const out = touched ? serialize(h12, m, ampm) : ''

  const baseSelect = variant === 'compact'
    ? 'h-8 rounded-md border border-input bg-background px-1.5 text-xs'
    : 'h-9 rounded-md border border-input bg-background px-2 text-sm'

  const baseToggle = variant === 'compact'
    ? 'h-8 px-2 text-xs'
    : 'h-9 px-3 text-sm'

  return (
    <div className="inline-flex items-center gap-1" id={id}>
      <select
        aria-label="Hour"
        value={h12}
        onChange={e => bump(parseInt(e.target.value, 10), m, ampm)}
        className={baseSelect}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-muted-foreground">:</span>
      <select
        aria-label="Minute"
        value={m}
        onChange={e => bump(h12, parseInt(e.target.value, 10), ampm)}
        className={baseSelect}
      >
        {minutes.map(min => (
          <option key={min} value={min}>{String(min).padStart(2, '0')}</option>
        ))}
      </select>
      <div className="ml-1 inline-flex overflow-hidden rounded-md border border-input">
        <button
          type="button"
          onClick={() => bump(h12, m, 'AM')}
          className={`${baseToggle} font-medium transition-colors ${
            ampm === 'AM' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          AM
        </button>
        <button
          type="button"
          onClick={() => bump(h12, m, 'PM')}
          className={`${baseToggle} font-medium transition-colors ${
            ampm === 'PM' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          PM
        </button>
      </div>
      <input type="hidden" name={name} value={out} required={required && !touched} />
    </div>
  )
}
