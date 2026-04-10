import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimitAsync } from '@/lib/utils/rate-limit'
import { sendPushToAdmins } from '@/lib/push/send'

const trialSchema = z.object({
  parentName: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().email('Valid email required').max(200),
  phone: z.string().trim().min(1, 'Phone is required').max(30),
  childName: z.string().trim().min(1, "Child's name is required").max(200),
  childAge: z.number().int().min(3).max(16),
  childGender: z.enum(['male', 'female']),
  preferredDays: z.array(z.string()).max(7).default([]),
  message: z.string().trim().max(2000).optional(),
})

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  // Rate limit: 5 per hour per IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const allowed = await checkRateLimitAsync(`trial:${ip}`, 5, 60 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = trialSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    )
  }

  const { parentName, email, phone, childName, childAge, childGender, preferredDays, message } = parsed.data
  const supabase = getServiceClient()

  // Check for duplicate lead (same email)
  const { data: existing } = await supabase
    .from('families')
    .select('id')
    .eq('status', 'lead')
    .contains('primary_contact', { email })
    .limit(1)
    .single()

  if (existing) {
    // Don't error — just return success to avoid leaking info
    return NextResponse.json({ success: true })
  }

  // Generate next display_id
  const { data: lastFamily } = await supabase
    .from('families')
    .select('display_id')
    .order('display_id', { ascending: false })
    .limit(1)
    .single()

  let nextNum = 1
  if (lastFamily?.display_id) {
    const match = lastFamily.display_id.match(/C(\d+)/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  const displayId = `C${String(nextNum).padStart(3, '0')}`

  // Create lead family
  const { data: family, error: familyError } = await supabase
    .from('families')
    .insert({
      display_id: displayId,
      family_name: parentName.split(' ').pop() || parentName,
      primary_contact: { name: parentName, email, phone },
      status: 'lead',
      notes: [
        `Trial booking via website`,
        `Gender: ${childGender}`,
        preferredDays.length > 0 ? `Preferred days: ${preferredDays.join(', ')}` : null,
        message ? `Message: ${message}` : null,
      ].filter(Boolean).join('\n'),
    })
    .select('id')
    .single()

  if (familyError) {
    console.error('Trial booking — family creation failed:', familyError)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }

  // Create player record
  const { error: playerError } = await supabase
    .from('players')
    .insert({
      family_id: family.id,
      first_name: childName,
      date_of_birth: estimateDob(childAge),
      status: 'active',
    })

  if (playerError) {
    console.error('Trial booking — player creation failed:', playerError)
    // Family was created — don't fail the request
  }

  // Notify admin
  sendPushToAdmins({
    title: 'New trial booking',
    body: `${childName} (age ${childAge}) — parent: ${parentName}`,
    url: `/admin/families/${family.id}`,
  }).catch((err) => console.error('Trial push notification failed:', err))

  return NextResponse.json({ success: true })
}

/** Estimate a date_of_birth from an age (approximate, good enough for leads) */
function estimateDob(age: number): string {
  const now = new Date()
  const year = now.getFullYear() - age
  return `${year}-01-01`
}
