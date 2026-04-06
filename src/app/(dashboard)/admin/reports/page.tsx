import { createClient, requireAdmin } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DollarSign, Users, CalendarDays, TrendingUp } from 'lucide-react'
import { ReportTabs } from './report-tabs'

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7) // YYYY-MM
}

export default async function AdminReportsPage() {
  await requireAdmin()
  const supabase = await createClient()

  // Current financial year: Jul 1 - Jun 30
  const now = new Date()
  const fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  const fyStart = `${fyStartYear}-07-01`
  const fyEnd = `${fyStartYear + 1}-06-30`
  const fyLabel = `FY${fyStartYear + 1}`

  const [
    { data: payments },
    { data: charges },
    { data: sessions },
    { data: attendances },
    { data: programs },
    { data: families },
  ] = await Promise.all([
    // All payments in current FY
    supabase
      .from('payments')
      .select('id, amount_cents, payment_method, received_at, family_id, category')
      .gte('received_at', fyStart)
      .lte('received_at', fyEnd)
      .order('received_at', { ascending: true }),
    // All charges in current FY
    supabase
      .from('charges')
      .select('id, amount_cents, status, created_at, source_type, program_id, family_id')
      .gte('created_at', fyStart)
      .lte('created_at', fyEnd)
      .neq('status', 'voided'),
    // All sessions in current FY
    supabase
      .from('sessions')
      .select('id, date, status, program_id, session_type')
      .gte('date', fyStart)
      .lte('date', fyEnd),
    // All attendance records in current FY (join with sessions for dates)
    supabase
      .from('attendances')
      .select('id, status, session_id, player_id, sessions!inner(date, program_id)')
      .gte('sessions.date', fyStart)
      .lte('sessions.date', fyEnd),
    // Programs for names
    supabase
      .from('programs')
      .select('id, name, type, level'),
    // Families
    supabase
      .from('families')
      .select('id, display_id, family_name'),
  ])

  // ── Financial summaries ──────────────────────────────────────────
  const totalIncome = (payments ?? []).reduce((sum, p) => sum + p.amount_cents, 0)
  const totalCharges = (charges ?? []).reduce((sum, c) => sum + c.amount_cents, 0)
  const totalOutstanding = totalCharges - totalIncome

  // Income by month
  const incomeByMonth: Record<string, number> = {}
  for (const p of payments ?? []) {
    const key = getMonthKey(p.received_at ?? '')
    if (key) incomeByMonth[key] = (incomeByMonth[key] ?? 0) + p.amount_cents
  }

  // Income by payment method
  const incomeByMethod: Record<string, number> = {}
  for (const p of payments ?? []) {
    const method = p.payment_method || 'unknown'
    incomeByMethod[method] = (incomeByMethod[method] ?? 0) + p.amount_cents
  }

  // Charges by program
  const programMap = new Map((programs ?? []).map((p) => [p.id, p]))
  const chargesByProgram: Record<string, { name: string; total: number; count: number }> = {}
  for (const c of charges ?? []) {
    const pid = c.program_id ?? 'other'
    const prog = programMap.get(pid)
    const name = prog?.name ?? (c.source_type === 'private' ? 'Private Lessons' : 'Other')
    if (!chargesByProgram[pid]) chargesByProgram[pid] = { name, total: 0, count: 0 }
    chargesByProgram[pid].total += c.amount_cents
    chargesByProgram[pid].count++
  }

  // ── Attendance summaries ─────────────────────────────────────────
  const totalSessions = (sessions ?? []).filter((s) => s.status === 'completed').length
  const scheduledSessions = (sessions ?? []).filter((s) => s.status === 'scheduled').length
  const cancelledSessions = (sessions ?? []).filter((s) => s.status === 'cancelled').length

  const attendanceRecords = attendances ?? []
  const totalPresent = attendanceRecords.filter((a) => a.status === 'present').length
  const totalAbsent = attendanceRecords.filter((a) => a.status === 'absent').length
  const totalAttendance = totalPresent + totalAbsent
  const attendanceRate = totalAttendance > 0 ? Math.round((totalPresent / totalAttendance) * 100) : 0

  // Attendance by program
  const attendanceByProgram: Record<string, { name: string; present: number; absent: number }> = {}
  for (const a of attendanceRecords) {
    const session = a.sessions as unknown as { date: string; program_id: string | null }
    const pid = session?.program_id ?? 'other'
    const prog = programMap.get(pid)
    const name = prog?.name ?? 'Other'
    if (!attendanceByProgram[pid]) attendanceByProgram[pid] = { name, present: 0, absent: 0 }
    if (a.status === 'present') attendanceByProgram[pid].present++
    else if (a.status === 'absent') attendanceByProgram[pid].absent++
  }

  // Sorted month keys
  const monthKeys = Object.keys(incomeByMonth).sort()

  // Build data objects for client component
  const financialData = {
    totalIncome,
    totalCharges,
    totalOutstanding,
    fyLabel,
    incomeByMonth: monthKeys.map((k) => ({
      month: getMonthLabel(k + '-01'),
      amount: incomeByMonth[k],
    })),
    incomeByMethod: Object.entries(incomeByMethod)
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount),
    chargesByProgram: Object.values(chargesByProgram)
      .sort((a, b) => b.total - a.total),
  }

  const attendanceData = {
    totalSessions,
    scheduledSessions,
    cancelledSessions,
    attendanceRate,
    totalPresent,
    totalAbsent,
    byProgram: Object.values(attendanceByProgram)
      .map((p) => ({
        ...p,
        rate: p.present + p.absent > 0 ? Math.round((p.present / (p.present + p.absent)) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate),
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`Financial and attendance reports for ${fyLabel}.`}
      />

      <ReportTabs financial={financialData} attendance={attendanceData} />
    </div>
  )
}
