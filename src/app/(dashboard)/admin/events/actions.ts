'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { validateFormData } from '@/lib/utils/validation'

const eventFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  event_type: z.enum(['social', 'internal_tournament', 'external_tournament']),
  location: z.string().trim().max(500).optional().or(z.literal('')),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional().or(z.literal('')),
  start_time: z.string().optional().or(z.literal('')),
  end_time: z.string().optional().or(z.literal('')),
  all_day: z.string().optional(),
  external_url: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(['upcoming', 'in_progress', 'completed', 'cancelled']).optional(),
})

export async function createEvent(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, eventFormSchema)
  if (!parsed.success) {
    redirect(`/admin/events?error=${encodeURIComponent(parsed.error)}`)
  }

  const { title, description, event_type, location, start_date, end_date, start_time, end_time, all_day, external_url } = parsed.data

  const { error } = await supabase.from('club_events').insert({
    title,
    description: description || null,
    event_type,
    location: location || null,
    start_date,
    end_date: end_date || null,
    start_time: start_time || null,
    end_time: end_time || null,
    all_day: all_day === 'on',
    external_url: external_url || null,
    status: 'upcoming',
  })

  if (error) {
    console.error('Failed to create event:', error)
    redirect(`/admin/events?error=${encodeURIComponent('Failed to create event')}`)
  }

  revalidatePath('/admin/events')
  revalidatePath('/parent/events')
  redirect('/admin/events?success=Event+created')
}

export async function updateEvent(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) redirect('/admin/events?error=Missing+event+ID')

  const parsed = validateFormData(formData, eventFormSchema)
  if (!parsed.success) {
    redirect(`/admin/events?error=${encodeURIComponent(parsed.error)}`)
  }

  const { title, description, event_type, location, start_date, end_date, start_time, end_time, all_day, external_url, status } = parsed.data

  const { error } = await supabase
    .from('club_events')
    .update({
      title,
      description: description || null,
      event_type,
      location: location || null,
      start_date,
      end_date: end_date || null,
      start_time: start_time || null,
      end_time: end_time || null,
      all_day: all_day === 'on',
      external_url: external_url || null,
      status: status ?? 'upcoming',
    })
    .eq('id', id)

  if (error) {
    console.error('Failed to update event:', error)
    redirect(`/admin/events?error=${encodeURIComponent('Failed to update event')}`)
  }

  revalidatePath('/admin/events')
  revalidatePath('/parent/events')
  redirect('/admin/events?success=Event+updated')
}

export async function deleteEvent(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) redirect('/admin/events?error=Missing+event+ID')

  const { error } = await supabase
    .from('club_events')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Failed to delete event:', error)
    redirect(`/admin/events?error=${encodeURIComponent('Failed to delete event')}`)
  }

  revalidatePath('/admin/events')
  revalidatePath('/parent/events')
  redirect('/admin/events?success=Event+deleted')
}
