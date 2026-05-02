import { redirect } from 'next/navigation'
import { createClient, requireCoach, getSessionUser } from '@/lib/supabase/server'
import { EmailChangeForm, PasswordChangeFormShared } from '@/components/settings'
import { SettingsAccordion, type AccordionSection } from '@/components/settings/settings-accordion'
import { SignOutButton } from '@/app/(dashboard)/parent/settings/sign-out-button'
import { CoachNotificationPrefsForm } from './notification-prefs-form'
import { ImageHero } from '@/components/image-hero'
import { WarmToast } from '@/components/warm-toast'
import { Settings } from 'lucide-react'

export default async function CoachSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { coachId } = await requireCoach()
  if (!coachId) redirect('/coach?error=No+coach+profile+found')

  const supabase = await createClient()
  const { data: coach } = await supabase
    .from('coaches')
    .select('notification_preferences')
    .eq('id', coachId)
    .single()

  const prefs = (coach?.notification_preferences as Record<string, boolean> | null) ?? {}
  const pendingEmail = (user.user_metadata as Record<string, unknown> | undefined)?.new_email as string | undefined

  const sections: AccordionSection[] = [
    {
      id: 'notifications',
      iconName: 'Bell',
      label: 'Notifications',
      description: 'Booking requests, session digest, late cancellations',
      content: <CoachNotificationPrefsForm prefs={prefs} />,
    },
    {
      id: 'email',
      iconName: 'Mail',
      label: 'Email Address',
      description: user.email ?? 'Change your login email',
      content: (
        <EmailChangeForm
          currentEmail={user.email ?? ''}
          pendingEmail={pendingEmail}
        />
      ),
    },
    {
      id: 'password',
      iconName: 'Lock',
      label: 'Password',
      description: 'Update your password',
      content: <PasswordChangeFormShared redirectPath="/coach/settings" />,
    },
    {
      id: 'signout',
      iconName: 'LogOut',
      label: 'Sign Out',
      destructive: true,
      content: <SignOutButton />,
    },
  ]

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <ImageHero>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <Settings className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-white/80">Coach</p>
            <h1 className="text-2xl font-bold">Account Settings</h1>
          </div>
        </div>
      </ImageHero>

      {/* ── Toasts ── */}
      {error && <WarmToast variant="danger">{error}</WarmToast>}
      {success && <WarmToast variant="success">{success}</WarmToast>}

      {/* ── Accordion ── */}
      <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <SettingsAccordion sections={sections} />
      </div>
    </div>
  )
}
