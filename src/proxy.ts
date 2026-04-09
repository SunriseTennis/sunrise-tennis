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

  // Determine if this is a payment route (Square SDK may need unsafe-eval)
  const isPaymentRoute = request.nextUrl.pathname.startsWith('/parent/payments')
    || request.nextUrl.pathname.startsWith('/admin/payments')

  const scriptSrc = isPaymentRoute
    ? `'self' 'nonce-${nonce}' 'unsafe-eval' https://web.squarecdn.com https://sandbox.web.squarecdn.com`
    : `'self' 'nonce-${nonce}' https://web.squarecdn.com https://sandbox.web.squarecdn.com`

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://*.supabase.co`,
    `font-src 'self'`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://connect.squareup.com https://connect.squareupsandbox.com https://pep.squarecdn.com https://va.vercel-scripts.com`,
    `frame-src https://www.youtube.com https://youtube-nocookie.com https://pep.squarecdn.com`,
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
