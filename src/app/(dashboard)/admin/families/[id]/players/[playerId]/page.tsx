import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, decryptMedicalNotes } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils/dates'
import { PlayerEditForm } from './player-edit-form'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'

function ConsentLine({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block size-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-red-400'}`} />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className={`text-xs font-medium ${on ? 'text-emerald-700' : 'text-muted-foreground'}`}>{on ? 'Yes' : 'No'}</span>
    </div>
  )
}

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string; playerId: string }>
}) {
  const { id: familyId, playerId } = await params
  const supabase = await createClient()

  const [{ data: player }, { data: family }, { data: roster }, { data: compPlayers }, { data: coaches }] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).single(),
    supabase.from('families').select('display_id, family_name').eq('id', familyId).single(),
    supabase.from('program_roster').select('status, enrolled_at, programs:program_id(id, name, type, term)').eq('player_id', playerId),
    supabase.from('competition_players').select('id, first_name, role, registration_status, teams:team_id(id, name, competitions:competition_id(id, name, short_name))').eq('player_id', playerId),
    supabase.from('coaches').select('id, name').eq('status', 'active'),
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

      <div className="mt-6 space-y-6">
        {/* Current state */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-foreground">Player Profile</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {player.preferred_name && player.preferred_name !== player.first_name && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Preferred Name</dt>
                  <dd className="text-sm text-foreground">{player.preferred_name}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Ball Colour</dt>
                <dd className="text-sm text-foreground capitalize">{player.ball_color ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Level</dt>
                <dd className="text-sm text-foreground capitalize">{player.level ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Date of Birth</dt>
                <dd className="text-sm text-foreground">
                  {player.dob ? (
                    <>
                      {formatDate(player.dob)}
                      <span className="ml-1 text-muted-foreground">
                        ({Math.floor((Date.now() - new Date(player.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} yrs)
                      </span>
                    </>
                  ) : '-'}
                </dd>
              </div>
              {player.gender && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Gender</dt>
                  <dd className="text-sm text-foreground capitalize">{player.gender.replace('_', ' ')}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                <dd className="text-sm text-foreground capitalize">{player.status}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Media Consent</dt>
                <dd className="text-sm space-y-0.5">
                  <ConsentLine label="Coaching" on={!!player.media_consent_coaching} />
                  <ConsentLine label="Family" on={!!player.media_consent_family} />
                  <ConsentLine label="Social media" on={!!player.media_consent_social} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Competition Interest</dt>
                <dd className="text-sm text-foreground capitalize">{player.comp_interest ?? '-'}</dd>
              </div>
              {player.school && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">School</dt>
                  <dd className="text-sm text-foreground">{player.school}</dd>
                </div>
              )}
              {player.coach_id && coaches && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Assigned Coach</dt>
                  <dd className="text-sm text-foreground">{coaches.find(c => c.id === player.coach_id)?.name ?? '-'}</dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Current Focus</dt>
                <dd className="text-sm text-foreground">{player.current_focus?.join(', ') ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Short-term Goal</dt>
                <dd className="text-sm text-foreground">{player.short_term_goal ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Long-term Goal</dt>
                <dd className="text-sm text-foreground">{player.long_term_goal ?? '-'}</dd>
              </div>
              {player.medical_notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">Medical Notes</dt>
                  <dd className="text-sm text-foreground">{player.medical_notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

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

        {/* Edit form */}
        <PlayerEditForm player={player} familyId={familyId} />
      </div>
    </div>
  )
}
