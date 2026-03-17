import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ContactInfoForm } from './contact-info-form'
import { MediaConsentForm } from './media-consent-form'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, CheckCircle } from 'lucide-react'

export default async function ParentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
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
    <div className="max-w-3xl">
      <PageHeader title="Family Settings" description="Update your contact details and preferences." />

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          <CheckCircle className="size-4 shrink-0" />
          {success}
        </div>
      )}

      <div className="mt-6 space-y-8">
        {/* Contact Information */}
        <ContactInfoForm
          primaryContact={primaryContact}
          secondaryContact={secondaryContact}
          address={family.address}
        />

        {/* Media Consent */}
        {players && players.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground">Media Consent</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Control whether photos and videos of your child may be used for coaching and promotional purposes.
              </p>
              <div className="mt-4 space-y-3">
                {players.map((player) => (
                  <MediaConsentForm
                    key={player.id}
                    playerId={player.id}
                    playerName={`${player.first_name} ${player.last_name}`}
                    currentConsent={player.media_consent ?? false}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
