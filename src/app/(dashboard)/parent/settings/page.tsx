import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { ContactInfoForm } from './contact-info-form'
import { MediaConsentForm } from './media-consent-form'
import { NotificationPrefsForm } from './notification-prefs-form'
import { CalendarSyncForm } from './calendar-sync-form'
import { EmailChangeForm, PasswordChangeFormShared } from '@/components/settings'
import { MfaSection } from '@/components/settings/mfa-section'
import { SignOutButton } from './sign-out-button'
import { ImageHero } from '@/components/image-hero'
import { WarmToast } from '@/components/warm-toast'
import { SettingsAccordion, type AccordionSection } from '@/components/settings/settings-accordion'
import { Settings } from 'lucide-react'

export default async function ParentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const supabase = await createClient()

  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()

  const familyId = userRole?.family_id
  if (!familyId) redirect('/parent')

  const [{ data: family }, { data: players }] = await Promise.all([
    supabase.from('families').select('*').eq('id', familyId).single(),
    supabase.from('players').select('id, first_name, last_name, media_consent_coaching, media_consent_family, media_consent_social').eq('family_id', familyId).order('first_name'),
  ])

  if (!family) redirect('/parent')

  const primaryContact = family.primary_contact as { name?: string; phone?: string; email?: string } | null
  const secondaryContact = family.secondary_contact as { name?: string; phone?: string; email?: string } | null

  const sections: AccordionSection[] = [
    {
      id: 'contact',
      iconName: 'User',
      label: 'Contact Information',
      description: 'Primary and secondary contact details',
      content: (
        <ContactInfoForm
          primaryContact={primaryContact}
          secondaryContact={secondaryContact}
        />
      ),
    },
    {
      id: 'notifications',
      iconName: 'Bell',
      label: 'Notifications',
      description: 'Session reminders and charge alerts',
      content: (
        <NotificationPrefsForm
          currentPref={(family.notification_preferences as Record<string, string> | null)?.session_reminders ?? 'first_week_and_privates'}
          preChargeHeadsUp={((family.notification_preferences as Record<string, unknown> | null)?.pre_charge_heads_up ?? true) !== false}
        />
      ),
    },
    {
      id: 'calendar',
      iconName: 'CalendarDays',
      label: 'Calendar Sync',
      description: 'Subscribe to your schedule in Apple/Google Calendar',
      content: (
        <CalendarSyncForm calendarToken={family.calendar_token ?? null} />
      ),
    },
    ...(players && players.length > 0 ? [{
      id: 'media',
      iconName: 'Camera',
      label: 'Media Consent',
      description: 'Photo and video usage permissions',
      content: (
        <div className="divide-y divide-border/40 -mx-1">
          {players.map((player) => (
            <MediaConsentForm
              key={player.id}
              playerId={player.id}
              playerName={`${player.first_name} ${player.last_name}`}
              consentCoaching={player.media_consent_coaching ?? false}
              consentFamily={player.media_consent_family ?? false}
              consentSocial={player.media_consent_social ?? false}
            />
          ))}
        </div>
      ),
    }] : []),
    {
      id: 'email',
      iconName: 'Mail',
      label: 'Email Address',
      description: user.email ?? 'Change your login email',
      content: (
        <EmailChangeForm
          currentEmail={user.email ?? ''}
          pendingEmail={(user.user_metadata as Record<string, unknown> | undefined)?.new_email as string | undefined}
        />
      ),
    },
    {
      id: 'password',
      iconName: 'Lock',
      label: 'Password',
      description: 'Update your password',
      content: (
        <PasswordChangeFormShared redirectPath="/parent/settings" />
      ),
    },
    {
      id: 'mfa',
      iconName: 'ShieldCheck',
      label: 'Two-factor authentication',
      description: 'Optional — adds a 6-digit code to sign-in',
      content: (
        <MfaSection />
      ),
    },
    {
      id: 'signout',
      iconName: 'LogOut',
      label: 'Sign Out',
      destructive: true,
      content: (
        <SignOutButton />
      ),
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
