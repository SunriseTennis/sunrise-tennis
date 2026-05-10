'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Link from 'next/link'
import {
  LogIn,
  LogOut,
  UserPlus,
  XCircle,
  Link2,
  Shield,
  Database,
  AlertTriangle,
  Monitor,
  Search,
  X as XIcon,
  Users as UsersIcon,
  Award,
} from 'lucide-react'
import { isTestEmail } from '@/lib/utils/test-emails'

// ── Types ──

interface AuthEvent {
  id: string
  user_id: string | null
  email: string
  event_type: string
  method: string | null
  success: boolean
  ip_address: unknown
  user_agent: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any
  created_at: string | null
}

interface AuditEntry {
  id: string
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  old_values: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new_values: any
  created_at: string | null
}

interface UserDirectoryEntry {
  id: string
  email: string
  full_name: string
  roles: string[]
  family_id: string | null
  coach_id: string | null
  created_at: string
  last_sign_in_at: string
  email_confirmed_at: string
  banned_until: string
}

interface SecurityAlert {
  email: string
  failed_count: number
  last_attempt: string
  ip_addresses: string[]
}

interface ActiveSession {
  session_id: string
  user_id: string
  email: string
  full_name: string
  ip: unknown
  user_agent: string
  created_at: string
  refreshed_at: string
}

interface ActivityTabsProps {
  authEvents: AuthEvent[]
  auditLog: AuditEntry[]
  userDirectory: UserDirectoryEntry[]
  securityAlerts: SecurityAlert[]
  activeSessions: ActiveSession[]
  uninvitedSignups: AuthEvent[]
  userMap: Record<string, string>
  /** User IDs of users with role='admin'. Used by "Customers only" filter. */
  adminUserIds: string[]
}

type ActorFilter = 'all' | 'customers' | 'specific'

// ── Helpers ──

const tabs = [
  { id: 'activity', label: 'Recent Activity' },
  { id: 'users', label: 'Users' },
  { id: 'logins', label: 'Login History' },
  { id: 'security', label: 'Security' },
] as const

type TabId = typeof tabs[number]['id']

function formatTime(iso: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`

  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFullTime(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function authEventIcon(type: string, success: boolean) {
  if (!success) return <XCircle className="size-4 text-danger" />
  switch (type) {
    case 'login': return <LogIn className="size-4 text-success" />
    case 'login_failed': return <XCircle className="size-4 text-danger" />
    case 'signup': return <UserPlus className="size-4 text-info" />
    case 'signout': return <LogOut className="size-4 text-muted-foreground" />
    case 'magic_link_request': return <Link2 className="size-4 text-info" />
    default: return <Shield className="size-4 text-muted-foreground" />
  }
}

function authEventLabel(type: string, success: boolean) {
  if (!success && type !== 'login_failed') return `${type} (failed)`
  switch (type) {
    case 'login': return 'Signed in'
    case 'login_failed': return 'Failed login'
    case 'signup': return 'Registered'
    case 'signout': return 'Signed out'
    case 'magic_link_request': return 'Magic link sent'
    default: return type
  }
}

function auditActionLabel(action: string, entityType: string) {
  const entity = entityType.replace(/_/g, ' ')
  switch (action) {
    case 'INSERT': return `Created ${entity}`
    case 'UPDATE': return `Updated ${entity}`
    case 'DELETE': return `Deleted ${entity}`
    default: return `${action} ${entity}`
  }
}

function truncateUA(ua: string | null) {
  if (!ua) return '-'
  if (ua.length <= 60) return ua
  return ua.slice(0, 57) + '...'
}

// ── Component ──

export function ActivityTabs({
  authEvents,
  auditLog,
  userDirectory,
  securityAlerts,
  activeSessions,
  uninvitedSignups,
  userMap,
  adminUserIds,
}: ActivityTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('activity')
  const [userSearch, setUserSearch] = useState('')
  const [loginFilter, setLoginFilter] = useState<'all' | 'success' | 'failed'>('all')
  const [activityFilter, setActivityFilter] = useState<'all' | 'auth' | 'data'>('all')
  const [actorFilter, setActorFilter] = useState<ActorFilter>('all')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  // Set of admin user IDs — quick lookup for filter exclusion.
  const adminIdSet = useMemo(() => new Set(adminUserIds), [adminUserIds])

  // userId → email lookup. Built off the directory (full_name is in userMap
  // already; we need email separately to apply isTestEmail).
  const userEmailMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const u of userDirectory) {
      if (u.id) m[u.id] = u.email
    }
    return m
  }, [userDirectory])

  function drillIntoUser(userId: string) {
    setSelectedUserId(userId)
    setActorFilter('specific')
    setActiveTab('activity')
  }

  // ── Combined activity feed ──
  const combinedFeed = useMemo(() => {
    const items: Array<{
      id: string
      source: 'auth' | 'data'
      userId: string | null
      label: string
      actor: string
      icon: React.ReactNode
      time: string | null
      detail?: string
      success?: boolean
    }> = []

    if (activityFilter !== 'data') {
      for (const e of authEvents) {
        items.push({
          id: `auth-${e.id}`,
          source: 'auth',
          userId: e.user_id,
          label: authEventLabel(e.event_type, e.success),
          actor: e.email,
          icon: authEventIcon(e.event_type, e.success),
          time: e.created_at,
          detail: e.method ? `via ${e.method}` : undefined,
          success: e.success,
        })
      }
    }

    if (activityFilter !== 'auth') {
      for (const a of auditLog) {
        items.push({
          id: `data-${a.id}`,
          source: 'data',
          userId: a.user_id,
          label: auditActionLabel(a.action, a.entity_type),
          actor: a.user_id ? (userMap[a.user_id] ?? a.user_id.slice(0, 8)) : 'system',
          icon: <Database className="size-4 text-muted-foreground" />,
          time: a.created_at,
        })
      }
    }

    // Actor filter applied here so the feed pre-filter is the cap, not the cap-then-trim.
    const filtered = items.filter((item) => {
      if (actorFilter === 'specific') {
        return item.userId === selectedUserId
      }
      if (actorFilter === 'customers') {
        if (!item.userId) return false                         // exclude system rows
        if (adminIdSet.has(item.userId)) return false          // exclude admins
        const email = userEmailMap[item.userId] ?? item.actor  // auth events carry email; audit rows resolved via map
        if (isTestEmail(email)) return false                   // exclude test/seed accounts
        return true
      }
      return true
    })

    filtered.sort((a, b) => new Date(b.time ?? 0).getTime() - new Date(a.time ?? 0).getTime())
    return filtered.slice(0, 200)
  }, [authEvents, auditLog, userMap, activityFilter, actorFilter, selectedUserId, adminIdSet, userEmailMap])

  // ── Filtered users ──
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return userDirectory
    const q = userSearch.toLowerCase()
    return userDirectory.filter(
      (u) => u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q)
    )
  }, [userDirectory, userSearch])

  // ── Filtered login history ──
  const filteredLogins = useMemo(() => {
    return authEvents.filter((e) => {
      const isLoginType = ['login', 'login_failed', 'magic_link_request'].includes(e.event_type)
      if (!isLoginType) return false
      if (loginFilter === 'success') return e.success
      if (loginFilter === 'failed') return !e.success
      return true
    })
  }, [authEvents, loginFilter])

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.id === 'security' && securityAlerts.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-danger text-white text-xs size-5">
                {securityAlerts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Recent Activity ── */}
      {activeTab === 'activity' && (
        <div>
          <div className="space-y-2 mb-4">
            {/* Source filter */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">Source:</span>
              {(['all', 'auth', 'data'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setActivityFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activityFilter === f
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'auth' ? 'Auth Only' : 'Data Only'}
                </button>
              ))}
            </div>

            {/* Actor filter */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">Actor:</span>
              {(['all', 'customers', 'specific'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setActorFilter(f)
                    if (f !== 'specific') setSelectedUserId(null)
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    actorFilter === f
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'customers' ? 'Customers Only' : 'Specific User'}
                </button>
              ))}
              {actorFilter === 'specific' && (
                <select
                  value={selectedUserId ?? ''}
                  onChange={(e) => setSelectedUserId(e.target.value || null)}
                  className="ml-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">— Pick a user —</option>
                  {userDirectory
                    .slice()
                    .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {(u.full_name || u.email)}{u.full_name ? ` · ${u.email}` : ''}
                      </option>
                    ))}
                </select>
              )}
              {actorFilter === 'specific' && selectedUserId && (
                <button
                  onClick={() => { setActorFilter('all'); setSelectedUserId(null) }}
                  className="ml-1 inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" /> Clear
                </button>
              )}
            </div>
            {actorFilter === 'customers' && (
              <p className="text-xs text-muted-foreground">
                Hiding admin actions, system changes, and seed/test accounts.
              </p>
            )}

            {/* Quick links to the selected user's family/coach record */}
            {actorFilter === 'specific' && selectedUserId && (() => {
              const u = userDirectory.find((x) => x.id === selectedUserId)
              if (!u) return null
              if (!u.family_id && !u.coach_id) return null
              return (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-xs text-muted-foreground">Open:</span>
                  {u.family_id && (
                    <Link
                      href={`/admin/families/${u.family_id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted/40"
                    >
                      <UsersIcon className="size-3" />
                      Family page
                    </Link>
                  )}
                  {u.coach_id && (
                    <Link
                      href={`/admin/coaches/${u.coach_id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted/40"
                    >
                      <Award className="size-3" />
                      Coach page
                    </Link>
                  )}
                </div>
              )
            })()}
          </div>

          {combinedFeed.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {actorFilter === 'specific' && !selectedUserId
                  ? 'Pick a user to see their activity.'
                  : 'No activity matches the current filters.'}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1">
              {combinedFeed.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-shrink-0">{item.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      {item.userId ? (
                        <button
                          onClick={() => drillIntoUser(item.userId!)}
                          className="font-medium text-sm truncate hover:underline cursor-pointer"
                          title="Show only this user's activity"
                        >
                          {item.actor}
                        </button>
                      ) : (
                        <span className="font-medium text-sm truncate">{item.actor}</span>
                      )}
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      {item.detail && (
                        <span className="text-xs text-muted-foreground">{item.detail}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-xs text-muted-foreground">
                    {formatTime(item.time)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Users ── */}
      {activeTab === 'users' && (
        <div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden sm:table-cell">Name</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="hidden md:table-cell">Last Login</TableHead>
                  <TableHead className="hidden lg:table-cell">Signed Up</TableHead>
                  <TableHead className="hidden md:table-cell">Confirmed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {userSearch ? 'No users match your search.' : 'No registered users.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => (
                    <TableRow
                      key={u.id}
                      onClick={() => drillIntoUser(u.id)}
                      className="cursor-pointer hover:bg-muted/40"
                      title="See this user's activity"
                    >
                      <TableCell className="font-medium text-sm max-w-[200px] truncate">{u.email}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{u.full_name || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {u.roles.length > 0 ? u.roles.map((r) => (
                            <Badge
                              key={r}
                              variant="outline"
                              className={`text-xs capitalize ${
                                r === 'admin' ? 'border-primary text-primary' :
                                r === 'coach' ? 'border-info text-info' :
                                'border-success text-success'
                              }`}
                            >
                              {r}
                            </Badge>
                          )) : (
                            <span className="text-xs text-muted-foreground">none</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {u.last_sign_in_at ? formatTime(u.last_sign_in_at) : 'Never'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {formatFullTime(u.created_at)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {u.email_confirmed_at ? (
                          <Badge variant="outline" className="text-xs border-success text-success">Yes</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-warning text-warning">No</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} registered
          </p>
        </div>
      )}

      {/* ── Tab: Login History ── */}
      {activeTab === 'logins' && (
        <div>
          <div className="flex gap-1 mb-4">
            {(['all', 'success', 'failed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setLoginFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  loginFilter === f
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {f === 'all' ? 'All' : f === 'success' ? 'Successful' : 'Failed'}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Time</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden sm:table-cell">Event</TableHead>
                  <TableHead className="hidden md:table-cell">Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No login events recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogins.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatFullTime(e.created_at)}
                      </TableCell>
                      <TableCell className="font-medium text-sm max-w-[200px] truncate">{e.email}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm capitalize">
                        {e.event_type.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground capitalize">
                        {e.method ?? '-'}
                      </TableCell>
                      <TableCell>
                        {e.success ? (
                          <Badge variant="outline" className="text-xs border-success text-success">OK</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-danger text-danger">Failed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground font-mono">
                        {(e.ip_address as string) ?? '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Tab: Security ── */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Security Alerts */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="size-4" />
              Failed Login Clusters (last 72h)
            </h3>
            {securityAlerts.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  No suspicious login patterns detected.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {securityAlerts.map((alert) => (
                  <Card key={alert.email} className="border-danger/30">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm truncate">{alert.email}</span>
                        <Badge variant="outline" className="text-xs border-danger text-danger">
                          {alert.failed_count} failures
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Last attempt: {formatFullTime(alert.last_attempt)}</div>
                        <div>IPs: {alert.ip_addresses?.join(', ') || 'unknown'}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Uninvited Signups */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <UserPlus className="size-4" />
              Signups Without Invite Link
            </h3>
            {uninvitedSignups.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  All signups used invite links.
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Time</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="hidden sm:table-cell">IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uninvitedSignups.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatFullTime(e.created_at)}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{e.email}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground font-mono">
                          {(e.ip_address as string) ?? '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Logged In Users */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Monitor className="size-4" />
              Logged In Users
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Users whose last auth event was a login (no signout since).
            </p>
            {activeSessions.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  No logged-in users detected.
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>User</TableHead>
                      <TableHead className="hidden sm:table-cell">IP</TableHead>
                      <TableHead className="hidden md:table-cell">Client</TableHead>
                      <TableHead>Last Login</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeSessions.map((s) => (
                      <TableRow key={s.session_id}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{s.full_name || s.email}</div>
                            {s.full_name && (
                              <div className="text-xs text-muted-foreground">{s.email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground font-mono">
                          {(s.ip as string) ?? '-'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                          {truncateUA(s.user_agent)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatTime(s.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {activeSessions.length} user{activeSessions.length !== 1 ? 's' : ''} logged in
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
