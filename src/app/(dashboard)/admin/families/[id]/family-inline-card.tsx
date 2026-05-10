'use client'

import { updateFamilyInline } from '../../actions'
import { InlineText } from '@/components/inline-edit/inline-text'
import { InlineSelect } from '@/components/inline-edit/inline-select'

type Contact = { name?: string; role?: string; phone?: string; email?: string }
type BillingPrefs = { payment_method?: string; invoice_pref?: string; rate?: string; package_type?: string }

const STATUS_OPTIONS = [
  { value: 'active' as const, label: 'Active' },
  { value: 'inactive' as const, label: 'Inactive' },
  { value: 'lead' as const, label: 'Lead' },
  { value: 'archived' as const, label: 'Archived' },
]

const STATUS_STYLES = {
  active: 'bg-success/10 text-success border-success/30',
  inactive: 'bg-warning/10 text-warning border-warning/30',
  lead: 'bg-info/10 text-info border-info/30',
  archived: 'bg-muted text-muted-foreground border-border',
} as const

function fieldRow(label: string, value: React.ReactNode) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  )
}

export function FamilyInlineCard({
  familyId,
  primaryContact,
  secondaryContact,
  address,
  notes,
  referredBy,
  status,
  billingPrefs,
}: {
  familyId: string
  primaryContact: Contact | null
  secondaryContact: Contact | null
  address: string | null
  notes: string | null
  referredBy: string | null
  status: 'active' | 'inactive' | 'lead' | 'archived'
  billingPrefs: BillingPrefs | null
}) {
  // Bind familyId once for ergonomics.
  const save = (patch: Parameters<typeof updateFamilyInline>[1]) => updateFamilyInline(familyId, patch)

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Contact Information</h2>
          <InlineSelect
            value={status}
            options={STATUS_OPTIONS}
            onSave={(next) => save({ status: next })}
            styles={STATUS_STYLES}
          />
        </div>
      </div>

      <dl className="mt-2 grid gap-3 px-6 pb-4 sm:grid-cols-2">
        {fieldRow(
          'Primary Contact',
          <InlineText
            value={primaryContact?.name ?? ''}
            placeholder="Add name"
            onSave={(next) => save({ primary_contact: { name: next || null } })}
          />,
        )}
        {fieldRow(
          'Phone',
          <InlineText
            value={primaryContact?.phone ?? ''}
            placeholder="Add phone"
            type="tel"
            onSave={(next) => save({ primary_contact: { phone: next || null } })}
          />,
        )}
        {fieldRow(
          'Email',
          <InlineText
            value={primaryContact?.email ?? ''}
            placeholder="Add email"
            type="email"
            onSave={(next) => save({ primary_contact: { email: next || null } })}
          />,
        )}
        {fieldRow(
          'Address',
          <InlineText
            value={address ?? ''}
            placeholder="Add address"
            onSave={(next) => save({ address: next })}
          />,
        )}
        {fieldRow(
          'Referred By',
          <InlineText
            value={referredBy ?? ''}
            placeholder="-"
            onSave={(next) => save({ referred_by: next })}
          />,
        )}
      </dl>

      {/* Secondary contact — always render (admin can add/remove inline) */}
      <div className="border-t border-border px-6 py-4">
        <h3 className="text-sm font-semibold text-foreground">Secondary Contact</h3>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          {fieldRow(
            'Name',
            <InlineText
              value={secondaryContact?.name ?? ''}
              placeholder="Add name"
              onSave={(next) => save({ secondary_contact: { name: next || null } })}
            />,
          )}
          {fieldRow(
            'Role',
            <InlineText
              value={secondaryContact?.role ?? ''}
              placeholder="e.g. Mum, Dad"
              onSave={(next) => save({ secondary_contact: { role: next || null } })}
            />,
          )}
          {fieldRow(
            'Phone',
            <InlineText
              value={secondaryContact?.phone ?? ''}
              placeholder="Add phone"
              type="tel"
              onSave={(next) => save({ secondary_contact: { phone: next || null } })}
            />,
          )}
          {fieldRow(
            'Email',
            <InlineText
              value={secondaryContact?.email ?? ''}
              placeholder="Add email"
              type="email"
              onSave={(next) => save({ secondary_contact: { email: next || null } })}
            />,
          )}
        </dl>
      </div>

      {/* Billing preferences */}
      <div className="border-t border-border px-6 py-4">
        <h3 className="text-sm font-semibold text-foreground">Billing Preferences</h3>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          {fieldRow(
            'Payment Method',
            <InlineText
              value={billingPrefs?.payment_method ?? ''}
              placeholder="-"
              onSave={(next) => save({ billing_prefs: { payment_method: next || null } })}
            />,
          )}
          {fieldRow(
            'Package Type',
            <InlineText
              value={billingPrefs?.package_type ?? ''}
              placeholder="-"
              onSave={(next) => save({ billing_prefs: { package_type: next || null } })}
            />,
          )}
        </dl>
      </div>

      {/* Notes */}
      <div className="border-t border-border px-6 py-4">
        <h3 className="text-sm font-semibold text-foreground">Notes</h3>
        <div className="mt-2">
          <InlineText
            value={notes ?? ''}
            placeholder="Add notes"
            multiline
            onSave={(next) => save({ notes: next })}
          />
        </div>
      </div>
    </div>
  )
}
