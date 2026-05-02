'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addBulkFamilyPricing } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { getAllTerms } from '@/lib/utils/school-terms'
import { Layers, X } from 'lucide-react'

interface FamilyOption {
  id: string
  display_id: string
  family_name: string
}

interface CoachOption {
  id: string
  name: string
  is_owner: boolean | null
}

const selectClass = 'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatTermStart(d: Date): { value: string; label: string } {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return {
    value: `${yyyy}-${mm}-${dd}`,
    label: `${dd}-${MONTH_LABEL[d.getMonth()]}-${yyyy}`,
  }
}

export function BulkPricingForm({
  families,
  coaches,
}: {
  families: FamilyOption[]
  coaches: CoachOption[]
}) {
  const router = useRouter()
  const today = useMemo(() => new Date(), [])

  const termStartOptions = useMemo(() => {
    const todayMs = today.getTime()
    return getAllTerms()
      .filter(t => t.start.getTime() > todayMs)
      .map(t => {
        const fmt = formatTermStart(t.start)
        return { value: fmt.value, label: `Start of Term ${t.term} ${t.year} — ${fmt.label}` }
      })
  }, [today])

  const ownerCoach = coaches.find(c => c.is_owner) ?? coaches[0]

  const [programType, setProgramType] = useState<'group' | 'squad' | 'private' | 'school'>('private')
  const [coachId, setCoachId] = useState<string>(ownerCoach?.id ?? '')
  const [perSession, setPerSession] = useState('')
  const [validUntil, setValidUntil] = useState(termStartOptions[0]?.value ?? '')
  const [notes, setNotes] = useState('Grandfathered rate')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [] as FamilyOption[]
    return families
      .filter(f => !selectedIds.has(f.id))
      .filter(f =>
        f.display_id.toLowerCase().includes(q) ||
        f.family_name.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [search, families, selectedIds])

  const selectedFamilies = useMemo(
    () => families.filter(f => selectedIds.has(f.id)),
    [families, selectedIds],
  )

  function addFamily(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setSearch('')
  }

  function removeFamily(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function clearAll() {
    setSelectedIds(new Set())
  }

  const isPrivate = programType === 'private'
  const rateLabel = isPrivate ? 'Per 30min ($)' : 'Per session ($)'

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Layers className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Bulk Grandfathered Rates</h2>
            <p className="text-xs text-muted-foreground">Lock multiple families on the old rate until a chosen term boundary.</p>
          </div>
        </div>

        <form
          action={async (formData) => {
            formData.set('family_ids', [...selectedIds].join(','))
            formData.set('program_type', programType)
            formData.set('coach_id', isPrivate ? coachId : '')
            formData.set('per_session_dollars', perSession)
            formData.set('valid_until', validUntil)
            formData.set('notes', notes)
            await addBulkFamilyPricing(formData)
            router.refresh()
          }}
          className="mt-5 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="bulk_program_type">Program type</Label>
              <select
                id="bulk_program_type"
                value={programType}
                onChange={(e) => setProgramType(e.target.value as typeof programType)}
                className={selectClass}
              >
                <option value="private">Private</option>
                <option value="group">Group</option>
                <option value="squad">Squad</option>
                <option value="school">School</option>
              </select>
            </div>

            {isPrivate && (
              <div>
                <Label htmlFor="bulk_coach_id">Coach</Label>
                <select
                  id="bulk_coach_id"
                  value={coachId}
                  onChange={(e) => setCoachId(e.target.value)}
                  className={selectClass}
                >
                  {coaches.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.is_owner ? ' (owner)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label htmlFor="bulk_per_session">{rateLabel} *</Label>
              <Input
                id="bulk_per_session"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder={isPrivate ? '40.00' : '20.00'}
                value={perSession}
                onChange={(e) => setPerSession(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="bulk_valid_until">Valid until *</Label>
              <select
                id="bulk_valid_until"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                required
                className={selectClass}
              >
                {termStartOptions.length === 0 && <option value="">No upcoming terms configured</option>}
                {termStartOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Override expires the day this term starts.</p>
            </div>
          </div>

          <div>
            <Label htmlFor="bulk_notes">Notes</Label>
            <Input
              id="bulk_notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="bulk_search">Add families</Label>
            <Input
              id="bulk_search"
              type="text"
              placeholder="Search by family name or ID (e.g. Smith or C001)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1"
            />
            {matches.length > 0 && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border/50">
                {matches.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => addFamily(f.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-medium text-foreground">{f.family_name}</span>
                    <span className="text-xs text-muted-foreground">{f.display_id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedFamilies.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  Selected ({selectedFamilies.length})
                </p>
                {selectedFamilies.length >= 5 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs text-muted-foreground hover:text-danger"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedFamilies.map(f => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                  >
                    {f.display_id} {f.family_name}
                    <button
                      type="button"
                      onClick={() => removeFamily(f.id)}
                      className="ml-0.5 rounded-full text-primary/70 hover:text-primary"
                      aria-label={`Remove ${f.family_name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={selectedFamilies.length === 0 || !perSession || !validUntil}
            >
              {selectedFamilies.length === 0
                ? 'Pick families to grandfather'
                : `Grandfather ${selectedFamilies.length} ${selectedFamilies.length === 1 ? 'family' : 'families'}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
