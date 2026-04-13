# Coach Portal

> Coaches see schedule, mark attendance, add lesson notes, manage availability.
> For full page inventory + known gaps: load `Apps/Portals/coach.md` from Drive.

## Key Files

- `page.tsx` — Overview (today + upcoming sessions for this coach)
- `actions.ts` — Coach actions (attendance, lesson notes, session management)
- `layout.tsx` — Coach layout with navigation

## Sub-routes

| Route | Purpose |
| ----- | ------- |
| schedule/ | Weekly schedule + session detail |
| programs/ | Redirects to schedule (no dedicated view) |
| privates/ | Private lesson bookings |
| availability/ | Weekly availability windows |
| earnings/ | Pay tracking |
| messages/ | Messaging |

## Known Gaps

- No session cancellation (must ask admin)
- No booking approval (admin-only)
- No programs page (redirects to schedule)
- log-session/ exists but linkage from schedule unclear
