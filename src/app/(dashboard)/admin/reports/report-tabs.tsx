'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
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

interface FinancialData {
  totalIncome: number
  totalCharges: number
  totalOutstanding: number
  fyLabel: string
  incomeByMonth: { month: string; amount: number }[]
  incomeByMethod: { method: string; amount: number }[]
  chargesByProgram: { name: string; total: number; count: number }[]
}

interface AttendanceData {
  totalSessions: number
  scheduledSessions: number
  cancelledSessions: number
  attendanceRate: number
  totalPresent: number
  totalAbsent: number
  byProgram: { name: string; present: number; absent: number; rate: number }[]
}

interface ReportTabsProps {
  financial: FinancialData
  attendance: AttendanceData
}

const METHOD_LABELS: Record<string, string> = {
  card: 'Card (Square)',
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  voucher: 'Sports Voucher',
  credit: 'Credit/Adjustment',
  unknown: 'Unknown',
}

export function ReportTabs({ financial, attendance }: ReportTabsProps) {
  const [tab, setTab] = useState<'financial' | 'attendance'>('financial')

  return (
    <>
      {/* Tab switcher */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setTab('financial')}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'financial' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          <DollarSign className="size-3.5" />
          Financial
        </button>
        <button
          onClick={() => setTab('attendance')}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'attendance' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          <Users className="size-3.5" />
          Attendance
        </button>
      </div>

      {tab === 'financial' ? (
        <div className="mt-6 space-y-6 animate-fade-up">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard
              label={`Income ${financial.fyLabel}`}
              value={formatCurrency(financial.totalIncome)}
              icon={DollarSign}
              variant="success"
            />
            <StatCard
              label="Charges Billed"
              value={formatCurrency(financial.totalCharges)}
              icon={TrendingUp}
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(financial.totalOutstanding)}
              icon={DollarSign}
              variant={financial.totalOutstanding > 0 ? 'danger' : 'success'}
            />
          </div>

          {/* Income by month */}
          {financial.incomeByMonth.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Income by Month</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-1/2">
                      <span className="sr-only">Bar</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financial.incomeByMonth.map((row) => {
                    const maxAmount = Math.max(...financial.incomeByMonth.map((r) => r.amount), 1)
                    const pct = (row.amount / maxAmount) * 100
                    return (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{row.month}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.amount)}</TableCell>
                        <TableCell>
                          <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#2B5EA7] to-[#E87450] transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Income by payment method */}
          {financial.incomeByMethod.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Income by Payment Method</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financial.incomeByMethod.map((row) => (
                    <TableRow key={row.method}>
                      <TableCell className="font-medium capitalize">
                        {METHOD_LABELS[row.method] ?? row.method.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {financial.totalIncome > 0 ? Math.round((row.amount / financial.totalIncome) * 100) : 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Revenue by program */}
          {financial.chargesByProgram.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Revenue by Program</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Program</TableHead>
                    <TableHead className="text-right">Charges</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financial.chargesByProgram.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{row.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-6 animate-fade-up">
          {/* Attendance stats */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Completed"
              value={String(attendance.totalSessions)}
              icon={CalendarDays}
            />
            <StatCard
              label="Upcoming"
              value={String(attendance.scheduledSessions)}
              icon={CalendarDays}
            />
            <StatCard
              label="Cancelled"
              value={String(attendance.cancelledSessions)}
              icon={CalendarDays}
              variant={attendance.cancelledSessions > 0 ? 'danger' : 'default'}
            />
            <StatCard
              label="Attendance Rate"
              value={`${attendance.attendanceRate}%`}
              icon={Users}
              variant={attendance.attendanceRate >= 80 ? 'success' : attendance.attendanceRate >= 60 ? 'default' : 'danger'}
            />
          </div>

          {/* Attendance by program */}
          {attendance.byProgram.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Attendance by Program</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Program</TableHead>
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="w-1/4">
                      <span className="sr-only">Bar</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendance.byProgram.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">{row.present}</TableCell>
                      <TableCell className="text-right tabular-nums text-danger">{row.absent}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{row.rate}%</TableCell>
                      <TableCell>
                        <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
                            style={{ width: `${row.rate}%` }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <p className="text-xs text-muted-foreground">Total Present</p>
              <p className="mt-1 text-2xl font-bold text-success">{attendance.totalPresent}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <p className="text-xs text-muted-foreground">Total Absent</p>
              <p className="mt-1 text-2xl font-bold text-danger">{attendance.totalAbsent}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
