import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'

type PrimaryContact = {
  name?: string | null
  email?: string | null
  phone?: string | null
}

function asContact(value: unknown): PrimaryContact {
  if (!value || typeof value !== 'object') return {}
  const v = value as Record<string, unknown>
  return {
    name: typeof v.name === 'string' ? v.name : null,
    email: typeof v.email === 'string' ? v.email : null,
    phone: typeof v.phone === 'string' ? v.phone : null,
  }
}

/**
 * Look up (or create + cache) a Stripe Customer for a family. Pass `customer:`
 * on every PaymentIntent so the Stripe dashboard shows the parent's name +
 * email instead of "Guest", groups all of a family's payments under one
 * Customer view, and gives us the Customer object that future saved-cards
 * work depends on.
 *
 * Refreshes name/email/phone on Stripe each call so dashboard contact details
 * stay in sync if the parent edits their primary_contact later.
 *
 * Always uses the service-role client for the cache write — the families
 * UPDATE policy doesn't grant parents write on stripe_customer_id, and this
 * helper is called from authed server actions where ownership is already
 * verified upstream.
 */
export async function getOrCreateStripeCustomerForFamily(
  supabase: SupabaseClient<Database>,
  familyId: string,
): Promise<string> {
  const { data: family, error } = await supabase
    .from('families')
    .select('id, family_name, primary_contact, stripe_customer_id')
    .eq('id', familyId)
    .single()

  if (error || !family) {
    throw new Error(`Family ${familyId} not found for Stripe customer lookup`)
  }

  const contact = asContact(family.primary_contact)
  const displayName = (contact.name && contact.name.trim()) || family.family_name
  const params = {
    name: displayName,
    email: contact.email || undefined,
    phone: contact.phone || undefined,
    metadata: { family_id: familyId },
  }

  const stripe = getStripe()

  const cachedId = (family as { stripe_customer_id?: string | null }).stripe_customer_id
  if (cachedId) {
    try {
      await stripe.customers.update(cachedId, params)
      return cachedId
    } catch (e) {
      // Customer was deleted on the Stripe side (rare — usually only happens
      // when toggling test/live or wiping the test dashboard). Fall through
      // to create a fresh one and overwrite the stale id.
      console.error('Stripe customer.update failed, recreating:', e instanceof Error ? e.message : e)
    }
  }

  const customer = await stripe.customers.create(params)

  const service = createServiceClient()
  const { error: updateErr } = await service
    .from('families')
    .update({ stripe_customer_id: customer.id })
    .eq('id', familyId)
  if (updateErr) {
    // The customer exists on Stripe; we just couldn't cache it. Future calls
    // will create another customer (orphan). Log loudly so we can clean up.
    console.error('Failed to cache stripe_customer_id on family:', updateErr.message, 'family:', familyId, 'customer:', customer.id)
  }

  return customer.id
}
