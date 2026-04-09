import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  // Generate a nonce for CSP — Next.js reads x-nonce from request headers
  // and automatically applies it to inline <script> tags
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  // Set nonce on request headers BEFORE any response creation.
  // NextRequest.headers is mutable — this propagates through
  // NextResponse.next({ request }) in updateSession.
  request.headers.set('x-nonce', nonce)

  // Run auth middleware (handles session refresh, role checks, redirects)
  const response = await updateSession(request)

  // Stripe.js loads from js.stripe.com on every page (lightweight); the
  // PaymentElement iframe served from m.stripe.network embeds the card form.
  const scriptSrc = `'self' 'nonce-${nonce}' https://js.stripe.com`

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com`,
    `font-src 'self'`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://maps.stripe.com https://va.vercel-scripts.com`,
    `frame-src https://www.youtube.com https://youtube-nocookie.com https://js.stripe.com https://hooks.stripe.com https://m.stripe.network`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ')

  // Set CSP and nonce on the response
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-nonce', nonce)

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
