'use client'

import { useEffect, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { getFamilyPrivateRateOverrides, type FamilyPrivateOverride } from '../actions'
import { getNextTermStart, getTermForDate } from '@/lib/utils/school-terms'

interface Coach {
  id: string
  name: string
  /** Default per-hour rate in cents (from coaches.hourly_rate). */
  rate: number
}

interface Props {
  /** Family whose private overrides apply. Refetches when this changes. */
  familyId: string | null
  coaches: Coach[]
  /** HTML attributes for the <select>. */
  id: string
  name: string
  required?: boolean
  defaultValue?: string
}

function formatUntilLabel(validUntil: string | null): string {
  if (!validUntil) return ''
  const d = new Date(validUntil + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  const nextStart = getNextTermStart(d)
  const nextTerm = nextStart ? getTermForDate(nextStart) : null
  if (nextTerm) return `until Term ${nextTerm.term} ${nextTerm.year}`
  return `until ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/**
 * Coach picker that resolves the family's per-coach grandfathered rate when
 * a family is selected. The action that lands the booking already calls
 * `getPrivatePrice` server-side; this just makes the rate visible at
 * selection time.
 */
export function CoachRateSelect({ familyId, coaches, id, name, required, defaultValue }: Props) {
  const [overrides, setOverrides] = useState<FamilyPrivateOverride[] | null>(null)
  // Reset state synchronously in render when familyId changes — avoids the
  // cascading-render warning from an in-effect setState. The actual fetch
  // happens in the effect below.
  const [trackedFamilyId, setTrackedFamilyId] = useState<string | null>(familyId)
  if (trackedFamilyId !== familyId) {
    setTrackedFamilyId(familyId)
    setOverrides(null)
  }

  useEffect(() => {
    if (!familyId) return
    let cancelled = false
    getFamilyPrivateRateOverrides(familyId).then((rows) => {
      if (!cancelled) setOverrides(rows)
    })
    return () => { cancelled = true }
  }, [familyId])

  const overrideForCoach = useMemo(() => {
    const perCoach = new Map<string, FamilyPrivateOverride>()
    let allCoaches: FamilyPrivateOverride | null = null
    for (const o of overrides ?? []) {
      if (o.coachId) perCoach.set(o.coachId, o)
      else if (!allCoaches) allCoaches = o
    }
    return (coachId: string): FamilyPrivateOverride | null =>
      perCoach.get(coachId) ?? allCoaches ?? null
  }, [overrides])

  const sorted = useMemo(
    () => [...coaches].filter(c => c.rate > 0).sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name)),
    [coaches]
  )

  const optionLabel = (coach: Coach): string => {
    const o = overrideForCoach(coach.id)
    const defaultPerHour = (coach.rate / 100).toFixed(0)
    if (!o) return `${coach.name.split(' ')[0]} - $${defaultPerHour}/hr`
    // override.per30Cents → per-hour for display parity with default
    const overrideHourly = (o.per30Cents * 2) / 100
    const until = formatUntilLabel(o.validUntil)
    const untilSuffix = until ? ` · ${until}` : ''
    return `${coach.name.split(' ')[0]} - $${overrideHourly.toFixed(0)}/hr (was $${defaultPerHour}/hr${untilSuffix})`
  }

  return (
    <div>
      <Label htmlFor={id} className="text-xs">Coach</Label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">Select coach...</option>
        {sorted.map((c) => (
          <option key={c.id} value={c.id}>{optionLabel(c)}</option>
        ))}
      </select>
      {familyId && overrides !== null && overrides.length > 0 && (
        <p className="mt-1 text-[11px] text-emerald-700">
          Grandfathered rate applies to this family.
        </p>
      )}
    </div>
  )
}
