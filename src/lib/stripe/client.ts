import Stripe from 'stripe'

/**
 * Singleton Stripe server-side client. Uses the latest pinned API version
 * so SDK upgrades don't silently change behaviour. Secret key is loaded
 * from STRIPE_SECRET_KEY (resolved at process start via `op run` from
 * 1Password — see .claude/rules/secure-coding.md).
 */
let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  stripeClient = new Stripe(secretKey, {
    // Pin the API version. Update deliberately after reading the changelog.
    apiVersion: '2026-03-25.dahlia',
    typescript: true,
    appInfo: {
      name: 'Sunrise Tennis',
      url: 'https://sunrisetennis.com.au',
    },
  })

  return stripeClient
}
