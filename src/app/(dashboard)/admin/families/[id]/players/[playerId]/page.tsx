import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, decryptMedicalNotes } from '@/lib/supabase/server'
import { PlayerInlineCard } from './player-inline-card'
import { PlayerDangerZone } from './player-danger-zone'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'

interface PageProps {
  params: Promise<{ id: string; playerId: string }>
  searchParams: Promise<{ success?: string; error?: string }>
}

export default async function PlayerDetailPage({ params, searchParams }: PageProps) {
  const { id: familyId, playerId } = await params
  const { success, error } = await searchParams
  const supabase = await createClient()

  const [{ data: player }, { data: family }, { data: roster }, { data: compPlayers }] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).single(),
    supabase.from('families').select('display_id, family_name').eq('id', familyId).single(),
    supabase.from('program_roster').select('status, enrolled_at, programs:program_id(id, name, type, term)').eq('player_id', playerId),
    supabase.from('competition_players').select('id, first_name, role, registration_status, teams:team_id(id, name, competitions:competition_id(id, name, short_name))').eq('player_id', playerId),
  ])

  if (!player || !family) notFound()

  // Decrypt medical notes (stored encrypted at rest). physical_notes
  // column dropped in Plan 19.
  if (player.medical_notes) {
    const decrypted = await decryptMedicalNotes(supabase, playerId)
    player.medical_notes = decrypted.medical_notes
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/families" className="hover:text-foreground">Families</Link>
        <span>/</span>
        <Link href={`/admin/families/${familyId}`} className="hover:text-foreground">
          {family.display_id} - {family.family_name}
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{player.first_name} {player.last_name}</span>
      </div>

      <h1 className="mt-4 text-2xl font-bold text-foreground">{player.first_name} {player.last_name}</h1>

      {success && (
        <div className="mt-4 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {/* Player profile — Plan 24 inline-edit */}
        <PlayerInlineCard
          player={{
            id: playerId,
            first_name: player.first_name,
            last_name: player.last_name,
            preferred_name: player.preferred_name ?? null,
            dob: player.dob ?? null,
            gender: (player.gender ?? null) as 'male' | 'female' | 'non_binary' | null,
            classifications: (player.classifications as string[] | null) ?? [],
            track: (player.track ?? null) as 'performance' | 'participation' | null,
            status: (player.status ?? 'active') as 'active' | 'inactive' | 'archived',
            school: player.school ?? null,
            current_focus: (player.current_focus ?? null) as string[] | null,
            short_term_goal: player.short_term_goal ?? null,
            long_term_goal: player.long_term_goal ?? null,
            comp_interest: (player.comp_interest ?? null) as 'yes' | 'no' | 'future' | null,
            medical_notes: player.medical_notes ?? null,
            media_consent_coaching: player.media_consent_coaching ?? false,
            media_consent_social: player.media_consent_social ?? false,
          }}
        />

        {/* Programs */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Programs</h2>
            {roster && roster.length > 0 ? (
              <div className="mt-3 space-y-2">
                {roster.filter(r => r.status === 'enrolled').map((r) => {
                  const prog = r.programs as unknown as { id: string; name: string; type: string; term: string | null } | null
                  return prog ? (
                    <Link
                      key={`${prog.id}-enrolled`}
                      href={`/admin/programs/${prog.id}`}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-primary/5"
                    >
                      <span className="font-medium text-foreground">{prog.name}</span>
                      <div className="flex items-center gap-2">
                        {prog.term && <span className="text-xs text-muted-foreground">{prog.term}</span>}
                        <StatusBadge status="enrolled" />
                      </div>
                    </Link>
                  ) : null
                })}
                {roster.filter(r => r.status === 'dropped').map((r) => {
                  const prog = r.programs as unknown as { id: string; name: string; type: string; term: string | null } | null
                  return prog ? (
                    <div
                      key={`${prog.id}-dropped`}
                      className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm opacity-60"
                    >
                      <span className="text-foreground">{prog.name}</span>
                      <div className="flex items-center gap-2">
                        {prog.term && <span className="text-xs text-muted-foreground">{prog.term}</span>}
                        <span className="text-xs text-muted-foreground">(dropped)</span>
                      </div>
                    </div>
                  ) : null
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Not enrolled in any programs.</p>
            )}
          </CardContent>
        </Card>

        {/* Competitions */}
        {compPlayers && compPlayers.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Competitions</h2>
              <div className="mt-3 space-y-2">
                {compPlayers.map((cp) => {
                  const team = cp.teams as unknown as { id: string; name: string; competitions: { id: string; name: string; short_name: string | null } } | null
                  const comp = team?.competitions
                  return (
                    <Link
                      key={cp.id}
                      href={comp ? `/admin/competitions/${comp.id}` : '#'}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-primary/5"
                    >
                      <div>
                        <span className="font-medium text-foreground">{comp?.name ?? 'Unknown'}</span>
                        {team && <span className="ml-2 text-muted-foreground">({team.name})</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{cp.role}</span>
                        <StatusBadge status={cp.registration_status} />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plan 21 — Danger zone */}
        <PlayerDangerZone
          playerId={playerId}
          familyId={familyId}
          playerName={`${player.first_name} ${player.last_name}`}
        />
      </div>
    </div>
  )
}
