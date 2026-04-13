# Shared Libraries

> Utility modules used across the app.

## Contents

| Directory | Purpose |
| --------- | ------- |
| supabase/ | Supabase client setup (client.ts, server.ts, proxy.ts), database types, type definitions |
| stripe/ | Stripe client setup and helpers |
| push/ | Web push notification utilities |
| ai/ | AI/Claude API integration helpers |
| utils/ | General utilities |
| upstash.ts | Rate limiting via Upstash Redis (checkRateLimitAsync) |

## Supabase Client Pattern

- `supabase/client.ts` — Browser client (uses anon key)
- `supabase/server.ts` — Server component client (uses cookies for auth)
- `supabase/proxy.ts` — Service role client (admin operations, webhooks)
- `supabase/database.types.ts` — Auto-generated types from DB schema
- `supabase/types.ts` — Custom type extensions
