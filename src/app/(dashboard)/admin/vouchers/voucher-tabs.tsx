'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/currency'
import {
  Ticket, FileImage, FileText, Plus, Download, Send,
  Check, X, Eye, ChevronDown, ChevronRight, Package,
} from 'lucide-react'
import {
  createBatch, addToBatch, removeFromBatch, markBatchSubmitted,
  downloadBatchCsv, rejectVoucher, approveVouchers, saveExtractedData,
} from './actions'
import { extractVoucherData } from './ai-extract-action'

type TabId = 'pending' | 'batches' | 'payments' | 'history'
type Voucher = {
  id: string
  family_id: string
  player_id: string | null
  amount_cents: number
  status: string
  submitted_at: string | null
  reviewed_at: string | null
  submission_method: string
  file_path: string | null
  form_pdf_path: string | null
  batch_id: string | null
  voucher_number: number
  linked_voucher_id: string | null
  child_first_name: string | null
  child_surname: string | null
  child_gender: string | null
  child_dob: string | null
  street_address: string | null
  suburb: string | null
  postcode: string | null
  visa_number: string | null
  medicare_number: string | null
  parent_first_name: string | null
  parent_surname: string | null
  parent_contact_number: string | null
  parent_email: string | null
  first_time: boolean | null
  has_disability: boolean | null
  is_indigenous: boolean | null
  english_main_language: boolean | null
  other_language: string | null
  activity_cost: string | null
  rejection_reason: string | null
  notes: string | null
}
type Batch = {
  id: string
  batch_number: number
  status: string
  submitted_at: string | null
  processed_at: string | null
  notes: string | null
  created_at: string | null
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'batches', label: 'CSV Batches' },
  { id: 'payments', label: 'Process Payments' },
  { id: 'history', label: 'History' },
]

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-800',
  in_batch: 'bg-blue-100 text-blue-800',
  submitted_to_portal: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

export function VoucherTabs({
  vouchers,
  batches,
  familyNames,
  batchVoucherCounts,
  initialTab,
}: {
  vouchers: Voucher[]
  batches: Batch[]
  familyNames: Record<string, string>
  batchVoucherCounts: Record<string, number>
  initialTab: string
}) {
  const [activeTab, setActiveTab] = useState<TabId>((initialTab as TabId) || 'pending')

  const pendingVouchers = vouchers.filter(v => v.status === 'submitted')
  const portalVouchers = vouchers.filter(v => v.status === 'submitted_to_portal')
  const pendingCount = pendingVouchers.length
  const portalCount = portalVouchers.length

  return (
    <div className="mt-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border pb-px">
        {TABS.map((tab) => {
          const badge = tab.id === 'pending' ? pendingCount
            : tab.id === 'payments' ? portalCount
            : 0
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-foreground border-b-2 border-primary -mb-px'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {badge > 0 && (
                <span className="ml-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {activeTab === 'pending' && (
          <PendingTab vouchers={pendingVouchers} familyNames={familyNames} batches={batches.filter(b => b.status === 'draft')} />
        )}
        {activeTab === 'batches' && (
          <BatchesTab batches={batches} vouchers={vouchers} familyNames={familyNames} batchVoucherCounts={batchVoucherCounts} />
        )}
        {activeTab === 'payments' && (
          <PaymentsTab vouchers={portalVouchers} familyNames={familyNames} />
        )}
        {activeTab === 'history' && (
          <HistoryTab vouchers={vouchers} familyNames={familyNames} />
        )}
      </div>
    </div>
  )
}

// ── Pending Tab ──

function PendingTab({
  vouchers,
  familyNames,
  batches,
}: {
  vouchers: Voucher[]
  familyNames: Record<string, string>
  batches: Batch[]
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (vouchers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <Ticket className="mx-auto size-8 opacity-40" />
        <p className="mt-2">No pending vouchers</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {vouchers.map((v) => {
        const childName = v.child_first_name ? `${v.child_first_name} ${v.child_surname ?? ''}`.trim() : 'Unknown child'
        const familyName = familyNames[v.family_id] ?? 'Unknown'
        const isExpanded = expandedId === v.id
        const isRejecting = rejectId === v.id

        return (
          <Card key={v.id}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'mt-0.5 flex size-8 items-center justify-center rounded-lg',
                    v.submission_method === 'image' ? 'bg-blue-100' : 'bg-green-100',
                  )}>
                    {v.submission_method === 'image' ? (
                      <FileImage className="size-4 text-blue-700" />
                    ) : (
                      <FileText className="size-4 text-green-700" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{familyName}</p>
                    <p className="text-sm text-muted-foreground">
                      {childName} - {formatCurrency(v.amount_cents)}
                      {v.voucher_number === 2 && <span className="ml-1 text-xs">(2nd voucher)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.submitted_at ? new Date(v.submitted_at).toLocaleDateString('en-AU') : '-'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {v.submission_method === 'image' && v.file_path && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/api/admin/voucher-file?path=${encodeURIComponent(v.file_path!)}`, '_blank')}
                    >
                      <Eye className="size-3.5 mr-1" />
                      View
                    </Button>
                  )}
                  {v.submission_method === 'form' && v.form_pdf_path && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/api/admin/voucher-file?path=${encodeURIComponent(v.form_pdf_path!)}`, '_blank')}
                    >
                      <Download className="size-3.5 mr-1" />
                      PDF
                    </Button>
                  )}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : v.id)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded: show form data or AI extract */}
              {isExpanded && (
                <div className="mt-3 border-t border-border pt-3">
                  {v.submission_method === 'form' && v.child_first_name ? (
                    <VoucherDataGrid voucher={v} />
                  ) : v.submission_method === 'image' ? (
                    <ImageVoucherActions voucher={v} />
                  ) : null}
                </div>
              )}

              {/* Actions row */}
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                {batches.length > 0 && v.child_first_name && (
                  <form action={() => startTransition(() => addToBatch(v.id, batches[0].id))}>
                    <Button type="submit" size="sm" disabled={isPending}>
                      <Plus className="size-3.5 mr-1" />
                      Add to Batch #{batches[0].batch_number}
                    </Button>
                  </form>
                )}
                {!isRejecting ? (
                  <Button size="sm" variant="outline" onClick={() => setRejectId(v.id)}>
                    <X className="size-3.5 mr-1" />
                    Reject
                  </Button>
                ) : (
                  <form action={rejectVoucher.bind(null, v.id)} className="flex items-center gap-2">
                    <Input name="reason" placeholder="Reason for rejection" className="h-8 w-48 text-xs" />
                    <Button type="submit" size="sm" variant="destructive">Confirm</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRejectId(null)}>Cancel</Button>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── Voucher Data Grid (for form submissions) ──

function VoucherDataGrid({ voucher: v }: { voucher: Voucher }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
      <DataRow label="Child" value={`${v.child_first_name} ${v.child_surname}`} />
      <DataRow label="DOB" value={v.child_dob} />
      <DataRow label="Gender" value={v.child_gender} />
      <DataRow label="Medicare" value={v.medicare_number} />
      <DataRow label="Visa" value={v.visa_number} />
      <DataRow label="Parent" value={`${v.parent_first_name} ${v.parent_surname}`} />
      <DataRow label="Address" value={`${v.street_address}, ${v.suburb} ${v.postcode}`} />
      <DataRow label="Phone" value={v.parent_contact_number} />
      <DataRow label="Email" value={v.parent_email} />
      <DataRow label="First time?" value={v.first_time ? 'Yes' : 'No'} />
      <DataRow label="Disability?" value={v.has_disability ? 'Yes' : 'No'} />
      <DataRow label="Indigenous?" value={v.is_indigenous ? 'Yes' : 'No'} />
      <DataRow label="English?" value={v.english_main_language ? 'Yes' : 'No'} />
      {v.other_language && <DataRow label="Language" value={v.other_language} />}
      <DataRow label="Activity cost" value={v.activity_cost ? `$${v.activity_cost}` : null} />
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-muted-foreground whitespace-nowrap">{label}:</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  )
}

// ── Image Voucher Actions (AI extraction) ──

function ImageVoucherActions({ voucher }: { voucher: Voucher }) {
  const [extractedData, setExtractedData] = useState<Record<string, string> | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasData = !!voucher.child_first_name

  if (hasData) {
    return <VoucherDataGrid voucher={voucher} />
  }

  return (
    <div className="space-y-3">
      {!extractedData ? (
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={isExtracting}
            onClick={async () => {
              if (!voucher.file_path) return
              setIsExtracting(true)
              setError(null)
              try {
                const result = await extractVoucherData(voucher.id)
                if ('error' in result) {
                  setError(result.error)
                } else {
                  setExtractedData(result.data as unknown as Record<string, string>)
                }
              } catch {
                setError('AI extraction failed')
              } finally {
                setIsExtracting(false)
              }
            }}
          >
            {isExtracting ? 'Extracting...' : 'Extract with AI'}
          </Button>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            Uses AI to read the voucher form and extract all fields
          </p>
        </div>
      ) : (
        <form action={saveExtractedData.bind(null, voucher.id)} className="space-y-3">
          <p className="text-xs font-medium text-foreground">Review extracted data:</p>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(extractedData).map(([key, value]) => (
              <div key={key}>
                <Label className="text-[10px] text-muted-foreground">{key.replace(/_/g, ' ')}</Label>
                <Input name={key} defaultValue={value} className="h-7 text-xs" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              <Check className="size-3.5 mr-1" />
              Save Data
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setExtractedData(null)}>
              Discard
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Batches Tab ──

function BatchesTab({
  batches,
  vouchers,
  familyNames,
  batchVoucherCounts,
}: {
  batches: Batch[]
  vouchers: Voucher[]
  familyNames: Record<string, string>
  batchVoucherCounts: Record<string, number>
}) {
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="space-y-4">
      <form action={createBatch}>
        <Button type="submit" size="sm">
          <Plus className="size-3.5 mr-1" />
          Create New Batch
        </Button>
      </form>

      {batches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Package className="mx-auto size-8 opacity-40" />
          <p className="mt-2">No batches yet. Create one to start grouping vouchers for CSV export.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => {
            const count = batchVoucherCounts[batch.id] ?? 0
            const batchVouchers = vouchers.filter(v => v.batch_id === batch.id)
            const isExpanded = expandedBatch === batch.id
            const statusColor = batch.status === 'draft' ? 'bg-yellow-100 text-yellow-800'
              : batch.status === 'submitted' ? 'bg-purple-100 text-purple-800'
              : 'bg-green-100 text-green-800'

            return (
              <Card key={batch.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setExpandedBatch(isExpanded ? null : batch.id)}
                      className="flex items-center gap-3 text-left"
                    >
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      <div>
                        <p className="font-medium text-foreground">Batch #{batch.batch_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {count} voucher{count !== 1 ? 's' : ''} - {formatCurrency(count * 10000)}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusColor)}>
                        {batch.status}
                      </span>
                      {count > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={async () => {
                            const csv = await downloadBatchCsv(batch.id)
                            if (csv) {
                              const blob = new Blob([csv], { type: 'text/csv' })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = `sports-vouchers-batch-${batch.batch_number}.csv`
                              a.click()
                              URL.revokeObjectURL(url)
                            }
                          }}
                        >
                          <Download className="size-3.5 mr-1" />
                          CSV
                        </Button>
                      )}
                      {batch.status === 'draft' && count > 0 && (
                        <form action={() => startTransition(() => markBatchSubmitted(batch.id))}>
                          <Button type="submit" size="sm" disabled={isPending}>
                            <Send className="size-3.5 mr-1" />
                            Mark Submitted
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>

                  {isExpanded && batchVouchers.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-1 pr-3">Child</th>
                              <th className="pb-1 pr-3">DOB</th>
                              <th className="pb-1 pr-3">Gender</th>
                              <th className="pb-1 pr-3">Medicare</th>
                              <th className="pb-1 pr-3">Parent</th>
                              <th className="pb-1 pr-3">Family</th>
                              <th className="pb-1 pr-3">Cost</th>
                              {batch.status === 'draft' && <th className="pb-1"></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {batchVouchers.map((v) => (
                              <tr key={v.id} className="border-b border-border/50">
                                <td className="py-1.5 pr-3 font-medium">{v.child_first_name} {v.child_surname}</td>
                                <td className="py-1.5 pr-3">{v.child_dob}</td>
                                <td className="py-1.5 pr-3">{v.child_gender}</td>
                                <td className="py-1.5 pr-3 font-mono">{v.medicare_number}</td>
                                <td className="py-1.5 pr-3">{v.parent_first_name} {v.parent_surname}</td>
                                <td className="py-1.5 pr-3">{familyNames[v.family_id]}</td>
                                <td className="py-1.5 pr-3">${v.activity_cost}</td>
                                {batch.status === 'draft' && (
                                  <td className="py-1.5">
                                    <form action={() => startTransition(() => removeFromBatch(v.id))}>
                                      <button type="submit" className="text-red-500 hover:text-red-700" disabled={isPending}>
                                        <X className="size-3.5" />
                                      </button>
                                    </form>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Payments Tab ──

function PaymentsTab({
  vouchers,
  familyNames,
}: {
  vouchers: Voucher[]
  familyNames: Record<string, string>
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === vouchers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(vouchers.map(v => v.id)))
    }
  }

  if (vouchers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <Ticket className="mx-auto size-8 opacity-40" />
        <p className="mt-2">No vouchers awaiting payment confirmation</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Select vouchers where payment has been received from SA Sports Vouchers
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={toggleAll}>
            {selectedIds.size === vouchers.length ? 'Deselect All' : 'Select All'}
          </Button>
          <Button
            size="sm"
            disabled={selectedIds.size === 0 || isPending}
            onClick={() => startTransition(() => approveVouchers(Array.from(selectedIds)))}
          >
            <Check className="size-3.5 mr-1" />
            Approve Selected ({selectedIds.size})
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {vouchers.map((v) => {
          const childName = v.child_first_name ? `${v.child_first_name} ${v.child_surname ?? ''}`.trim() : 'Unknown'
          return (
            <label
              key={v.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors',
                selectedIds.has(v.id) ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/30',
              )}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(v.id)}
                onChange={() => toggleId(v.id)}
                className="accent-primary"
              />
              <div className="flex-1">
                <p className="font-medium text-foreground">{familyNames[v.family_id]} - {childName}</p>
                <p className="text-xs text-muted-foreground">
                  Medicare: {v.medicare_number ?? '-'}
                  {v.voucher_number === 2 && ' (2nd voucher)'}
                </p>
              </div>
              <span className="tabular-nums font-medium">{formatCurrency(v.amount_cents)}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

// ── History Tab ──

function HistoryTab({
  vouchers,
  familyNames,
}: {
  vouchers: Voucher[]
  familyNames: Record<string, string>
}) {
  const [filter, setFilter] = useState<string>('all')

  const filtered = filter === 'all' ? vouchers : vouchers.filter(v => v.status === filter)

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {['all', 'submitted', 'in_batch', 'submitted_to_portal', 'approved', 'rejected'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-all',
              filter === s
                ? 'bg-primary text-white'
                : 'border border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No vouchers match this filter</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const childName = v.child_first_name ? `${v.child_first_name} ${v.child_surname ?? ''}`.trim() : 'Unknown'
            const statusColor = STATUS_COLORS[v.status] ?? 'bg-muted text-foreground'
            return (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">
                    {familyNames[v.family_id]} - {childName}
                    {v.voucher_number === 2 && <span className="text-xs text-muted-foreground ml-1">(2nd)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.submitted_at ? new Date(v.submitted_at).toLocaleDateString('en-AU') : '-'}
                    {v.submission_method === 'image' ? ' (uploaded)' : ' (form)'}
                    {v.rejection_reason && ` - ${v.rejection_reason}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{formatCurrency(v.amount_cents)}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusColor)}>
                    {v.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
