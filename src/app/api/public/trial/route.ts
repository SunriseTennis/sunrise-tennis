import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimitAsync } from '@/lib/utils/rate-limit'
import { sendPushToAdmins } from '@/lib/push/send'

const programInterest = z.object({
  interestType: z.literal('program'),
  programId: z.string().uuid(),
  programName: z.string().max(200),
  programDay: z.number().int().min(0).max(6).nullable().optional(),
  programStart: z.string().max(10).nullable().optional(),
  programEnd: z.string().max(10).nullable().optional(),
})

const privateInterest = z.object({
  interestType: z.literal('private'),
  preferredSlots: z.array(z.object({
    day: z.string().max(20),
    times: z.array(z.string().max(10)).max(28),
  })).min(1).max(7),
})

const trialSchema = z.object({
  parentName: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().email('Valid email required').max(200),
  phone: z.string().trim().min(1, 'Phone is required').max(30),
  childName: z.string().trim().min(1, "Child's name is required").max(200),
  childAge: z.number().int().min(3).max(18),
  childGender: z.enum(['male', 'female']),
  message: z.string().trim().max(2000).optional(),
  interest: z.union([programInterest, privateInterest]).nullable().optional(),
})

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return time
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

function formatInterest(interest: z.infer<typeof trialSchema>['interest']): string | null {
  if (!interest) return null
  if (interest.interestType === 'program') {
    const day = typeof interest.programDay === 'number'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][interest.programDay]
      : null
    const time = interest.programStart
      ? `${formatTime(interest.programStart)}${interest.programEnd ? `–${formatTime(interest.programEnd)}` : ''}`
      : null
    const tail = [day, time].filter(Boolean).join(' ')
    return `Interested in: ${interest.programName}${tail ? ` (${tail})` : ''}`
  }
  const lines = interest.preferredSlots.map(s => {
    const times = s.times.map(formatTime).join(', ')
    return `${s.day}: ${times || 'any time'}`
  })
  return `Private enquiry — preferred slots:\n  ${lines.join('\n  ')}`
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

  const { parentName, email, phone, childName, childAge, childGender, message, interest } = parsed.data
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
  const interestSummary = formatInterest(interest)
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
        interestSummary,
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
  const interestLine = interest?.interestType === 'program'
    ? ` — ${interest.programName}`
    : interest?.interestType === 'private'
      ? ' — private enquiry'
      : ''
  sendPushToAdmins({
    title: 'New trial booking',
    body: `${childName} (age ${childAge})${interestLine} — parent: ${parentName}`,
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
