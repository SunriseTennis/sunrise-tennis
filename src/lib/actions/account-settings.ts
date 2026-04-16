'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { checkRateLimitAsync } from '@/lib/utils/rate-limit'
import { logAuthEvent } from '@/lib/utils/auth-logger'

const ALLOWED_REDIRECTS = ['/parent/settings', '/coach/settings', '/admin/settings']

function safeRedirectPath(raw: unknown): string {
  const path = typeof raw === 'string' ? raw : '/dashboard'
  if (ALLOWED_REDIRECTS.includes(path)) return path
  return '/dashboard'
}

export async function changePasswordSecure(formData: FormData) {
  const supabase = await createClient()
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const redirectPath = safeRedirectPath(formData.get('redirect_path'))

  if (!await checkRateLimitAsync(`password:${user.id}`, 3, 60_000)) {
    redirect(`${redirectPath}?error=Too+many+attempts.+Please+wait+a+minute.`)
  }

  const currentPassword = formData.get('current_password') as string
  const newPassword = formData.get('new_password') as string
  const confirmPassword = formData.get('confirm_password') as string

  if (!currentPassword) {
    redirect(`${redirectPath}?error=Current+password+is+required`)
  }

  if (!newPassword || newPassword.length < 8) {
    redirect(`${redirectPath}?error=New+password+must+be+at+least+8+characters`)
  }

  if (newPassword !== confirmPassword) {
    redirect(`${redirectPath}?error=Passwords+do+not+match`)
  }

  // Verify current password by attempting sign-in first
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  })

  if (verifyError) {
    console.error('Password verify failed:', verifyError.message, '| email used:', user.email)
    redirect(`${redirectPath}?error=Current+password+is+incorrect`)
  }

  // Now update the password
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (error) {
    console.error('Password change failed:', error.message)
    const msg = error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('incorrect')
      ? 'Current+password+is+incorrect'
      : 'Password+change+failed.+Please+try+again.'
    redirect(`${redirectPath}?error=${msg}`)
  }

  await logAuthEvent({
    userId: user.id,
    email: user.email ?? '',
    eventType: 'password_change',
    method: 'password',
    success: true,
  })

  revalidatePath(redirectPath)
  redirect(`${redirectPath}?success=Password+changed+successfully`)
}
