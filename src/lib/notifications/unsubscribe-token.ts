/**
 * Plan 22 Phase 3 — Stateless unsubscribe tokens.
 *
 * Each transactional email carries a per-(user, category) token in the
 * List-Unsubscribe header + footer link. Tokens are HMAC-SHA256 against
 * NOTIFICATION_UNSUBSCRIBE_SECRET — verifiable without a DB lookup, so the
 * /unsubscribe endpoint can stay public and fast.
 *
 * Token shape:
 *   <base64url(payload)>.<base64url(hmac_sha256(payload))>
 * Payload:
 *   { uid: <user_id>, cat: <category>, iat: <unix_seconds>, exp: <iat + 365d> }
 *
 * Why 365d expiry: long enough that links in old archived emails still
 * work; short enough that a leaked secret rotation forces eventual
 * re-issue. If the secret changes, every previously-issued token's HMAC
 * verification fails — the endpoint then renders a "link expired,
 * manage preferences" page rather than silently honouring the old link.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NotificationCategory } from './preferences'

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365 // 365 days

interface TokenPayload {
  uid: string
  cat: NotificationCategory
  iat: number
  exp: number
}

function getSecret(): string {
  const secret = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('NOTIFICATION_UNSUBSCRIBE_SECRET missing or too short')
  }
  return secret
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return Buffer.from(padded + pad, 'base64')
}

function hmac(payload: string): string {
  return base64url(createHmac('sha256', getSecret()).update(payload).digest())
}

export function generateUnsubscribeToken(
  userId: string,
  category: NotificationCategory,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const payload: TokenPayload = {
    uid: userId,
    cat: category,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
  }
  const payloadStr = base64url(JSON.stringify(payload))
  const sig = hmac(payloadStr)
  return `${payloadStr}.${sig}`
}

export type VerifyResult =
  | { valid: true; userId: string; category: NotificationCategory }
  | { valid: false; reason: 'malformed' | 'bad_signature' | 'expired' }

export function verifyUnsubscribeToken(token: string): VerifyResult {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'malformed' }
  }
  const [payloadStr, sig] = token.split('.', 2)
  if (!payloadStr || !sig) return { valid: false, reason: 'malformed' }

  // Constant-time signature compare. Length mismatch → bad_signature.
  let expected: string
  try {
    expected = hmac(payloadStr)
  } catch {
    // Secret missing — treat as malformed; never throw to caller.
    return { valid: false, reason: 'malformed' }
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad_signature' }
  }

  let payload: TokenPayload
  try {
    payload = JSON.parse(base64urlDecode(payloadStr).toString('utf8'))
  } catch {
    return { valid: false, reason: 'malformed' }
  }

  if (
    typeof payload.uid !== 'string' ||
    typeof payload.cat !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return { valid: false, reason: 'malformed' }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  if (payload.exp < nowSec) {
    return { valid: false, reason: 'expired' }
  }

  return { valid: true, userId: payload.uid, category: payload.cat as NotificationCategory }
}
