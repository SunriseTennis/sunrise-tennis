'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { submitVoucherForm, submitVoucherImage } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import { Ticket, Upload, FileText, Check, AlertCircle } from 'lucide-react'

interface Player {
  id: string
  first_name: string
  last_name: string
  dob: string | null
}

interface FamilyContact {
  name?: string
  phone?: string
  email?: string
}

interface VoucherFormProps {
  players: Player[]
  familyContact: FamilyContact | null
  familyAddress: string | null
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Submitting...' : label}
    </Button>
  )
}

export function VoucherForm({ players, familyContact, familyAddress }: VoucherFormProps) {
  const [mode, setMode] = useState<'form' | 'image'>('form')
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id ?? '')
  const [amount, setAmount] = useState<'100' | '200'>('100')
  const [file, setFile] = useState<File | null>(null)

  // Pre-populate from selected player
  const selectedPlayer = players.find(p => p.id === selectedPlayerId)

  // Parse family address into parts (best effort)
  const addressParts = parseAddress(familyAddress)

  // Parse contact name into first/last
  const contactParts = parseContactName(familyContact?.name)

  // Format player DOB from YYYY-MM-DD to DD/MM/YYYY
  const playerDob = selectedPlayer?.dob
    ? formatDobForVoucher(selectedPlayer.dob)
    : ''

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-success/10">
            <Ticket className="size-5 text-success" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Sports Voucher</h3>
            <p className="text-xs text-muted-foreground">SA Sports Vouchers Plus - up to $200 credit</p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('form')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
              mode === 'form'
                ? 'bg-primary text-white shadow-sm'
                : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <FileText className="size-3.5" />
            Fill Out Form
          </button>
          <button
            type="button"
            onClick={() => setMode('image')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
              mode === 'image'
                ? 'bg-primary text-white shadow-sm'
                : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Upload className="size-3.5" />
            Upload Voucher
          </button>
        </div>

        {mode === 'form' ? (
          <form action={submitVoucherForm} className="mt-4 space-y-5">
            {/* Shared fields: player + amount */}
            <PlayerAndAmountFields
              players={players}
              selectedPlayerId={selectedPlayerId}
              onPlayerChange={setSelectedPlayerId}
              amount={amount}
              onAmountChange={setAmount}
            />

            {/* ── Child's Information ── */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-foreground border-b border-border pb-1 w-full">
                Child&apos;s Information
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="First Name" name="child_first_name" defaultValue={selectedPlayer?.first_name ?? ''} required />
                <FormField label="Family Name" name="child_surname" defaultValue={selectedPlayer?.last_name ?? ''} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Date of Birth" name="child_dob" defaultValue={playerDob} placeholder="DD/MM/YYYY" required />
                <div>
                  <Label htmlFor="child_gender" className="text-xs">Gender</Label>
                  <select
                    id="child_gender"
                    name="child_gender"
                    required
                    className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Gender Diverse">Gender Diverse</option>
                  </select>
                </div>
              </div>
              <YesNoField name="first_time" label="Is this the first time your child has joined this activity provider?" />
              <FormField label="What is the cost to participate in this activity?" name="activity_cost" placeholder="e.g. 260" required />
              <YesNoField name="has_disability" label="Has your child been identified as living with a disability?" defaultValue="No" />
              <YesNoField name="english_main_language" label="Is English the main language spoken at home?" defaultValue="Yes" />
              <FormField label="If no, what language do you speak at home?" name="other_language" />
              <YesNoField name="is_indigenous" label="Is your child from an Aboriginal or Torres Strait Islander background?" defaultValue="No" />
            </fieldset>

            {/* ── Medicare Information ── */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-foreground border-b border-border pb-1 w-full">
                Medicare Information
              </legend>
              <MedicareFields />
              <FormField label="OR Australian visa number" name="visa_number" placeholder="If no Medicare card" />
            </fieldset>

            {/* ── Parent/Guardian Information ── */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-foreground border-b border-border pb-1 w-full">
                Parent/Guardian Information
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="First Name" name="parent_first_name" defaultValue={contactParts.first} required />
                <FormField label="Family Name" name="parent_surname" defaultValue={contactParts.last} required />
              </div>
              <FormField label="Street Address" name="street_address" defaultValue={addressParts.street} required />
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Suburb" name="suburb" defaultValue={addressParts.suburb} required />
                <FormField label="Postcode" name="postcode" defaultValue={addressParts.postcode} required />
              </div>
              <FormField label="Contact Number" name="parent_contact_number" defaultValue={familyContact?.phone ?? ''} required />
              <FormField label="Email" name="parent_email" type="email" defaultValue={familyContact?.email ?? ''} required />
            </fieldset>

            <SubmitButton label="Submit Voucher" />
          </form>
        ) : (
          <form action={submitVoucherImage} className="mt-4 space-y-4">
            {/* Shared fields: player + amount */}
            <PlayerAndAmountFields
              players={players}
              selectedPlayerId={selectedPlayerId}
              onPlayerChange={setSelectedPlayerId}
              amount={amount}
              onAmountChange={setAmount}
            />

            {/* File upload */}
            <div>
              <Label htmlFor="voucher_file" className="text-xs">Upload completed voucher form</Label>
              <div className="mt-1">
                <label
                  htmlFor="voucher_file"
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors',
                    file
                      ? 'border-success/50 bg-success/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30',
                  )}
                >
                  {file ? (
                    <>
                      <Check className="size-6 text-success" />
                      <p className="mt-2 text-sm font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)}MB</p>
                    </>
                  ) : (
                    <>
                      <Upload className="size-6 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        Photo or PDF of the completed voucher form
                      </p>
                      <p className="text-xs text-muted-foreground">JPG, PNG, or PDF - max 10MB</p>
                    </>
                  )}
                </label>
                <input
                  id="voucher_file"
                  name="voucher_file"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  required
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>Make sure the voucher form is fully completed and all fields are legible. We&apos;ll review it and process it for you.</span>
            </div>

            <SubmitButton label="Upload Voucher" />
          </form>
        )}
      </CardContent>
    </Card>
  )
}

// ── Sub-components ──

function PlayerAndAmountFields({
  players,
  selectedPlayerId,
  onPlayerChange,
  amount,
  onAmountChange,
}: {
  players: Player[]
  selectedPlayerId: string
  onPlayerChange: (id: string) => void
  amount: '100' | '200'
  onAmountChange: (v: '100' | '200') => void
}) {
  return (
    <>
      <div>
        <Label htmlFor="player_id" className="text-xs">Which child is this voucher for?</Label>
        <select
          id="player_id"
          name="player_id"
          required
          value={selectedPlayerId}
          onChange={(e) => onPlayerChange(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">Voucher amount</Label>
        <div className="mt-1 flex gap-3">
          {(['100', '200'] as const).map((val) => (
            <label key={val} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="amount"
                value={val}
                checked={amount === val}
                onChange={() => onAmountChange(val)}
                className="accent-primary"
              />
              <span className="text-sm">
                {val === '100' ? '1 x $100' : '2 x $100'}
              </span>
            </label>
          ))}
        </div>
      </div>
    </>
  )
}

function FormField({
  label,
  name,
  defaultValue,
  placeholder,
  required,
  type = 'text',
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  type?: string
}) {
  return (
    <div>
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="mt-1"
      />
    </div>
  )
}

function MedicareFields() {
  const [medicareCard, setMedicareCard] = useState('')
  const [medicareRef, setMedicareRef] = useState('')

  // Concatenate for the hidden field
  const fullMedicare = medicareCard + medicareRef

  return (
    <div>
      <Label className="text-xs">Medicare number</Label>
      <div className="mt-1 flex items-center gap-2">
        <Input
          placeholder="Card number (10 digits)"
          maxLength={10}
          value={medicareCard}
          onChange={(e) => setMedicareCard(e.target.value.replace(/\D/g, ''))}
          className="flex-1"
        />
        <Input
          placeholder="Ref"
          maxLength={1}
          value={medicareRef}
          onChange={(e) => setMedicareRef(e.target.value.replace(/\D/g, ''))}
          className="w-14 text-center"
        />
      </div>
      <input type="hidden" name="medicare_number" value={fullMedicare} />
    </div>
  )
}

function YesNoField({ name, label, defaultValue = '' }: { name: string; label: string; defaultValue?: string }) {
  return (
    <div>
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <select
        id={name}
        name={name}
        required
        defaultValue={defaultValue}
        className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="">Select...</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
  )
}

// ── Voucher History ──

interface VoucherRecord {
  id: string
  child_first_name: string | null
  child_surname: string | null
  amount_cents: number
  status: string
  submitted_at: string | null
  rejection_reason: string | null
  voucher_number: number
  submission_method: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Pending review', color: 'bg-yellow-100 text-yellow-800' },
  in_batch: { label: 'Under review', color: 'bg-blue-100 text-blue-800' },
  submitted_to_portal: { label: 'Submitted to SA', color: 'bg-purple-100 text-purple-800' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Declined', color: 'bg-red-100 text-red-800' },
}

export function VoucherHistory({ vouchers }: { vouchers: VoucherRecord[] }) {
  if (vouchers.length === 0) return null

  return (
    <div className="mt-3 space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Voucher History</h3>
      {vouchers.map((v) => {
        const config = STATUS_CONFIG[v.status] ?? { label: v.status, color: 'bg-muted text-foreground' }
        const childName = v.child_first_name
          ? `${v.child_first_name} ${v.child_surname ?? ''}`.trim()
          : 'Unknown'
        const date = v.submitted_at
          ? new Date(v.submitted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
          : ''

        return (
          <div key={v.id} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="size-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">
                    {childName}
                    {v.voucher_number === 2 && <span className="text-xs text-muted-foreground ml-1">(2nd voucher)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.submission_method === 'image' ? 'Uploaded' : 'Form'} - {date}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium text-foreground">
                  ${(v.amount_cents / 100).toFixed(0)}
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', config.color)}>
                  {config.label}
                </span>
              </div>
            </div>
            {v.status === 'rejected' && v.rejection_reason && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                Reason: {v.rejection_reason}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Helpers ──

function parseAddress(address: string | null): { street: string; suburb: string; postcode: string } {
  if (!address) return { street: '', suburb: '', postcode: '' }
  // Try to extract postcode (4 digits at end)
  const postcodeMatch = address.match(/\b(\d{4})\s*$/)
  const postcode = postcodeMatch?.[1] ?? ''
  const withoutPostcode = postcodeMatch ? address.slice(0, postcodeMatch.index).trim().replace(/,\s*$/, '') : address
  // Try to split remaining into street + suburb (last segment after comma)
  const parts = withoutPostcode.split(',').map(s => s.trim())
  if (parts.length >= 2) {
    return { street: parts.slice(0, -1).join(', '), suburb: parts[parts.length - 1], postcode }
  }
  return { street: withoutPostcode, suburb: '', postcode }
}

function parseContactName(name: string | null | undefined): { first: string; last: string } {
  if (!name) return { first: '', last: '' }
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function formatDobForVoucher(isoDate: string): string {
  // YYYY-MM-DD → DD/MM/YYYY
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}
