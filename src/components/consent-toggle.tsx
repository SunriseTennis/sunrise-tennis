/**
 * Plan 20 — two granular media-consent toggles (coaching + social).
 * The "family progress moments" toggle was dropped 05-May-2026; copy
 * for both surviving toggles also rewritten.
 *
 * Used by the self-signup wizard, the admin-invite wizard, /parent/settings,
 * /parent/players/new, and admin add/edit-player forms. Submits as
 * `<name>` = 'on' / unset.
 */
export function ConsentToggle({
  id,
  name,
  defaultChecked,
  label,
  hint,
}: {
  id: string
  name: string
  defaultChecked: boolean
  label: string
  hint: string
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
      />
      <span className="text-xs text-foreground">
        <span className="font-medium">{label}</span>
        <span className="block text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

export const CONSENT_LABELS = {
  coaching: {
    label: 'Coaching analysis (private)',
    hint: 'Video footage for technical/tactical analysis. Only shared with you and coaches internally.',
  },
  social: {
    label: 'Social media (public)',
    hint: 'Photos/videos posted publicly on Sunrise Tennis platforms for promotional purposes. If you’ve provided consent but see something you’d like removed, contact Maxim for removal.',
  },
} as const
