# App Routes

> Route structure for the Sunrise Tennis PWA.
> For design decisions: load `Apps/UI/CONTEXT.md` from Drive.
> For feature context: load `Apps/Features/[feature].md` from Drive.
> For per-page inventory: load `Apps/Portals/[portal].md` from Drive.

## Route Groups

- `(public)/` — Unauthenticated public pages: /contact, /terms, /privacy
- `(dashboard)/` — Authenticated portal: parent/, coach/, admin/
- `(auth)/` — Auth flows: login, signup, callback
- `api/` — API routes: cron jobs, admin APIs, calendar feed, public endpoints, stripe webhook, UTR proxy

## Root Files

- `page.tsx` — Landing page (server component, queries programs from DB)
- `programs-section.tsx` — Programs display component (client, has LEVEL_CONFIG)
- `layout.tsx` — Root layout (fonts, metadata, global providers)
- `globals.css` — Ocean Dawn design tokens, gradients, animations

## Dashboard Portals

| Portal | Routes | Actions files | Drive context |
| ------ | ------ | ------------- | ------------- |
| parent/ | 14 pages | 5 (actions, overview-actions, programs, bookings, payments) | Apps/Portals/parent.md |
| coach/ | 9 pages | 2 (actions, messages) | Apps/Portals/coach.md |
| admin/ | 30+ pages | 7+ (actions, coaches, competitions, events, payments, privates, notifications, teams, vouchers) | Apps/Portals/admin.md |

## API Routes

- `api/cron/` — Scheduled jobs (session reminders, cleanup)
- `api/admin/` — Admin-only endpoints
- `api/calendar/` — iCal feed generation
- `api/public/` — Public endpoints (trial booking)
- `api/stripe-webhook/` — Stripe payment webhook (signature-verified)
- `api/utr/` — UTR rating lookup proxy
