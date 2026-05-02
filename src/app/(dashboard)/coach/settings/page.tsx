import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import { EmailChangeForm, PasswordChangeFormShared } from '@/components/settings'
import { SignOutButton } from '@/app/(dashboard)/parent/settings/sign-out-button'
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

  const pendingEmail = (user.user_metadata as Record<string, unknown> | undefined)?.new_email as string | undefined

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
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
        </div>
      </ImageHero>

      {/* ── Toasts ── */}
      {error && <WarmToast variant="danger">{error}</WarmToast>}
      {success && <WarmToast variant="success">{success}</WarmToast>}

      {/* ── Email Change ── */}
      <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <EmailChangeForm
          currentEmail={user.email ?? ''}
          pendingEmail={pendingEmail}
        />
      </div>

      {/* ── Password ── */}
      <div className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <PasswordChangeFormShared redirectPath="/coach/settings" />
      </div>

      {/* ── Account (destructive) ── */}
      <div className="animate-fade-up" style={{ animationDelay: '240ms' }}>
        <SignOutButton />
      </div>
    </div>
  )
}
