'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { submitVoucherForm, submitVoucherImage } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import { Ticket, Upload, FileText, Check, AlertCircle, X, User } from 'lucide-react'

interface Player {
  id: string
  first_name: string
  last_name: string
  dob: string | null
  gender: string | null
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
  // null = collapsed, 'form' or 'image' = expanded with that mode
  const [mode, setMode] = useState<'form' | 'image' | null>(null)
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
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success/10">
              <Ticket className="size-5 text-success" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Sports Voucher</h3>
            </div>
          </div>
          {mode && (
            <button
              type="button"
              onClick={() => setMode(null)}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Action buttons (shown when collapsed) */}
        {!mode && (
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode('form')}
              className="flex items-center gap-1.5"
            >
              <FileText className="size-3.5" />
              Fill Out Form
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode('image')}
              className="flex items-center gap-1.5"
            >
              <Upload className="size-3.5" />
              Upload Voucher
            </Button>
          </div>
        )}

        {/* Mode toggle (shown when expanded, to switch between modes) */}
        {mode && (
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
        )}

        {/* ── Form Mode ── */}
        {mode === 'form' && (
          <form key={selectedPlayerId} action={submitVoucherForm} className="mt-4 space-y-5">
            {/* Shared fields: player + amount */}
            <PlayerSelector
              players={players}
              selectedPlayerId={selectedPlayerId}
              onPlayerChange={setSelectedPlayerId}
            />
            <AmountSelector amount={amount} onAmountChange={setAmount} />

            {/* ── Child's Information ── */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-foreground border-b border-border pb-1 w-full">
                Child&apos;s Information
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="First Name" name="child_first_name" defaultValue={selectedPlayer?.first_name ?? ''} required />
                <FormField label="Family Name" name="child_surname" defaultValue={selectedPlayer?.last_name ?? ''} required />
              </div>
              <FormField label="Date of Birth" name="child_dob" defaultValue={playerDob} placeholder="DD/MM/YYYY" required />
              <TogglePills
                name="child_gender"
                label="Gender"
                options={['Male', 'Female', 'Gender Diverse']}
                defaultValue={selectedPlayer?.gender ?? ''}
                required
              />
              <TogglePills name="first_time" label="Is this the first time your child has joined this activity provider?" options={['Yes', 'No']} required />
              <FormField label="What is the cost to participate in this activity?" name="activity_cost" placeholder="e.g. 260 (whole dollars, no $ sign)" required />
              <TogglePills name="has_disability" label="Has your child been identified as living with a disability?" options={['Yes', 'No']} defaultValue="No" required />
              <TogglePills name="english_main_language" label="Is English the main language spoken at home?" options={['Yes', 'No']} defaultValue="Yes" required />
              <FormField label="If no, what language do you speak at home?" name="other_language" />
              <TogglePills name="is_indigenous" label="Is your child from an Aboriginal or Torres Strait Islander background?" options={['Yes', 'No']} defaultValue="No" required />
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
        )}

        {/* ── Image Mode ── */}
        {mode === 'image' && (
          <form action={submitVoucherImage} className="mt-4 space-y-4">
            <PlayerSelector
              players={players}
              selectedPlayerId={selectedPlayerId}
              onPlayerChange={setSelectedPlayerId}
            />
            <AmountSelector amount={amount} onAmountChange={setAmount} />

            {/* File upload */}
            <div>
              <Label htmlFor="voucher_file" className="text-xs">Upload completed voucher form <span className="text-red-500">*</span></Label>
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

/** Tappable player pills instead of dropdown */
function PlayerSelector({
  players,
  selectedPlayerId,
  onPlayerChange,
}: {
  players: Player[]
  selectedPlayerId: string
  onPlayerChange: (id: string) => void
}) {
  return (
    <div>
      <Label className="text-xs">Which child is this voucher for? <span className="text-red-500">*</span></Label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {players.map((p) => {
          const isSelected = p.id === selectedPlayerId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPlayerChange(p.id)}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all',
                isSelected
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border text-foreground hover:bg-muted/50',
              )}
            >
              <User className="size-3.5" />
              {p.first_name}
            </button>
          )
        })}
      </div>
      <input type="hidden" name="player_id" value={selectedPlayerId} />
    </div>
  )
}

function AmountSelector({
  amount,
  onAmountChange,
}: {
  amount: '100' | '200'
  onAmountChange: (v: '100' | '200') => void
}) {
  return (
    <div>
      <Label className="text-xs">Voucher amount <span className="text-red-500">*</span></Label>
      <div className="mt-1.5 flex gap-3">
        {(['100', '200'] as const).map((val) => (
          <button
            key={val}
            type="button"
            onClick={() => onAmountChange(val)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-all',
              amount === val
                ? 'bg-primary text-white shadow-sm'
                : 'border border-border text-foreground hover:bg-muted/50',
            )}
          >
            {val === '100' ? '1 x $100' : '2 x $100'}
          </button>
        ))}
      </div>
      <input type="hidden" name="amount" value={amount} />
    </div>
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
      <Label htmlFor={name} className="text-xs">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
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
    <div className="space-y-2">
      <div>
        <Label className="text-xs">
          Medicare card number <span className="text-red-500">*</span>
        </Label>
        <p className="text-[10px] text-muted-foreground mb-1">
          The 10-digit number printed on the front of the Medicare card
        </p>
        <Input
          placeholder="e.g. 2440 2156 3"
          maxLength={10}
          value={medicareCard}
          onChange={(e) => setMedicareCard(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
        />
      </div>
      <div>
        <Label className="text-xs">
          Reference number (IRN) <span className="text-red-500">*</span>
        </Label>
        <p className="text-[10px] text-muted-foreground mb-1">
          The single digit next to your child&apos;s name on the Medicare card (1-9)
        </p>
        <Input
          placeholder="e.g. 5"
          maxLength={1}
          value={medicareRef}
          onChange={(e) => setMedicareRef(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          className="w-20"
        />
      </div>
      <input type="hidden" name="medicare_number" value={fullMedicare} />
    </div>
  )
}

function TogglePills({
  name,
  label,
  options,
  defaultValue = '',
  required,
}: {
  name: string
  label: string
  options: string[]
  defaultValue?: string
  required?: boolean
}) {
  const [selected, setSelected] = useState(defaultValue)

  return (
    <div>
      <Label className="text-xs">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setSelected(opt)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-all',
              selected === opt
                ? 'bg-primary text-white shadow-sm'
                : 'border border-border text-foreground hover:bg-muted/50',
            )}
          >
            {opt}
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={selected} />
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
  const postcodeMatch = address.match(/\b(\d{4})\s*$/)
  const postcode = postcodeMatch?.[1] ?? ''
  const withoutPostcode = postcodeMatch ? address.slice(0, postcodeMatch.index).trim().replace(/,\s*$/, '') : address
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
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}
