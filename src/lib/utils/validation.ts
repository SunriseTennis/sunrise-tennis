import { z } from 'zod'

// ── Shared Helpers ──────────────────────────────────────────────────────

/** Trimmed string with max length to prevent payload bombs */
const safeString = (maxLen = 2000) => z.string().trim().max(maxLen)
const requiredString = (msg: string, maxLen = 500) => safeString(maxLen).min(1, msg)
const optionalString = (maxLen = 2000) => safeString(maxLen).optional().or(z.literal(''))
/** Accept any UUID-format string (Zod v4 .uuid() rejects non-v4 deterministic IDs) */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuidString = (msg: string) => z.string().regex(UUID_RE, msg)
const optionalUuid = () => z.string().regex(UUID_RE).optional().or(z.literal(''))
const dollarAmount = (msg: string) =>
  z.string().regex(/^\d+(\.\d{1,2})?$/, msg)

/**
 * Parse flat FormData into a plain object, then validate with a Zod schema.
 * Returns { success: true, data } or { success: false, error: string }.
 */
export function validateFormData<T extends z.ZodType>(
  formData: FormData,
  schema: T,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const raw: Record<string, unknown> = {}
  formData.forEach((value, key) => {
    raw[key] = value
  })
  const result = schema.safeParse(raw)
  if (!result.success) {
    return { success: false, error: result.error.issues[0].message }
  }
  return { success: true, data: result.data }
}

// ── Enum Schemas ────────────────────────────────────────────────────────

export const familyStatusSchema = z.enum(['active', 'inactive', 'lead', 'archived'])
export const playerStatusSchema = z.enum(['active', 'inactive', 'archived'])
export const ballColorSchema = z.enum(['blue', 'red', 'orange', 'green', 'yellow', 'competitive', 'advanced', 'elite'])
export const classificationSchema = z.enum(['blue', 'red', 'orange', 'green', 'yellow', 'advanced', 'elite'])
export const trackSchema = z.enum(['performance', 'participation'])
export const sessionTypeSchema = z.enum(['group', 'private', 'makeup'])
export const sessionStatusSchema = z.enum(['scheduled', 'completed', 'cancelled', 'rained_out'])
export const attendanceStatusSchema = z.enum(['present', 'absent', 'noshow'])
export const bookingTypeSchema = z.enum(['term_enrollment', 'term', 'casual', 'private', 'trial'])
export const bookingStatusSchema = z.enum(['confirmed', 'pending', 'cancelled'])
export const paymentMethodSchema = z.enum(['stripe', 'bank_transfer', 'cash', 'direct_debit', 'square_ftd'])
export const paymentStatusSchema = z.enum(['received', 'pending', 'overdue', 'refunded'])
export const userRoleSchema = z.enum(['parent', 'coach', 'admin'])
export const programTypeSchema = z.enum(['group', 'squad', 'school', 'competition'])
export const mediaVisibilitySchema = z.enum(['family_only', 'program', 'public'])
export const genderSchema = z.enum(['male', 'female', 'non_binary'])

// ── Object Schemas (for API-style payloads) ─────────────────────────────

export const contactSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  preferred_method: z.enum(['phone', 'email', 'sms']).optional(),
})

export const createFamilySchema = z.object({
  family_name: z.string().min(1, 'Family name is required'),
  preferred_name: z.string().optional(),
  primary_contact: contactSchema,
  secondary_contact: contactSchema.optional(),
  address: z.string().optional(),
  referred_by: z.string().optional(),
  notes: z.string().optional(),
})

export const createPlayerSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  preferred_name: z.string().optional(),
  dob: z.string().optional(),
  level: ballColorSchema.optional(),
  ball_color: ballColorSchema.optional(),
  medical_notes: z.string().optional(),
  current_focus: z.array(z.string()).optional(),
  short_term_goal: z.string().optional(),
  long_term_goal: z.string().optional(),
  comp_interest: z.enum(['yes', 'no', 'future']).optional(),
  media_consent: z.boolean().default(false),
})

// ── Form Schemas (flat FormData validation) ─────────────────────────────

// Auth
export const loginFormSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: requiredString('Password is required', 200),
})

// Plan 15 Phase D — soft funnel filter on /signup. Optional, captured into
// families.referral_source via the create_self_signup_family RPC (handled in
// /dashboard handoff). Invite-token signups skip this entirely.
export const referralSourceSchema = z.enum([
  'word_of_mouth', 'google', 'social', 'school', 'walked_past', 'event', 'other',
])

// Plan 17 Block B — split full_name into first_name + last_name. The
// surname becomes families.family_name; the full "First Last" string is
// the primary_contact display name.
export const signupFormSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  first_name: requiredString('First name is required'),
  last_name: requiredString('Last name is required'),
  invite_token: optionalString(),
  accepted_terms: z.literal('on', { message: 'You must accept the Privacy Policy and Terms of Service' }),
  referral_source: referralSourceSchema.optional().or(z.literal('')),
  referral_source_detail: optionalString(500),
})

// Plan 20 — invite-only signup path. Token-bound (peek_invitation_email
// returns the email server-side), so no email field; just password +
// confirm + T&C. Skips Supabase's confirmation email step — the parent
// already proved email ownership by clicking the invite link.
export const signupViaInviteFormSchema = z.object({
  invite_token: z.string().uuid('Invalid invite link'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  password_confirm: z.string().min(8, 'Please re-enter the same password'),
  accepted_terms: z.literal('on', { message: 'You must accept the Privacy Policy and Terms of Service' }),
}).refine((d) => d.password === d.password_confirm, {
  message: "Passwords don't match",
  path: ['password_confirm'],
})

export const magicLinkFormSchema = z.object({
  email: z.string().email('Valid email is required'),
})

// Plan 15 Phase E — password reset.
export const forgotPasswordFormSchema = z.object({
  email: z.string().email('Valid email is required'),
})

export const updatePasswordFormSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  confirm_password: z.string().min(8, 'Please re-enter the same password'),
}).refine((data) => data.password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
})

// Admin - Families
// Plan 17 follow-up — primary + secondary contact split into first + last
// across all family edit surfaces. `family_name` is no longer entered
// directly: it's auto-derived from the primary contact's surname server-side.
export const createFamilyFormSchema = z.object({
  contact_first_name: requiredString('First name is required'),
  contact_last_name: requiredString('Last name is required'),
  contact_phone: optionalString(),
  contact_email: z.string().email().optional().or(z.literal('')),
  address: optionalString(1000),
  referred_by: optionalString(),
})

export const updateFamilyFormSchema = z.object({
  contact_first_name: requiredString('First name is required'),
  contact_last_name: requiredString('Last name is required'),
  contact_phone: optionalString(),
  contact_email: z.string().email().optional().or(z.literal('')),
  address: optionalString(1000),
  status: familyStatusSchema,
  notes: optionalString(5000),
  secondary_first_name: optionalString(),
  secondary_last_name: optionalString(),
  secondary_role: optionalString(),
  secondary_phone: optionalString(),
  secondary_email: z.string().email().optional().or(z.literal('')),
})

// Admin - Players
// Plan 17 Block A: media consent is three granular checkboxes
// (media_consent_coaching / _family / _social) parsed directly from
// FormData in the server actions, not validated through Zod here.
// Plan 24 — ball_color + level dropped (columns retired). Classifications
// is the only signal; track is admin-only.
export const createPlayerFormSchema = z.object({
  first_name: requiredString('First name is required'),
  last_name: requiredString('Last name is required'),
  dob: optionalString(),
  gender: genderSchema.optional().or(z.literal('')),
  /** Comma-separated list of classifications (e.g. "red,advanced"). Server splits + filters. */
  classifications: optionalString(500),
  track: trackSchema.optional().or(z.literal('')),
  medical_notes: optionalString(5000),
})

export const updatePlayerFormSchema = z.object({
  first_name: requiredString('First name is required'),
  last_name: requiredString('Last name is required'),
  preferred_name: optionalString(),
  gender: genderSchema.optional().or(z.literal('')),
  dob: optionalString(),
  /** Comma-separated list of classifications (e.g. "red,orange,advanced"). Server splits + filters. */
  classifications: optionalString(500),
  track: trackSchema.optional().or(z.literal('')),
  status: playerStatusSchema.optional().or(z.literal('')),
  medical_notes: optionalString(5000),
  current_focus: optionalString(2000),
  short_term_goal: optionalString(1000),
  long_term_goal: optionalString(1000),
  comp_interest: z.enum(['yes', 'no', 'future']).optional().or(z.literal('')),
  school: optionalString(200),
})

// Admin - Programs
export const createProgramFormSchema = z.object({
  name: requiredString('Program name is required'),
  type: programTypeSchema,
  level: ballColorSchema.optional().or(z.literal('')),
  day_of_week: optionalString(),
  start_time: optionalString(),
  end_time: optionalString(),
  max_capacity: optionalString(),
  per_session_dollars: optionalString(),
  term_fee_dollars: optionalString(),
  description: optionalString(5000),
  /** Comma-separated list of classifications (e.g. "red,orange"). */
  allowed_classifications: optionalString(500),
  gender_restriction: z.enum(['', 'female', 'male']).optional(),
  track_required: z.enum(['', 'performance', 'participation']).optional(),
  early_pay_discount_pct: optionalString(),
  early_bird_deadline: optionalString(),
  early_pay_discount_pct_tier2: optionalString(),
  early_bird_deadline_tier2: optionalString(),
})

export const updateProgramFormSchema = createProgramFormSchema.extend({
  status: z.enum(['active', 'paused', 'archived']).optional().or(z.literal('')),
})

// Admin - Sessions
export const createSessionFormSchema = z.object({
  program_id: optionalUuid(),
  date: requiredString('Date is required'),
  start_time: optionalString(),
  end_time: optionalString(),
  session_type: sessionTypeSchema,
  coach_id: optionalUuid(),
  venue_id: optionalUuid(),
})

// Admin - Payments
export const recordPaymentFormSchema = z.object({
  family_id: uuidString('Invalid family'),
  amount_dollars: dollarAmount('Valid amount is required (e.g. 85.00)'),
  payment_method: paymentMethodSchema,
  category: optionalString(),
  description: optionalString(1000),
  notes: optionalString(2000),
  status: paymentStatusSchema.optional(),
})

export const createInvoiceFormSchema = z.object({
  family_id: uuidString('Invalid family'),
  amount_dollars: dollarAmount('Valid amount is required'),
  description: optionalString(1000),
  due_date: optionalString(),
})

// Admin - Teams
export const createTeamFormSchema = z.object({
  name: requiredString('Team name is required'),
  season: optionalString(),
  program_id: optionalUuid(),
  coach_id: optionalUuid(),
})

export const updateTeamFormSchema = z.object({
  name: requiredString('Team name is required'),
  season: optionalString(),
  coach_id: optionalUuid(),
  status: z.enum(['active', 'archived']).optional().or(z.literal('')),
})

export const addTeamMemberFormSchema = z.object({
  player_id: uuidString('Invalid player'),
  role: optionalString(),
})

// Admin - Notifications
export const sendNotificationFormSchema = z.object({
  type: requiredString('Notification type is required'),
  title: requiredString('Title is required', 200),
  body: optionalString(5000),
  url: optionalString(500),
  target_type: requiredString('Target type is required'),
  target_id: optionalUuid(),
  target_level: optionalString(),
})

// Admin - Invitations
export const createInvitationFormSchema = z.object({
  email: z.string().email('Valid email is required'),
})

// Coach
export const lessonNoteFormSchema = z.object({
  player_id: uuidString('Player is required'),
  focus: optionalString(2000),
  progress: optionalString(5000),
  drills_used: optionalString(2000),
  video_url: z.string().url().optional().or(z.literal('')),
  next_plan: optionalString(2000),
  notes: optionalString(5000),
})

// Parent
// Plan 17 follow-up — primary + secondary contact split into first + last.
// Surname becomes families.family_name; `contact_name` field is gone.
export const updateContactFormSchema = z.object({
  contact_first_name: requiredString('First name is required'),
  contact_last_name: requiredString('Last name is required'),
  contact_phone: optionalString(),
  contact_email: z.string().email().optional().or(z.literal('')),
  address: optionalString(1000),
  secondary_first_name: optionalString(),
  secondary_last_name: optionalString(),
  secondary_phone: optionalString(),
  secondary_email: z.string().email().optional().or(z.literal('')),
})

export const updatePlayerDetailsFormSchema = z.object({
  first_name: requiredString('First name is required'),
  last_name: requiredString('Last name is required'),
  dob: optionalString(),
  gender: genderSchema.optional().or(z.literal('')),
  medical_notes: optionalString(5000),
  school: optionalString(200),
  // Plan 17 Block A: media_consent_{coaching,family,social} parsed
  // directly from FormData in the action.
})

// Parent - add a new player from /parent/players/new
// Plan 19 — parent surface no longer asks for classifications/track/
// physical_notes (admin-only concerns). Classifications auto-fill from
// ball_color in the action; physical_notes column dropped.
export const parentCreatePlayerFormSchema = z.object({
  first_name: requiredString('First name is required'),
  last_name: requiredString('Last name is required'),
  preferred_name: optionalString(),
  dob: requiredString('Date of birth is required'),
  gender: genderSchema.refine((v) => !!v, { message: 'Gender is required' }),
  ball_color: ballColorSchema.optional().or(z.literal('')),
  medical_notes: optionalString(5000),
  school: optionalString(200),
})

// Plan 15 Phase D — wizard add-player intake (self-signup + admin-invite).
// Plan 19 — same parent-surface simplification: drop classifications/
// physical_notes; classifications auto-fill from ball_color in the action.
// Media-consent ack lives on its own dedicated wizard step.
export const wizardAddPlayerSchema = z.object({
  first_name: requiredString('First name is required'),
  last_name: requiredString('Last name is required'),
  preferred_name: optionalString(),
  dob: requiredString('Date of birth is required'),
  gender: genderSchema.refine((v) => !!v, { message: 'Gender is required' }),
  ball_color: ballColorSchema.optional().or(z.literal('')),
  medical_notes: optionalString(5000),
  school: optionalString(200),
})

// Plan 20 — wizard step 2 inline-edit form. Edits an existing player's
// "info" fields only — name, preferred, DOB, gender, school. Ball-level
// stays admin-owned (parent edits via /parent/players/[id] later if
// needed). Medical notes are encrypted at-rest and edited via the
// dedicated player page (the encryption RPC pattern doesn't fit a
// hidden round-trip). first/last are required since we already have them.
export const wizardEditPlayerSchema = z.object({
  player_id: z.string().uuid('Invalid player ID'),
  first_name: requiredString('First name is required'),
  last_name: requiredString('Last name is required'),
  preferred_name: optionalString(),
  dob: optionalString(),
  gender: z.enum(['male', 'female', 'non_binary']).optional().or(z.literal('')),
  school: optionalString(200),
})

// Plan 15 Phase D — onboarding contact details for self-signup wizard step 1.
// Adds address vs the existing admin-invite contact step which doesn't ask.
// Plan 17 follow-up — split into first + last; surname → family_name.
export const wizardContactSchema = z.object({
  contact_first_name: requiredString('First name is required'),
  contact_last_name: requiredString('Last name is required'),
  contact_phone: z.string().trim().max(50).optional().or(z.literal('')),
  address: optionalString(1000),
})

// Plan 15 Phase D — terms + media-consent acknowledgement step (wizard step 4).
// One T&C checkbox plus one media_consent_<playerId> checkbox per player.
// Player consents are read dynamically from formData (key prefix scan), so
// no schema entries — only the T&C ack is constrained.
export const wizardTermsAckSchema = z.object({
  terms_accepted: z.literal('on', { message: 'Please acknowledge the Terms & Conditions to continue' }),
})

// Parent - Programs
export const paymentOptionSchema = z.enum(['pay_now', 'pay_later'])

export const enrolFormSchema = z.object({
  player_id: uuidString('Invalid player'),
  booking_type: bookingTypeSchema,
  payment_option: paymentOptionSchema.optional().or(z.literal('')),
  notes: optionalString(1000),
})

// Parent - Vouchers (SA Sports Vouchers Plus)
export const voucherGenderSchema = z.enum(['Male', 'Female', 'Gender Diverse'])
export const voucherAmountSchema = z.enum(['100', '200'])

export const submitVoucherFormSchema = z.object({
  player_id: uuidString('Select a player'),
  amount: voucherAmountSchema,
  // Child's information
  child_first_name: requiredString('Child first name is required', 100),
  child_surname: requiredString('Child surname is required', 100),
  child_gender: voucherGenderSchema,
  child_dob: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Date must be DD/MM/YYYY'),
  // Medicare information (either medicare or visa required)
  medicare_number: optionalString(11),
  visa_number: optionalString(50),
  // Parent/Guardian information
  parent_first_name: requiredString('Parent first name is required', 100),
  parent_surname: requiredString('Parent surname is required', 100),
  street_address: requiredString('Street address is required', 200),
  suburb: requiredString('Suburb is required', 100),
  postcode: z.string().regex(/^\d{4}$/, 'Postcode must be 4 digits'),
  parent_contact_number: requiredString('Contact number is required', 20),
  parent_email: z.string().email('Invalid email address').max(200),
  // Eligibility questions
  first_time: z.enum(['Yes', 'No']),
  has_disability: z.enum(['Yes', 'No']),
  is_indigenous: z.enum(['Yes', 'No']),
  english_main_language: z.enum(['Yes', 'No']),
  other_language: optionalString(100),
  activity_cost: z.string().regex(/^\d+$/, 'Enter cost as a whole number (e.g. 260)'),
}).refine(
  (data) => (data.medicare_number && data.medicare_number.length === 11) || (data.visa_number && data.visa_number.length > 0),
  { message: 'Either Medicare number (11 digits) or Australian visa number is required', path: ['medicare_number'] },
)

export const submitVoucherImageSchema = z.object({
  player_id: uuidString('Select a player'),
  amount: voucherAmountSchema,
})

// Admin - Family Pricing
export const familyPricingFormSchema = z.object({
  family_id: uuidString('Invalid family'),
  program_id: optionalUuid(),
  program_type: optionalString(),
  coach_id: optionalUuid(),
  per_session_dollars: optionalString(),
  term_fee_dollars: optionalString(),
  notes: optionalString(1000),
  valid_from: optionalString(),
  valid_until: optionalString(),
})

// Admin - Generate Term Sessions
export const generateTermSessionsFormSchema = z.object({
  term: z.coerce.number().int().min(1).max(4),
  year: z.coerce.number().int().min(2025).max(2030),
})

// Charge status/type enums
export const chargeStatusSchema = z.enum(['pending', 'confirmed', 'voided', 'credited'])
export const chargeTypeSchema = z.enum([
  'session', 'term_enrollment', 'casual', 'private', 'trial', 'event',
  'credit', 'adjustment', 'voucher', 'referral_credit', 'discount',
])
export const chargeSourceTypeSchema = z.enum([
  'enrollment', 'attendance', 'voucher', 'referral', 'admin', 'cancellation',
])

// Team messages (shared between parent and admin)
export const teamMessageFormSchema = z.object({
  body: safeString(5000).min(1, 'Message cannot be empty'),
})

// Direct messages (parent → admin/coach)
export const sendMessageFormSchema = z.object({
  recipient_role: z.enum(['admin', 'coach']),
  recipient_id: optionalUuid(),
  category: z.enum(['question_program', 'scheduling', 'payment', 'general']),
  subject: requiredString('Subject is required', 200),
  body: safeString(5000).min(1, 'Message cannot be empty'),
  player_id: optionalUuid(),
  program_id: optionalUuid(),
})

// Admin/coach reply to a message
export const replyMessageFormSchema = z.object({
  message_id: uuidString('Invalid message ID'),
  reply: safeString(5000).min(1, 'Reply cannot be empty'),
})

// Bulk enrollment
export const bulkEnrolFormSchema = z.object({
  program_id: uuidString('Invalid program'),
  player_ids: z.string().min(1, 'Select at least one player'),
  booking_type: z.enum(['term', 'trial', 'casual']),
})

// Bulk payment recording
export const bulkPaymentFormSchema = z.object({
  payments: z.string().min(1, 'No payments to record'),
})

// Availability response uses dynamic keys (status_PLAYERID_DATE)
// so it's validated procedurally, not with a static schema

// ── Competitions ───────────────────────────────────────────────────────

export const competitionStatusSchema = z.enum([
  'active', 'nominations_open', 'in_season', 'completed', 'archived',
])
export const compPlayerRoleSchema = z.enum(['mainstay', 'fill_in', 'potential'])
export const registrationStatusSchema = z.enum(['registered', 'unregistered', 'pending'])
export const nominationStatusSchema = z.enum(['draft', 'nominated', 'confirmed'])

export const createCompetitionFormSchema = z.object({
  name: requiredString('Competition name is required'),
  short_name: optionalString(20),
  type: z.enum(['external', 'internal']),
  season: requiredString('Season is required'),
  nomination_open: optionalString(),
  nomination_close: optionalString(),
  season_start: optionalString(),
  season_end: optionalString(),
  finals_start: optionalString(),
  finals_end: optionalString(),
  notes: optionalString(5000),
})

export const updateCompetitionFormSchema = createCompetitionFormSchema.extend({
  status: competitionStatusSchema.optional().or(z.literal('')),
})

export const createCompTeamFormSchema = z.object({
  name: requiredString('Team name is required'),
  competition_id: uuidString('Invalid competition'),
  division: optionalString(),
  gender: z.enum(['male', 'female', 'mixed']).optional().or(z.literal('')),
  age_group: z.enum(['senior', 'junior']).optional().or(z.literal('')),
  team_size_required: optionalString(),
  coach_id: optionalUuid(),
})

export const updateCompTeamFormSchema = z.object({
  name: requiredString('Team name is required'),
  division: optionalString(),
  gender: z.enum(['male', 'female', 'mixed']).optional().or(z.literal('')),
  age_group: z.enum(['senior', 'junior']).optional().or(z.literal('')),
  team_size_required: optionalString(),
  coach_id: optionalUuid(),
  nomination_status: nominationStatusSchema.optional().or(z.literal('')),
})

export const addCompPlayerFormSchema = z.object({
  team_id: uuidString('Invalid team'),
  first_name: requiredString('First name is required'),
  last_name: optionalString(),
  age: optionalString(),
  gender: z.enum(['male', 'female']).optional().or(z.literal('')),
  role: compPlayerRoleSchema,
  registration_status: registrationStatusSchema,
  notes: optionalString(1000),
})

export const updateCompPlayerFormSchema = z.object({
  first_name: requiredString('First name is required'),
  last_name: optionalString(),
  age: optionalString(),
  gender: z.enum(['male', 'female']).optional().or(z.literal('')),
  role: compPlayerRoleSchema,
  registration_status: registrationStatusSchema,
  player_id: optionalUuid(),
  notes: optionalString(1000),
})

// ── Private Bookings ──────────────────────────────────────────────────

export const payPeriodSchema = z.enum(['weekly', 'end_of_term'])
export const approvalStatusSchema = z.enum(['pending', 'approved', 'declined', 'auto'])

export const coachAvailabilityFormSchema = z.object({
  coach_id: uuidString('Invalid coach'),
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: requiredString('Start time is required'),
  end_time: requiredString('End time is required'),
})

export const coachExceptionFormSchema = z.object({
  coach_id: uuidString('Invalid coach'),
  exception_date: requiredString('Date is required'),
  start_time: optionalString(),
  end_time: optionalString(),
  reason: optionalString(500),
})

export const requestPrivateFormSchema = z.object({
  player_id: uuidString('Invalid player'),
  coach_id: uuidString('Invalid coach'),
  date: requiredString('Date is required'),
  start_time: requiredString('Start time is required'),
  duration_minutes: z.coerce.number().int().refine(
    v => [30, 45, 60].includes(v), 'Duration must be 30, 45, or 60 minutes'
  ),
})

export const cancelPrivateFormSchema = z.object({
  booking_id: uuidString('Invalid booking'),
  reason: optionalString(1000),
})
