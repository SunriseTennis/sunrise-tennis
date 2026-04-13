# Parent Portal

> Primary user experience. Parents are the core audience.
> For full page inventory + UI status: load `Apps/Portals/parent.md` from Drive.
> For design patterns: load `Apps/UI/CONTEXT.md` from Drive.

## Key Files

- `page.tsx` — Overview dashboard (19K, gradient hero, player cards, calendar)
- `actions.ts` — Settings actions (contact info, media consent, player details, password, calendar token)
- `overview-actions.ts` — Overview-specific (cancelPrivateFromOverview)
- `enrolled-calendar.tsx` — Weekly calendar with player color coding
- `layout.tsx` — Parent layout (nav, header)
- `loading.tsx` — Skeleton loading

## Sub-routes with own actions

| Route | actions.ts | Key actions |
| ----- | ---------- | ----------- |
| programs/ | Yes | enrolInProgram, bookSession, markSessionAway, cancelSessionBooking |
| bookings/ | Yes | requestPrivateBooking, cancelPrivateBooking, requestStandingPrivate, fetchAvailableSlots |
| payments/ | Yes | Stripe PaymentIntent, payment recording |
| messages/ | Yes | Messaging |
| onboarding/ | Yes | Onboarding flow |
| teams/ | Yes | Team-related |
