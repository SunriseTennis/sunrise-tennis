import { NextResponse } from 'next/server'
import { createClient, requireAdmin } from '@/lib/supabase/server'

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCSV(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCSV).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCSV).join(','))
  }
  return lines.join('\n')
}

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    let csv = ''
    let filename = 'export.csv'

    switch (type) {
      case 'families': {
        const { data } = await supabase
          .from('families')
          .select('display_id, family_name, status, primary_contact, secondary_contact, family_balance(balance_cents, confirmed_balance_cents)')
          .order('display_id')

        const headers = ['ID', 'Family Name', 'Status', 'Primary Name', 'Primary Phone', 'Primary Email', 'Secondary Name', 'Secondary Phone', 'Current Balance', 'Total Balance']
        const rows = (data ?? []).map(f => {
          const pc = f.primary_contact as { name?: string; phone?: string; email?: string } | null
          const sc = f.secondary_contact as { name?: string; phone?: string } | null
          const bal = f.family_balance as unknown as { balance_cents: number; confirmed_balance_cents: number } | null
          return [
            f.display_id,
            f.family_name,
            f.status,
            pc?.name || '',
            pc?.phone || '',
            pc?.email || '',
            sc?.name || '',
            sc?.phone || '',
            bal ? (bal.confirmed_balance_cents / 100).toFixed(2) : '0.00',
            bal ? (bal.balance_cents / 100).toFixed(2) : '0.00',
          ]
        })
        csv = toCSV(headers, rows)
        filename = 'families.csv'
        break
      }

      case 'players': {
        const { data } = await supabase
          .from('players')
          .select('first_name, last_name, dob, level, ball_color, status, comp_interest, families:family_id(display_id, family_name)')
          .order('last_name')

        const headers = ['First Name', 'Last Name', 'DOB', 'Level', 'Ball Color', 'Status', 'Comp Interest', 'Family ID', 'Family Name']
        const rows = (data ?? []).map(p => {
          const fam = p.families as unknown as { display_id: string; family_name: string } | null
          return [
            p.first_name,
            p.last_name,
            p.dob || '',
            p.level || '',
            p.ball_color || '',
            p.status,
            p.comp_interest || '',
            fam?.display_id || '',
            fam?.family_name || '',
          ]
        })
        csv = toCSV(headers, rows)
        filename = 'players.csv'
        break
      }

      case 'balances': {
        const { data } = await supabase
          .from('families')
          .select('display_id, family_name, primary_contact, family_balance(balance_cents, confirmed_balance_cents, projected_balance_cents)')
          .eq('status', 'active')
          .order('display_id')

        const headers = ['ID', 'Family Name', 'Contact Email', 'Contact Phone', 'Current Balance', 'Projected Balance']
        const rows = (data ?? [])
          .map(f => {
            const pc = f.primary_contact as { email?: string; phone?: string } | null
            const bal = f.family_balance as unknown as { balance_cents: number; confirmed_balance_cents: number; projected_balance_cents: number } | null
            return {
              row: [
                f.display_id,
                f.family_name,
                pc?.email || '',
                pc?.phone || '',
                bal ? (bal.confirmed_balance_cents / 100).toFixed(2) : '0.00',
                bal ? (bal.projected_balance_cents / 100).toFixed(2) : '0.00',
              ],
              balanceCents: bal?.confirmed_balance_cents ?? 0,
            }
          })
          .sort((a, b) => a.balanceCents - b.balanceCents) // Most owing first
          .map(r => r.row)

        csv = toCSV(headers, rows)
        filename = 'balances.csv'
        break
      }

      case 'attendance': {
        const termParam = searchParams.get('term') || ''
        // Fetch all sessions with their program info and attendances
        let sessionsQuery = supabase
          .from('sessions')
          .select('id, date, status, programs:program_id(name, type, level, term)')
          .order('date', { ascending: false })
          .limit(500)

        if (termParam) {
          // Filter by term through the program relationship
          sessionsQuery = sessionsQuery.eq('programs.term', termParam)
        }

        const { data: sessions } = await sessionsQuery

        // Get all attendances for these sessions
        const sessionIds = (sessions ?? []).map(s => s.id)
        let attendances: { session_id: string; player_id: string; status: string }[] = []
        if (sessionIds.length > 0) {
          // Batch fetch
          for (let i = 0; i < sessionIds.length; i += 100) {
            const batch = sessionIds.slice(i, i + 100)
            const { data } = await supabase
              .from('attendances')
              .select('session_id, player_id, status')
              .in('session_id', batch)
            attendances.push(...(data ?? []))
          }
        }

        // Get player names
        const playerIds = [...new Set(attendances.map(a => a.player_id))]
        let playerMap: Record<string, string> = {}
        if (playerIds.length > 0) {
          for (let i = 0; i < playerIds.length; i += 100) {
            const batch = playerIds.slice(i, i + 100)
            const { data } = await supabase
              .from('players')
              .select('id, first_name, last_name')
              .in('id', batch)
            for (const p of data ?? []) {
              playerMap[p.id] = `${p.first_name} ${p.last_name}`
            }
          }
        }

        const headers = ['Date', 'Program', 'Type', 'Level', 'Session Status', 'Player', 'Attendance']
        const rows: unknown[][] = []
        for (const s of sessions ?? []) {
          const prog = s.programs as unknown as { name: string; type: string; level: string; term: string } | null
          const sessionAttendances = attendances.filter(a => a.session_id === s.id)
          if (sessionAttendances.length === 0) {
            rows.push([s.date, prog?.name || '', prog?.type || '', prog?.level || '', s.status, '', ''])
          } else {
            for (const a of sessionAttendances) {
              rows.push([
                s.date,
                prog?.name || '',
                prog?.type || '',
                prog?.level || '',
                s.status,
                playerMap[a.player_id] || a.player_id,
                a.status,
              ])
            }
          }
        }

        csv = toCSV(headers, rows)
        filename = `attendance${termParam ? `-${termParam}` : ''}.csv`
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid export type. Use: families, players, balances, attendance' }, { status: 400 })
    }

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
