'use server'

import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

type AuthEventType = 'login' | 'login_failed' | 'signup' | 'signout' | 'magic_link_request' | 'password_change' | 'email_change_request' | 'email_change_confirmed' | 'password_reset_request' | 'password_reset_complete'

interface LogAuthEventParams {
  userId?: string | null
  email: string
  eventType: AuthEventType
  method?: string
  success: boolean
  metadata?: Record<string, unknown>
}

export async function logAuthEvent(params: LogAuthEventParams) {
  try {
    const hdrs = await headers()
    const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const userAgent = hdrs.get('user-agent') || null

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    await serviceClient.from('auth_events').insert({
      user_id: params.userId || null,
      email: params.email,
      event_type: params.eventType,
      method: params.method || null,
      success: params.success,
      ip_address: ip,
      user_agent: userAgent,
      metadata: params.metadata || null,
    })
  } catch (e) {
    console.error('Auth event logging failed:', e instanceof Error ? e.message : 'Unknown')
  }
}
