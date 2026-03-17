'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sendNotificationToTarget } from '@/lib/push/send'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function sendNotification(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const type = formData.get('type') as string
  const title = formData.get('title') as string
  const body = formData.get('body') as string
  const url = formData.get('url') as string
  const targetType = formData.get('target_type') as string
  const targetId = formData.get('target_id') as string
  const targetLevel = formData.get('target_level') as string

  if (!type || !title || !targetType) {
    redirect('/admin/notifications/compose?error=Missing required fields')
  }

  // Insert notification record
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      type,
      title,
      body: body || null,
      url: url || null,
      target_type: targetType,
      target_id: targetId || null,
      target_level: targetLevel || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    redirect(`/admin/notifications/compose?error=${encodeURIComponent(error.message)}`)
  }

  // Resolve targets and send push
  const userIds = await sendNotificationToTarget({
    title,
    body: body || '',
    url: url || undefined,
    targetType,
    targetId: targetId || undefined,
    targetLevel: targetLevel || undefined,
  })

  // Create recipient records using service role (since admin can't insert to other users' rows)
  if (userIds.length > 0 && notification) {
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    await serviceClient
      .from('notification_recipients')
      .insert(
        userIds.map((uid) => ({
          notification_id: notification.id,
          user_id: uid,
        })),
      )
  }

  revalidatePath('/admin/notifications')
  redirect(`/admin/notifications?success=Notification sent to ${userIds.length} users`)
}
