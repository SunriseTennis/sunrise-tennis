import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, getSessionUser, decryptMedicalNotes } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils/dates'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import {
  ChevronLeft,
  Video,
  BookOpen,
  ImageIcon,
  Heart,
  ChevronRight,
  GraduationCap,
} from 'lucide-react'
import { ParentPlayerEditForm } from './player-edit-form'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_PREFIXES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function stripDayPrefix(name: string, type: string): string {
  const lower = name.toLowerCase()
  for (const prefix of DAY_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      const stripped = name.slice(prefix.length + 1)
      const suffix = type === 'group' ? ' Group' : type === 'squad' ? ' Squad' : ''
      return stripped + suffix
    }
  }
  return name
}

const LEVEL_ACCENTS: Record<string, { bg: string; border: string; text: string }> = {
  red:    { bg: 'bg-ball-red', border: 'border-ball-red/80', text: 'text-white' },
  orange: { bg: 'bg-ball-orange', border: 'border-ball-orange/80', text: 'text-white' },
  green:  { bg: 'bg-ball-green', border: 'border-ball-green/80', text: 'text-white' },
  yellow: { bg: 'bg-ball-yellow', border: 'border-ball-yellow/80', text: 'text-deep-navy' },
  blue:   { bg: 'bg-ball-blue', border: 'border-ball-blue/80', text: 'text-white' },
}

function formatLevel(ballColor: string | null, level: string | null): string {
  if (!ballColor && !level) return '-'
  const bc = ballColor?.toLowerCase()
  if (bc && ['red', 'orange', 'green', 'yellow', 'blue'].includes(bc)) {
    return `${bc.charAt(0).toUpperCase() + bc.slice(1)} Ball`
  }
  return level ?? '-'
}

function calculateAge(dob: string | null): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

export default async function ParentPlayerDetailPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const supabase = await createClient()

  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  const familyId = userRole?.family_id
  if (!familyId) redirect('/parent')

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .eq('family_id', familyId)
    .single()

  if (!player) notFound()

  // Decrypt medical notes (stored encrypted at rest)
  if (player.medical_notes || player.physical_notes) {
    const decrypted = await decryptMedicalNotes(supabase, playerId)
    player.medical_notes = decrypted.medical_notes
    player.physical_notes = decrypted.physical_notes
  }

  const [{ data: enrollments }, { data: lessonNotes }] = await Promise.all([
    supabase
      .from('program_roster')
      .select('id, status, enrolled_at, programs:program_id(id, name, type, level, day_of_week, start_time, end_time)')
      .eq('player_id', playerId)
      .eq('status', 'enrolled'),
    supabase
      .from('lesson_notes')
      .select('id, focus, notes, progress, next_plan, drills_used, video_url, created_at, sessions:session_id(date, programs:program_id(name))')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const age = calculateAge(player.dob)
  const levelText = formatLevel(player.ball_color, player.level)
  const initial = player.first_name?.[0]?.toUpperCase() ?? '?'

  // Extract latest content for preview cards
  const latestNote = lessonNotes?.[0] ?? null
  const latestNoteDate = latestNote
    ? formatDate((latestNote.sessions as unknown as { date: string } | null)?.date ?? '')
    : null
  const latestVideoNote = lessonNotes?.find(n => n.video_url) ?? null
  const latestVideoDate = latestVideoNote
    ? formatDate((latestVideoNote.sessions as unknown as { date: string } | null)?.date ?? '')
    : null

  return (
    <div className="max-w-3xl space-y-5">
      {/* ── Hero Header ── */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />

        {/* Back button */}
        <Link
          href="/parent"
          className="relative mb-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white/90 backdrop-blur-sm transition-colors hover:bg-white/25"
        >
          <ChevronLeft className="size-3" />
          Overview
        </Link>

        <div className="relative flex items-center gap-4">
          {/* Avatar */}
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/20 text-xl font-bold text-white shadow-sm backdrop-blur-sm">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">{player.first_name} {player.last_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/80">
              <span>{levelText}</span>
              {player.gender && (
                <>
                  <span className="text-white/40">·</span>
                  <span>{player.gender === 'non_binary' ? 'Non-Binary' : player.gender.charAt(0).toUpperCase() + player.gender.slice(1)}</span>
                </>
              )}
              {age !== null && (
                <>
                  <span className="text-white/40">·</span>
                  <span>{age} years old</span>
                </>
              )}
            </div>
          </div>
          <StatusBadge status={player.status ?? 'active'} className="bg-white/15 border-white/20 text-white" />
        </div>
      </div>

      {/* ── Content Previews ── */}
      <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <div className="grid grid-cols-3 gap-2.5">
          {/* Lesson Notes Preview */}
          <Link
            href="#lesson-notes"
            className="group overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all hover:shadow-elevated hover:scale-[1.02]"
          >
            <div className="flex aspect-[4/3] items-center justify-center bg-primary/5 p-2.5">
              {latestNote?.focus || latestNote?.notes ? (
                <p className="line-clamp-3 text-[11px] leading-relaxed text-foreground/80">{latestNote.focus || latestNote.notes}</p>
              ) : (
                <BookOpen className="size-8 text-primary/25" />
              )}
            </div>
            <div className="px-2.5 py-2 text-center">
              <p className="text-[11px] font-semibold text-foreground">Lesson Notes</p>
              {latestNoteDate && (
                <p className="text-[10px] text-muted-foreground">Updated {latestNoteDate}</p>
              )}
            </div>
          </Link>

          {/* Video Analysis Preview */}
          <Link
            href="#lesson-notes"
            className="group overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all hover:shadow-elevated hover:scale-[1.02]"
          >
            <div className="relative flex aspect-[4/3] items-center justify-center bg-secondary/5">
              <Video className="size-8 text-secondary/25" />
              {latestVideoNote && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary/10 to-transparent">
                  <div className="flex size-8 items-center justify-center rounded-full bg-white/80 shadow-sm">
                    <Video className="size-4 text-secondary" />
                  </div>
                </div>
              )}
            </div>
            <div className="px-2.5 py-2 text-center">
              <p className="text-[11px] font-semibold text-foreground">Video Analysis</p>
              {latestVideoDate && (
                <p className="text-[10px] text-muted-foreground">Updated {latestVideoDate}</p>
              )}
            </div>
          </Link>

          {/* Gallery Preview */}
          <Link
            href="#lesson-notes"
            className="group overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all hover:shadow-elevated hover:scale-[1.02]"
          >
            <div className="flex aspect-[4/3] items-center justify-center bg-accent/5">
              <ImageIcon className="size-8 text-accent/25" />
            </div>
            <div className="px-2.5 py-2 text-center">
              <p className="text-[11px] font-semibold text-foreground">Gallery</p>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Profile Details ── */}
      <section className="animate-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-[#2B5EA7]/20 bg-gradient-to-r from-[#2B5EA7]/15 to-[#6480A4]/10 px-5 py-3">
            <h2 className="text-sm font-semibold text-[#2B5EA7]">Player Details</h2>
            <ParentPlayerEditForm player={{
              id: player.id,
              first_name: player.first_name,
              last_name: player.last_name,
              dob: player.dob,
              gender: player.gender,
              medical_notes: player.medical_notes,
              media_consent: player.media_consent,
            }} />
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-xs font-medium text-muted-foreground">Level</span>
              <span className="text-sm font-medium text-foreground">{levelText}</span>
            </div>
            {player.gender && (
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-xs font-medium text-muted-foreground">Gender</span>
                <span className="text-sm text-foreground">{player.gender === 'non_binary' ? 'Non-Binary' : player.gender.charAt(0).toUpperCase() + player.gender.slice(1)}</span>
              </div>
            )}
            {player.dob && (
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-xs font-medium text-muted-foreground">Date of Birth</span>
                <span className="text-sm text-foreground">{formatDate(player.dob)}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-xs font-medium text-muted-foreground">Media Consent</span>
              <span className="text-sm text-foreground">{player.media_consent ? 'Allowed' : 'Not allowed'}</span>
            </div>
            {/* Medical info */}
            <div className="px-5 py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Heart className="size-3" />
                Medical Notes
              </div>
              <p className="mt-1 text-sm text-foreground">
                {player.medical_notes || 'None recorded'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Enrolled Programs ── */}
      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-primary to-[#6480A4]" />
          Enrolled Programs
        </h2>

        {enrollments && enrollments.length > 0 ? (
          <div className="mt-2.5 space-y-2.5">
            {enrollments.map((enrollment) => {
              const program = enrollment.programs as unknown as {
                id: string; name: string; type: string; level: string;
                day_of_week: number | null; start_time: string | null; end_time: string | null
              } | null
              if (!program) return null
              const accent = LEVEL_ACCENTS[program.level ?? ''] ?? { bg: 'bg-primary', border: 'border-primary/80', text: 'text-white' }
              return (
                <Link
                  key={enrollment.id}
                  href={`/parent/programs/${program.id}`}
                  className={`group relative block overflow-hidden rounded-xl border p-4 shadow-card transition-all hover:shadow-elevated hover:scale-[1.01] hover:brightness-110 ${accent.bg} ${accent.border} ${accent.text}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{stripDayPrefix(program.name, program.type)}</p>
                      <p className="mt-0.5 text-xs opacity-80">
                        {program.day_of_week != null && DAYS[program.day_of_week]}
                        {program.start_time && ` · ${formatTime(program.start_time)}`}
                        {program.end_time && ` – ${formatTime(program.end_time)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="capitalize text-xs bg-white/20 border-white/30 text-current">{program.type}</Badge>
                      <ChevronRight className="size-4 opacity-50 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="mt-2.5">
            <EmptyState
              icon={GraduationCap}
              title="Not enrolled in any programs"
              description="Browse programs to enrol."
              compact
              action={
                <Link href="/parent/programs" className="text-xs font-medium text-primary hover:text-primary/80">
                  View programs
                </Link>
              }
            />
          </div>
        )}
      </section>

    </div>
  )
}
