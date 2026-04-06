// @ts-nocheck — messages table not yet migrated
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { validateFormData, sendMessageFormSchema } from '@/lib/utils/validation'
import { sendPushToAdmins, sendPushToUser } from '@/lib/push/send'

export async function sendMessage(formData: FormData) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Rate limit: 5 messages per minute
  const { checkRateLimitAsync } = await import('@/lib/utils/rate-limit')
  if (!await checkRateLimitAsync(`msg:${user.id}`, 5, 60_000)) {
    redirect('/parent/messages?error=' + encodeURIComponent('Too many messages. Please wait a moment.'))
  }

  const parsed = validateFormData(formData, sendMessageFormSchema)
  if (!parsed.success) {
    redirect('/parent/messages?error=' + encodeURIComponent(parsed.error))
  }

  const {
    recipient_role: recipientRole,
    recipient_id: recipientId,
    category,
    subject,
    body,
    player_id: playerId,
    program_id: programId,
  } = parsed.data

  // Get parent's family_id
  const { data: role } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  const { error } = await supabase
    .from('messages')
    .insert({
      sender_id: user.id,
      recipient_role: recipientRole,
      recipient_id: recipientId || null,
      family_id: role?.family_id || null,
      category,
      subject,
      body,
      player_id: playerId || null,
      program_id: programId || null,
    })

  if (error) {
    console.error('Send message failed:', error.message)
    redirect('/parent/messages?error=' + encodeURIComponent('Failed to send message'))
  }

  // Send push notification to recipient
  try {
    if (recipientRole === 'admin') {
      await sendPushToAdmins({
        title: 'New Parent Message',
        body: subject,
        url: '/admin/messages',
      })
    } else if (recipientId) {
      await sendPushToUser(recipientId, {
        title: 'New Parent Message',
        body: subject,
        url: '/coach/messages',
      })
    }
  } catch (e) {
    console.error('Failed to send message notification:', e)
  }

  revalidatePath('/parent/messages')
  redirect('/parent/messages?success=' + encodeURIComponent('Message sent'))
}

export async function markMessageRead(messageId: string) {
  const user = await getSessionUser()
  if (!user) return

  const supabase = await createClient()

  // Parent can only see their own messages - read_at indicates they've seen the reply
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('sender_id', user.id)
    .is('read_at', null)
}
