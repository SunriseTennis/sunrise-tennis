'use client'

import { updateMediaConsent } from '../actions'

/**
 * Plan 17 Block A — three granular consent toggles per player.
 * Toggling any switch auto-submits the form so all three values land
 * together. Each toggle is an iOS-style switch with the label inline.
 */
export function MediaConsentForm({
  playerId,
  playerName,
  consentCoaching,
  consentFamily,
  consentSocial,
}: {
  playerId: string
  playerName: string
  consentCoaching: boolean
  consentFamily: boolean
  consentSocial: boolean
}) {
  const updateWithId = updateMediaConsent.bind(null, playerId)

  return (
    <form action={updateWithId} className="px-4 py-3 space-y-3">
      <p className="text-sm font-medium text-foreground">{playerName}</p>
      <div className="space-y-2.5">
        <Toggle
          name="media_consent_coaching"
          defaultChecked={consentCoaching}
          label="Coaching analysis (private)"
          hint="Coach reviews technique with you and the player. Never shared."
        />
        <Toggle
          name="media_consent_family"
          defaultChecked={consentFamily}
          label="Family progress moments (private)"
          hint="We share clips of your child with you. Never published."
        />
        <Toggle
          name="media_consent_social"
          defaultChecked={consentSocial}
          label="Sunrise Tennis website and social media (public)"
          hint="Selected highlights with your child recognisable. Posted only with this on."
        />
      </div>
    </form>
  )
}

function Toggle({
  name,
  defaultChecked,
  label,
  hint,
}: {
  name: string
  defaultChecked: boolean
  label: string
  hint: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center pt-1">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="peer sr-only"
          onChange={(e) => e.target.form?.requestSubmit()}
        />
        <div className="h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-border after:bg-card after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-primary/30"></div>
      </label>
    </div>
  )
}
