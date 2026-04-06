// @ts-nocheck — messages table not yet migrated
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { validateFormData, replyMessageFormSchema } from '@/lib/utils/validation'
import { sendPushToUser } from '@/lib/push/send'

async function requireCoach() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: role } = await supabase
    .from('user_roles')
    .select('coach_id')
    .eq('user_id', user.id)
    .eq('role', 'coach')
    .single()

  if (!role?.coach_id) redirect('/login')
  return { user, coachId: role.coach_id }
}

export async function replyToMessage(formData: FormData) {
  const { user } = await requireCoach()
  const supabase = await createClient()

  const parsed = validateFormData(formData, replyMessageFormSchema)
  if (!parsed.success) {
    redirect('/coach/messages?error=' + encodeURIComponent(parsed.error))
  }

  const { message_id: messageId, reply } = parsed.data

  // Verify message is directed to this coach
  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select('id, sender_id, subject, recipient_id')
    .eq('id', messageId)
    .eq('recipient_id', user.id)
    .single()

  if (fetchError || !message) {
    redirect('/coach/messages?error=' + encodeURIComponent('Message not found'))
  }

  const { error } = await supabase
    .from('messages')
    .update({
      admin_reply: reply,
      replied_at: new Date().toISOString(),
      replied_by: user.id,
    })
    .eq('id', messageId)

  if (error) {
    redirect('/coach/messages?error=' + encodeURIComponent(error.message))
  }

  // Send push to the parent
  try {
    await sendPushToUser(message.sender_id, {
      title: 'Reply from your coach',
      body: `Re: ${message.subject}`,
      url: '/parent/messages',
    })
  } catch (e) {
    console.error('Failed to send reply notification:', e)
  }

  revalidatePath('/coach/messages')
  redirect('/coach/messages?success=' + encodeURIComponent('Reply sent'))
}

export async function markMessageRead(messageId: string) {
  const { user } = await requireCoach()
  const supabase = await createClient()

  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('recipient_id', user.id)
    .is('read_at', null)

  revalidatePath('/coach/messages')
}
