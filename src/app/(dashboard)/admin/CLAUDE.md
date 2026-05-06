# Admin Portal

> Full platform management. Only Maxim has admin access.
> For full page inventory + missing capabilities: load `Apps/Portals/admin.md` from Drive.

## Key Files

- `page.tsx` — Overview dashboard (14K, stats, calendar, balances)
- `actions.ts` — Main admin actions (43K, largest file in codebase). Contains:
  createFamily, updateFamily, createPlayer, updatePlayer, createInvitation,
  createProgram, updateProgram, createSession, generateTermSessions,
  cancelSession, rainOutToday, adminCompleteSession,
  bulkEnrolPlayers, updateCoach, updateAttendance
- `layout.tsx` — Admin layout with navigation
- `overview-calendar.tsx` — Admin calendar component
- `rain-out-button.tsx` — One-click rain-out

## Sub-routes with own actions

| Route | actions.ts | Purpose |
| ----- | ---------- | ------- |
| coaches/ | Yes | Coach management |
| competitions/ | Yes | Competition + team CRUD, DnD workspace |
| events/ | Yes | Club events CRUD |
| payments/ | Yes | Payment recording, charge management |
| privates/ | Yes | Private booking management |
| messages/ | Yes | Messaging |
| notifications/ | Yes | Push notification sending |
| teams/ | Yes | Team management |
| vouchers/ | Yes | Voucher processing |

## Known Missing Admin Capabilities

See `Apps/Portals/admin.md` "What's Missing" table. Key gaps:
- No coach-to-program assignment UI (program_coaches table)
- No venue assignment for programs
- Blue ball level not in create form dropdown
- Landing page content all hardcoded
