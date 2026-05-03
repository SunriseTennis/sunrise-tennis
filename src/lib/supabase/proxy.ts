import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Sign a value with HMAC-SHA256 to prevent cookie tampering.
 * Uses the Supabase anon key as signing secret (always available in the proxy).
 */
async function signValue(value: string): Promise<string> {
  const secret = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${value}.${sigHex}`
}

async function verifySignedValue(signed: string): Promise<string | null> {
  const lastDot = signed.lastIndexOf('.')
  if (lastDot === -1) return null
  const value = signed.substring(0, lastDot)
  const expected = await signValue(value)
  if (expected !== signed) return null
  return value
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Performance optimisation: only call getUser() (network) when the JWT
  // is within 5 minutes of expiry. Otherwise read from the session cookie
  // (local, 0ms). The proxy still refreshes the token when needed.
  const { data: { session } } = await supabase.auth.getSession()

  let user = session?.user ?? null

  if (session) {
    const expiresAt = session.expires_at ?? 0
    const fiveMinutes = 5 * 60
    const needsRefresh = expiresAt - Math.floor(Date.now() / 1000) < fiveMinutes

    if (needsRefresh) {
      // Session close to expiry — verify and refresh via network call
      const { data: { user: freshUser } } = await supabase.auth.getUser()
      user = freshUser
    }
  }

  const { pathname } = request.nextUrl

  // Public routes that don't require auth.
  // /forgot-password is for unauthenticated users who forgot their password
  // (Plan 15 Phase E). /auth/update-password is reached via /auth/callback
  // which sets a recovery session, so the !user check below already lets it
  // through — no need to whitelist here.
  const publicPaths = ['/', '/philosophy', '/contact', '/privacy', '/terms', '/login', '/signup', '/verify', '/forgot-password']
  // Webhook endpoints — must be reachable without cookies (Stripe posts
  // from its own servers with no auth context; signature verification
  // happens inside the handler).
  const isWebhook = pathname === '/api/stripe-webhook'
  const isPublicPath = isWebhook || publicPaths.some(
    (path) => pathname === path || pathname.startsWith('/api/public')
  )
  // /auth/* routes (callback + update-password) handle their own session
  // requirements via the page-level redirect — bypass the proxy gate so
  // recovery flows can land on update-password with a fresh recovery session.
  const isAuthRoute = pathname.startsWith('/auth/')

  // Unauthenticated user on protected route → login
  if (!user && !isPublicPath && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated user on auth pages → redirect to dashboard.
  // /forgot-password too — logged-in users don't need a reset link.
  if (user && (pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Role-based access: use HMAC-signed cached roles cookie to avoid DB query per request
  if (user && (pathname.startsWith('/admin') || pathname.startsWith('/coach') || pathname.startsWith('/parent'))) {
    let roles: string[] = []

    // Try cached roles first (verify HMAC signature and user_id match)
    const cachedRoles = request.cookies.get('x-user-roles')?.value
    if (cachedRoles) {
      const verified = await verifySignedValue(cachedRoles)
      if (verified) {
        // Format: "user_id:role1,role2" — only use if same user
        const colonIdx = verified.indexOf(':')
        if (colonIdx !== -1) {
          const cachedUserId = verified.substring(0, colonIdx)
          if (cachedUserId === user.id) {
            roles = verified.substring(colonIdx + 1).split(',')
          }
          // Different user → ignore stale cookie, re-query below
        }
      }
    }

    if (roles.length === 0) {
      // First request, cache expired, different user, or tampered cookie — query and cache
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)

      roles = userRoles?.map(r => r.role) ?? []

      // Sign with user_id prefix so cookie can't be reused across users
      const signedRoles = await signValue(`${user.id}:${roles.join(',')}`)
      supabaseResponse.cookies.set('x-user-roles', signedRoles, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 300, // 5 minutes
        path: '/',
      })
    }

    // No roles assigned yet → show pending page
    if (roles.length === 0 || (roles.length === 1 && roles[0] === '')) {
      if (pathname !== '/dashboard') {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    const isAdmin = roles.includes('admin')
    const routeRole = pathname.split('/')[1] // 'admin', 'coach', or 'parent'

    // Admins can access all portals (admin, coach, parent)
    // Others can only access their own portal
    if (!isAdmin && !roles.includes(routeRole)) {
      const url = request.nextUrl.clone()
      url.pathname = `/${roles[0]}`
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
