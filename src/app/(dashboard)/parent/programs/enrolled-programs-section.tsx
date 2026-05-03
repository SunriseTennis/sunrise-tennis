import Link from 'next/link'
import { CalendarDays, ChevronRight, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatDate, formatTime } from '@/lib/utils/dates'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const LEVEL_ACCENTS: Record<string, string> = {
  red: 'border-l-ball-red',
  orange: 'border-l-ball-orange',
  green: 'border-l-ball-green',
  yellow: 'border-l-ball-yellow',
  blue: 'border-l-ball-blue',
  advanced: 'border-l-purple-500',
  elite: 'border-l-amber-400',
}

export interface EnrolledProgramRow {
  programId: string
  programName: string
  programType: string
  level: string | null
  dayOfWeek: number | null
  startTime: string | null
  endTime: string | null
  /** ISO date string of the next scheduled session for this program, if any. */
  nextSessionDate: string | null
}

export interface EnrolledByPlayer {
  playerId: string
  playerFirstName: string
  programs: EnrolledProgramRow[]
}

export function EnrolledProgramsSection({ groups }: { groups: EnrolledByPlayer[] }) {
  if (groups.length === 0) return null

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">Enrolled programs</h2>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.playerId}>
            <p className="text-sm font-medium text-foreground mb-2">{group.playerFirstName}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.programs.map((p) => {
                const accent = (p.level && LEVEL_ACCENTS[p.level.toLowerCase()]) ?? 'border-l-primary/40'
                return (
                  <Link
                    key={p.programId}
                    href={`/parent/programs/${p.programId}`}
                    className={cn(
                      'group flex items-center justify-between gap-3 rounded-lg border border-border border-l-4 bg-card px-3 py-2.5 shadow-card hover:shadow-elevated transition-shadow',
                      accent,
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{p.programName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.dayOfWeek != null && DAYS[p.dayOfWeek]}
                        {p.startTime && p.endTime && ` · ${formatTime(p.startTime)} – ${formatTime(p.endTime)}`}
                      </p>
                      {p.nextSessionDate && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-primary">
                          <CalendarDays className="size-3" />
                          Next: {formatDate(p.nextSessionDate)}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
