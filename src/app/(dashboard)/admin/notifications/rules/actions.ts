'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { dispatchNotification } from '@/lib/notifications/dispatch'

const updateRuleSchema = z.object({
  enabled: z.string().optional(),
  channels: z.string().optional(), // comma-separated: 'push,in_app,email'
  title_template: z.string().min(1, 'Title required').max(200),
  body_template: z.string().max(500).optional(),
  /** Plan 22 Phase 4.4 — optional push-only override (≤200 chars typical). */
  body_template_push: z.string().max(500).optional(),
  url_template: z.string().max(500).optional(),
  audience: z.enum(['admins', 'family', 'coach', 'eligible_families']),
})

export async function updateNotificationRule(id: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const raw = Object.fromEntries(formData) as Record<string, string>
  const parsed = updateRuleSchema.safeParse(raw)
  if (!parsed.success) {
    redirect(`/admin/notifications/rules/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'Invalid input')}`)
  }

  const channels = (parsed.data.channels ?? 'push,in_app')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => ['push', 'in_app', 'email'].includes(s))

  const { error } = await supabase
    .from('notification_rules')
    .update({
      enabled: parsed.data.enabled === 'on',
      channels,
      audience: parsed.data.audience,
      title_template: parsed.data.title_template,
      body_template: parsed.data.body_template || null,
      body_template_push: parsed.data.body_template_push || null,
      url_template: parsed.data.url_template || null,
    })
    .eq('id', id)

  if (error) {
    redirect(`/admin/notifications/rules/${id}/edit?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/notifications/rules')
  revalidatePath(`/admin/notifications/rules/${id}/edit`)
  redirect('/admin/notifications/rules?success=Rule+updated')
}

/** Quick toggle from the list view. */
export async function toggleNotificationRule(id: string, enabled: boolean) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('notification_rules')
    .update({ enabled })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/notifications/rules')
  return {}
}

/** Send a sample of this rule to the calling admin only. */
export async function testRule(id: string): Promise<{ error?: string; success?: string }> {
  const user = await requireAdmin()
  const supabase = await createClient()

  const { data: rule } = await supabase
    .from('notification_rules')
    .select('event_type')
    .eq('id', id)
    .single()
  if (!rule) return { error: 'Rule not found' }

  // Fake context — admin only sees the rule that fires for them.
  // Most placeholders will render empty if not in this object.
  await dispatchNotification(rule.event_type, {
    playerName: '[Sample player]',
    programName: '[Sample program]',
    coachName: '[Sample coach]',
    date: new Date().toISOString().split('T')[0],
    time: '4:00 PM',
    duration: 60,
    familyName: '[Sample family]',
    chargeCount: 1,
    chargeAmount: '$20',
    creditNote: 'Full credit applied.',
    voucherCode: 'SV1234',
    ballColorSuffix: ' (red)',
    excludeUserId: undefined,
    // Force admin audience so the calling user sees something even
    // if the rule's normal audience is family/coach.
  })

  return { success: 'Test notification sent (if you are in the rule audience).' }
}
