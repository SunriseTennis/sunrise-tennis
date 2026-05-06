'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/status-badge'
import { formatCurrency } from '@/lib/utils/currency'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

type ConnectionState = 'connected' | 'invited' | 'invite_expired' | 'not_invited' | 'no_email'

interface FamilyRow {
  id: string
  displayId: string
  familyName: string
  contactName: string
  contactPhone: string
  status: string
  balanceCents: number
  confirmedBalanceCents: number
  projectedBalanceCents: number
  playerNames: string[]
  connectionState: ConnectionState
  pendingExpiresAt: string | null
}

type SortKey = 'displayId' | 'familyName' | 'contactName' | 'status' | 'currentBalance' | 'upcomingBalance' | 'connection'

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connected:      'Connected',
  invited:        'Invited',
  invite_expired: 'Invite expired',
  not_invited:    'Not invited',
  no_email:       'No email',
}

const CONNECTION_STYLES: Record<ConnectionState, string> = {
  connected:      'bg-success/10 text-success border-success/30',
  invited:        'bg-sky-100 text-sky-700 border-sky-300',
  invite_expired: 'bg-warning/10 text-warning border-warning/40',
  not_invited:    'bg-muted text-muted-foreground border-border',
  no_email:       'bg-danger/10 text-danger border-danger/30',
}

const CONNECTION_SORT_ORDER: Record<ConnectionState, number> = {
  connected:      0,
  invited:        1,
  invite_expired: 2,
  not_invited:    3,
  no_email:       4,
}

export function FamiliesTable({ families }: { families: FamilyRow[] }) {
  const [search, setSearch] = useState('')
  const [connectionFilter, setConnectionFilter] = useState<'all' | ConnectionState>('all')
  const [sortKey, setSortKey] = useState<SortKey>('displayId')
  const [sortAsc, setSortAsc] = useState(true)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const filtered = useMemo(() => {
    let list = families
    if (connectionFilter !== 'all') {
      list = list.filter(f => f.connectionState === connectionFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(f =>
        f.familyName.toLowerCase().includes(q) ||
        f.contactName.toLowerCase().includes(q) ||
        f.contactPhone.includes(q) ||
        f.displayId.toLowerCase().includes(q) ||
        f.playerNames.some(name => name.toLowerCase().includes(q))
      )
    }
    return list
  }, [families, search, connectionFilter])

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'displayId':
          return dir * a.displayId.localeCompare(b.displayId)
        case 'familyName':
          return dir * a.familyName.localeCompare(b.familyName)
        case 'contactName':
          return dir * a.contactName.localeCompare(b.contactName)
        case 'status':
          return dir * a.status.localeCompare(b.status)
        case 'currentBalance':
          return dir * (a.confirmedBalanceCents - b.confirmedBalanceCents)
        case 'upcomingBalance':
          return dir * (a.projectedBalanceCents - b.projectedBalanceCents)
        case 'connection':
          return dir * (CONNECTION_SORT_ORDER[a.connectionState] - CONNECTION_SORT_ORDER[b.connectionState])
        default:
          return 0
      }
    })
  }, [filtered, sortKey, sortAsc])

  const counts = useMemo(() => {
    const c: Record<ConnectionState, number> = {
      connected: 0, invited: 0, invite_expired: 0, not_invited: 0, no_email: 0,
    }
    for (const f of families) c[f.connectionState]++
    return c
  }, [families])

  const SortHeader = ({ label, sortId }: { label: string; sortId: SortKey }) => (
    <button
      onClick={() => toggleSort(sortId)}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}
      <ArrowUpDown className={`size-3 ${sortKey === sortId ? 'text-primary' : 'text-muted-foreground/50'}`} />
    </button>
  )

  const selectClasses = 'rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div className="mt-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by family, contact, or player name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={connectionFilter}
          onChange={(e) => setConnectionFilter(e.target.value as typeof connectionFilter)}
          className={selectClasses}
        >
          <option value="all">All connection states</option>
          <option value="connected">Connected ({counts.connected})</option>
          <option value="invited">Invited ({counts.invited})</option>
          <option value="invite_expired">Invite expired ({counts.invite_expired})</option>
          <option value="not_invited">Not invited ({counts.not_invited})</option>
          <option value="no_email">No email ({counts.no_email})</option>
        </select>
        <span className="text-sm text-muted-foreground">{sorted.length} families</span>
      </div>

      {/* Mobile cards */}
      <div className="mt-4 space-y-3 md:hidden">
        {sorted.map((f) => (
          <Link
            key={f.id}
            href={`/admin/families/${f.id}`}
            className="block rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/30"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-foreground">{f.familyName}</p>
                <p className="text-xs text-muted-foreground">{f.displayId}</p>
              </div>
              <StatusBadge status={f.status} />
            </div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>{f.contactName}</span>
                <div className="flex items-center gap-3">
                  {f.confirmedBalanceCents !== 0 && (
                    <span className={`text-xs tabular-nums ${f.confirmedBalanceCents < 0 ? 'text-danger' : 'text-muted-foreground'}`}>
                      Current: {formatCurrency(f.confirmedBalanceCents)}
                    </span>
                  )}
                  {f.projectedBalanceCents !== 0 && (
                    <span className={`font-medium tabular-nums ${f.projectedBalanceCents < 0 ? 'text-danger' : 'text-foreground'}`}>
                      {formatCurrency(f.projectedBalanceCents)}
                    </span>
                  )}
                </div>
              </div>
              {f.contactPhone && (
                <p className="text-xs">{f.contactPhone}</p>
              )}
              <div>
                <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', CONNECTION_STYLES[f.connectionState])}>
                  {CONNECTION_LABEL[f.connectionState]}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop table */}
      <div className="mt-4 hidden overflow-hidden rounded-lg border border-border bg-card shadow-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead><SortHeader label="ID" sortId="displayId" /></TableHead>
              <TableHead><SortHeader label="Family Name" sortId="familyName" /></TableHead>
              <TableHead><SortHeader label="Primary Contact" sortId="contactName" /></TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead><SortHeader label="Status" sortId="status" /></TableHead>
              <TableHead><SortHeader label="Connection" sortId="connection" /></TableHead>
              <TableHead className="text-right"><SortHeader label="Current" sortId="currentBalance" /></TableHead>
              <TableHead className="text-right"><SortHeader label="Upcoming" sortId="upcomingBalance" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((f) => {
              const expiryHint =
                f.connectionState === 'invited' && f.pendingExpiresAt
                  ? `Expires ${new Date(f.pendingExpiresAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}`
                  : f.connectionState === 'invite_expired' && f.pendingExpiresAt
                  ? `Expired ${new Date(f.pendingExpiresAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}`
                  : null
              return (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/families/${f.id}`} className="hover:text-primary transition-colors">
                      {f.displayId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/families/${f.id}`} className="font-medium hover:text-primary transition-colors">
                      {f.familyName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {f.contactName || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {f.contactPhone || '-'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={f.status} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', CONNECTION_STYLES[f.connectionState])}
                      title={expiryHint ?? undefined}
                    >
                      {CONNECTION_LABEL[f.connectionState]}
                    </span>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${f.confirmedBalanceCents < 0 ? 'text-danger' : 'text-muted-foreground'}`}>
                    {f.confirmedBalanceCents !== 0 ? formatCurrency(f.confirmedBalanceCents) : '-'}
                  </TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${f.projectedBalanceCents < 0 ? 'text-danger' : 'text-foreground'}`}>
                    {f.projectedBalanceCents !== 0 ? formatCurrency(f.projectedBalanceCents) : '-'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
