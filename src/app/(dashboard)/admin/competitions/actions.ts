'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import {
  validateFormData,
  createCompetitionFormSchema,
  updateCompetitionFormSchema,
  createCompTeamFormSchema,
  updateCompTeamFormSchema,
  addCompPlayerFormSchema,
  updateCompPlayerFormSchema,
} from '@/lib/utils/validation'

// ── Competitions ───────────────────────────────────────────────────────

export async function createCompetition(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, createCompetitionFormSchema)
  if (!parsed.success) {
    redirect(`/admin/competitions/new?error=${encodeURIComponent(parsed.error)}`)
  }

  const d = parsed.data

  const { data, error } = await supabase
    .from('competitions')
    .insert({
      name: d.name,
      short_name: d.short_name || null,
      type: d.type,
      season: d.season,
      nomination_open: d.nomination_open || null,
      nomination_close: d.nomination_close || null,
      season_start: d.season_start || null,
      season_end: d.season_end || null,
      finals_start: d.finals_start || null,
      finals_end: d.finals_end || null,
      notes: d.notes || null,
      status: 'nominations_open',
    })
    .select('id')
    .single()

  if (error) {
    redirect(`/admin/competitions/new?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/competitions')
  redirect(`/admin/competitions/${data.id}`)
}

export async function updateCompetition(competitionId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, updateCompetitionFormSchema)
  if (!parsed.success) {
    redirect(`/admin/competitions/${competitionId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const d = parsed.data

  const { error } = await supabase
    .from('competitions')
    .update({
      name: d.name,
      short_name: d.short_name || null,
      type: d.type,
      season: d.season,
      nomination_open: d.nomination_open || null,
      nomination_close: d.nomination_close || null,
      season_start: d.season_start || null,
      season_end: d.season_end || null,
      finals_start: d.finals_start || null,
      finals_end: d.finals_end || null,
      notes: d.notes || null,
      status: d.status || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', competitionId)

  if (error) {
    redirect(`/admin/competitions/${competitionId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/competitions/${competitionId}`)
  redirect(`/admin/competitions/${competitionId}`)
}

// ── Competition Teams ──────────────────────────────────────────────────

export async function createCompTeam(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, createCompTeamFormSchema)
  if (!parsed.success) {
    redirect(`/admin/competitions?error=${encodeURIComponent(parsed.error)}`)
  }

  const d = parsed.data
  const competitionId = d.competition_id

  const { error } = await supabase
    .from('teams')
    .insert({
      name: d.name,
      competition_id: competitionId,
      division: d.division || null,
      gender: d.gender || null,
      age_group: d.age_group || null,
      team_size_required: d.team_size_required ? parseInt(d.team_size_required, 10) : null,
      coach_id: d.coach_id || null,
      nomination_status: 'draft',
      status: 'active',
    })

  if (error) {
    redirect(`/admin/competitions/${competitionId}/teams/new?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/competitions/${competitionId}`)
  redirect(`/admin/competitions/${competitionId}`)
}

export async function updateCompTeam(competitionId: string, teamId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, updateCompTeamFormSchema)
  if (!parsed.success) {
    redirect(`/admin/competitions/${competitionId}/teams/${teamId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const d = parsed.data

  const { error } = await supabase
    .from('teams')
    .update({
      name: d.name,
      division: d.division || null,
      gender: d.gender || null,
      age_group: d.age_group || null,
      team_size_required: d.team_size_required ? parseInt(d.team_size_required, 10) : null,
      coach_id: d.coach_id || null,
      nomination_status: d.nomination_status || undefined,
    })
    .eq('id', teamId)

  if (error) {
    redirect(`/admin/competitions/${competitionId}/teams/${teamId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/competitions/${competitionId}/teams/${teamId}`)
  redirect(`/admin/competitions/${competitionId}/teams/${teamId}`)
}

// ── Competition Players ────────────────────────────────────────────────

export async function addCompPlayer(competitionId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, addCompPlayerFormSchema)
  if (!parsed.success) {
    const teamId = formData.get('team_id') as string
    redirect(`/admin/competitions/${competitionId}/teams/${teamId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const d = parsed.data

  const { error } = await supabase
    .from('competition_players')
    .insert({
      team_id: d.team_id,
      first_name: d.first_name,
      last_name: d.last_name || null,
      age: d.age ? parseInt(d.age, 10) : null,
      gender: d.gender || null,
      role: d.role,
      registration_status: d.registration_status,
      notes: d.notes || null,
    })

  if (error) {
    redirect(`/admin/competitions/${competitionId}/teams/${d.team_id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/competitions/${competitionId}/teams/${d.team_id}`)
  redirect(`/admin/competitions/${competitionId}/teams/${d.team_id}`)
}

export async function updateCompPlayer(
  competitionId: string,
  teamId: string,
  playerId: string,
  formData: FormData,
) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, updateCompPlayerFormSchema)
  if (!parsed.success) {
    redirect(`/admin/competitions/${competitionId}/teams/${teamId}?error=${encodeURIComponent(parsed.error)}`)
  }

  const d = parsed.data

  const { error } = await supabase
    .from('competition_players')
    .update({
      first_name: d.first_name,
      last_name: d.last_name || null,
      age: d.age ? parseInt(d.age, 10) : null,
      gender: d.gender || null,
      role: d.role,
      registration_status: d.registration_status,
      player_id: d.player_id || null,
      notes: d.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', playerId)

  if (error) {
    redirect(`/admin/competitions/${competitionId}/teams/${teamId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/competitions/${competitionId}/teams/${teamId}`)
  redirect(`/admin/competitions/${competitionId}/teams/${teamId}`)
}

export async function removeCompPlayer(competitionId: string, teamId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const playerId = (formData.get('player_id') as string)?.trim()
  if (!playerId) {
    redirect(`/admin/competitions/${competitionId}/teams/${teamId}?error=Player ID required`)
  }

  const { error } = await supabase
    .from('competition_players')
    .delete()
    .eq('id', playerId)
    .eq('team_id', teamId)

  if (error) {
    redirect(`/admin/competitions/${competitionId}/teams/${teamId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/competitions/${competitionId}/teams/${teamId}`)
  redirect(`/admin/competitions/${competitionId}/teams/${teamId}`)
}

// ── UTR ────────────────────────────────────────────────────────────────

export async function savePlayerUTR(
  competitionId: string,
  teamId: string,
  compPlayerId: string,
  formData: FormData,
) {
  await requireAdmin()
  const supabase = await createClient()

  const utrProfileId = (formData.get('utr_profile_id') as string)?.trim()
  const utrRatingDisplay = (formData.get('utr_rating_display') as string)?.trim()
  const utrRatingStatus = (formData.get('utr_rating_status') as string)?.trim()

  const { error } = await supabase
    .from('competition_players')
    .update({
      utr_profile_id: utrProfileId || null,
      utr_rating_display: utrRatingDisplay || null,
      utr_rating_status: utrRatingStatus || null,
      utr_fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', compPlayerId)

  if (error) {
    redirect(`/admin/competitions/${competitionId}/teams/${teamId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/competitions/${competitionId}/teams/${teamId}`)
  redirect(`/admin/competitions/${competitionId}/teams/${teamId}`)
}
