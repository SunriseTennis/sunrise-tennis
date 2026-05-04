/**
 * Plan 17 Block A — single granular media-consent checkbox row. Used by
 * the self-signup wizard step 4, /parent/settings, /parent/players/new,
 * and admin add/edit-player forms. Submits as `<name>` = 'on' / unset.
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
    hint: 'Coach reviews technique with you and the player. Never shared.',
  },
  family: {
    label: 'Family progress moments (private)',
    hint: 'We share clips of your child with you. Never published.',
  },
  social: {
    label: 'Sunrise Tennis website and social media (public)',
    hint: 'Selected highlights with your child recognisable. Posted only with this on.',
  },
} as const
