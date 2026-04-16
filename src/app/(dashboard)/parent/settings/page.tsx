import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { ContactInfoForm } from './contact-info-form'
import { MediaConsentForm } from './media-consent-form'
import { NotificationPrefsForm } from './notification-prefs-form'
import { CalendarSyncForm } from './calendar-sync-form'
import { EmailChangeForm, PasswordChangeFormShared } from '@/components/settings'
import { SignOutButton } from './sign-out-button'
import { ImageHero } from '@/components/image-hero'
import { WarmToast } from '@/components/warm-toast'
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
    supabase.from('players').select('id, first_name, last_name, media_consent').eq('family_id', familyId).order('first_name'),
  ])

  if (!family) redirect('/parent')

  const primaryContact = family.primary_contact as { name?: string; phone?: string; email?: string } | null
  const secondaryContact = family.secondary_contact as { name?: string; phone?: string; email?: string } | null

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <ImageHero src="/images/tennis/hero-sunset.jpg" alt="Tennis court">
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

      {/* ── Profile ── */}
      <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <ContactInfoForm
          primaryContact={primaryContact}
          secondaryContact={secondaryContact}
        />
      </div>

      {/* ── Notifications ── */}
      <div className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <NotificationPrefsForm
          currentPref={(family.notification_preferences as Record<string, string> | null)?.session_reminders ?? 'first_week_and_privates'}
          preChargeHeadsUp={((family.notification_preferences as Record<string, unknown> | null)?.pre_charge_heads_up ?? true) !== false}
        />
      </div>

      {/* ── Calendar & Media ── */}
      <div className="animate-fade-up" style={{ animationDelay: '240ms' }}>
        <CalendarSyncForm calendarToken={family.calendar_token ?? null} />
      </div>

      {players && players.length > 0 && (
        <div className="animate-fade-up" style={{ animationDelay: '320ms' }}>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div className="border-b border-border/60 px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Media Consent</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Control whether photos and videos of your child may be used for coaching and promotional purposes.
              </p>
            </div>
            <div className="divide-y divide-border/40 px-1">
              {players.map((player) => (
                <MediaConsentForm
                  key={player.id}
                  playerId={player.id}
                  playerName={`${player.first_name} ${player.last_name}`}
                  currentConsent={player.media_consent ?? false}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Email Change ── */}
      <div className="animate-fade-up" style={{ animationDelay: '400ms' }}>
        <EmailChangeForm
          currentEmail={user.email ?? ''}
          pendingEmail={(user.user_metadata as Record<string, unknown> | undefined)?.new_email as string | undefined}
        />
      </div>

      {/* ── Password ── */}
      <div className="animate-fade-up" style={{ animationDelay: '480ms' }}>
        <PasswordChangeFormShared redirectPath="/parent/settings" />
      </div>

      {/* ── Account (destructive) ── */}
      <div className="animate-fade-up" style={{ animationDelay: '560ms' }}>
        <SignOutButton />
      </div>
    </div>
  )
}
