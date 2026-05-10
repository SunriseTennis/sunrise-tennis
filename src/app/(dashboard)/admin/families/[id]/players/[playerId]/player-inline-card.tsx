'use client'

import { updatePlayerInline } from '../../../../actions'
import { InlineText } from '@/components/inline-edit/inline-text'
import { InlineDate } from '@/components/inline-edit/inline-date'
import { InlineSelect } from '@/components/inline-edit/inline-select'
import { InlineToggle } from '@/components/inline-edit/inline-toggle'
import { InlineClassifications } from '@/components/inline-edit/inline-classifications'
import { InlineTags } from '@/components/inline-edit/inline-tags'
import { PlayerBall } from '@/components/player-ball'
import { Card, CardContent } from '@/components/ui/card'
import { CONSENT_LABELS } from '@/components/consent-toggle'

const STATUS_OPTIONS = [
  { value: 'active' as const, label: 'Active' },
  { value: 'inactive' as const, label: 'Inactive' },
  { value: 'archived' as const, label: 'Archived' },
]

const STATUS_STYLES = {
  active: 'bg-success/10 text-success border-success/30',
  inactive: 'bg-warning/10 text-warning border-warning/30',
  archived: 'bg-muted text-muted-foreground border-border',
} as const

const GENDER_OPTIONS = [
  { value: '' as const, label: 'Unset' },
  { value: 'female' as const, label: 'Female' },
  { value: 'male' as const, label: 'Male' },
  { value: 'non_binary' as const, label: 'Non-binary' },
]

const TRACK_OPTIONS = [
  { value: 'participation' as const, label: 'Participation' },
  { value: 'performance' as const, label: 'Performance' },
]

const TRACK_STYLES = {
  performance: 'bg-primary/10 text-primary border-primary/30',
  participation: 'bg-muted text-muted-foreground border-border',
} as const

const COMP_OPTIONS = [
  { value: '' as const, label: 'Unset' },
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'No' },
  { value: 'future' as const, label: 'Future' },
]

type Player = {
  id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  dob: string | null
  gender: 'male' | 'female' | 'non_binary' | null
  classifications: string[] | null
  track: 'performance' | 'participation' | null
  status: 'active' | 'inactive' | 'archived'
  school: string | null
  current_focus: string[] | null
  short_term_goal: string | null
  long_term_goal: string | null
  comp_interest: 'yes' | 'no' | 'future' | null
  medical_notes: string | null
  media_consent_coaching: boolean | null
  media_consent_social: boolean | null
}

function row(label: string, value: React.ReactNode, span?: 'full') {
  return (
    <div className={span === 'full' ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  )
}

export function PlayerInlineCard({ player }: { player: Player }) {
  const playerId = player.id
  const save = (patch: Parameters<typeof updatePlayerInline>[1]) => updatePlayerInline(playerId, patch)

  const classifications = (player.classifications ?? []) as string[]

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <PlayerBall player={{ classifications }} size="lg" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Player Profile</h2>
              <p className="text-xs text-muted-foreground">Click any field to edit. Changes save on blur.</p>
            </div>
          </div>
          <InlineSelect
            value={player.status}
            options={STATUS_OPTIONS}
            onSave={(next) => save({ status: next })}
            styles={STATUS_STYLES}
          />
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {row(
            'First name',
            <InlineText
              value={player.first_name}
              onSave={(next) => save({ first_name: next })}
            />,
          )}
          {row(
            'Last name',
            <InlineText
              value={player.last_name}
              onSave={(next) => save({ last_name: next })}
            />,
          )}
          {row(
            'Preferred name',
            <InlineText
              value={player.preferred_name ?? ''}
              placeholder="-"
              onSave={(next) => save({ preferred_name: next || null })}
            />,
          )}
          {row(
            'Date of birth',
            <InlineDate
              value={player.dob}
              onSave={(next) => save({ dob: next })}
            />,
          )}
          {row(
            'Gender',
            <InlineSelect
              value={(player.gender ?? '') as '' | 'male' | 'female' | 'non_binary'}
              options={GENDER_OPTIONS}
              onSave={(next) => save({ gender: next === '' ? null : next })}
            />,
          )}
          {row(
            'Track',
            <InlineSelect
              value={(player.track ?? 'participation')}
              options={TRACK_OPTIONS}
              onSave={(next) => save({ track: next })}
              styles={TRACK_STYLES}
            />,
          )}
          {row(
            'Classifications',
            <InlineClassifications
              value={classifications}
              onSave={(next) => save({ classifications: next })}
              size="sm"
            />,
            'full',
          )}
          {row(
            'School',
            <InlineText
              value={player.school ?? ''}
              placeholder="e.g. McAuley Community School"
              onSave={(next) => save({ school: next })}
            />,
            'full',
          )}
          {row(
            'Competition Interest',
            <InlineSelect
              value={(player.comp_interest ?? '') as '' | 'yes' | 'no' | 'future'}
              options={COMP_OPTIONS}
              onSave={(next) => save({ comp_interest: next === '' ? null : next })}
            />,
          )}
          {row(
            'Current focus',
            <InlineTags
              value={player.current_focus}
              onSave={(next) => save({ current_focus: next })}
            />,
            'full',
          )}
          {row(
            'Short-term goal',
            <InlineText
              value={player.short_term_goal ?? ''}
              placeholder="-"
              onSave={(next) => save({ short_term_goal: next })}
            />,
          )}
          {row(
            'Long-term goal',
            <InlineText
              value={player.long_term_goal ?? ''}
              placeholder="-"
              onSave={(next) => save({ long_term_goal: next })}
            />,
          )}
          {row(
            'Medical notes',
            <InlineText
              value={player.medical_notes ?? ''}
              placeholder="Allergies, injuries, conditions..."
              multiline
              onSave={(next) => save({ medical_notes: next })}
            />,
            'full',
          )}
          {row(
            'Media consent',
            <div className="space-y-1.5">
              <InlineToggle
                value={!!player.media_consent_coaching}
                label={CONSENT_LABELS.coaching.label}
                onSave={(next) => save({ media_consent_coaching: next })}
              />
              <InlineToggle
                value={!!player.media_consent_social}
                label={CONSENT_LABELS.social.label}
                onSave={(next) => save({ media_consent_social: next })}
              />
            </div>,
            'full',
          )}
        </dl>
      </CardContent>
    </Card>
  )
}
