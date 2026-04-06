// @ts-nocheck — messages table not yet migrated
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { validateFormData, replyMessageFormSchema } from '@/lib/utils/validation'
import { sendPushToUser } from '@/lib/push/send'

export async function replyToMessage(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const parsed = validateFormData(formData, replyMessageFormSchema)
  if (!parsed.success) {
    redirect('/admin/messages?error=' + encodeURIComponent(parsed.error))
  }

  const { message_id: messageId, reply } = parsed.data

  // Get the message to find the sender
  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select('id, sender_id, subject')
    .eq('id', messageId)
    .single()

  if (fetchError || !message) {
    redirect('/admin/messages?error=' + encodeURIComponent('Message not found'))
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
    redirect('/admin/messages?error=' + encodeURIComponent(error.message))
  }

  // Send push notification to the parent
  try {
    await sendPushToUser(message.sender_id, {
      title: 'Reply to your message',
      body: `Re: ${message.subject}`,
      url: '/parent/messages',
    })
  } catch (e) {
    console.error('Failed to send reply notification:', e)
  }

  revalidatePath('/admin/messages')
  redirect('/admin/messages?success=' + encodeURIComponent('Reply sent'))
}

export async function markMessageRead(messageId: string) {
  await requireAdmin()
  const supabase = await createClient()

  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('read_at', null)

  revalidatePath('/admin/messages')
}

export async function archiveMessage(messageId: string) {
  await requireAdmin()
  const supabase = await createClient()

  await supabase
    .from('messages')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', messageId)

  revalidatePath('/admin/messages')
}
