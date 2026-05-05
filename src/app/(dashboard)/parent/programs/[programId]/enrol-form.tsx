'use client'

import { useRef, useState } from 'react'
import { enrolInProgram } from '../actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/currency'
import { CheckCircle, Clock, Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { getActiveEarlyBird } from '@/lib/utils/eligibility'
import { CreditChip } from '@/components/credit-chip'
import { MultiGroupChip } from '@/components/multi-group-chip'
import { MULTI_GROUP_DISCOUNT_PCT } from '@/lib/utils/player-pricing'
import { EnrolPayModal } from './enrol-pay-modal'

type PlayerOption = {
  id: string
  name: string
  firstName: string
  level: string | null
  /** Effective per-session price after partner-rate replacement + multi-group. */
  effectivePerSessionCents: number
  /** Pre-multi-group base — equals effective when no multi-group; equals partner-rate $15 when partner-rate fires. */
  basePerSessionCents: number
  /** True when the morning-squad cross-day partner rate replaced the base price ($15 flat). */
  morningSquadPartnerApplied: boolean
  /** True when 25% multi-group is layered on top of basePerSessionCents. */
  multiGroupApplied: boolean
}

export function EnrolForm({
  programId,
  familyId,
  players,
  programLevel,
  termFeeCents: _termFeeCents,
  perSessionCents,
  earlyPayDiscountPct,
  earlyBirdDeadline,
  earlyPayDiscountPctTier2,
  earlyBirdDeadlineTier2,
  remainingSessions,
  confirmedCreditCents = 0,
}: {
  programId: string
  familyId: string
  players: PlayerOption[]
  programLevel: string
  termFeeCents?: number | null
  perSessionCents?: number | null
  earlyPayDiscountPct?: number | null
  earlyBirdDeadline?: string | null
  earlyPayDiscountPctTier2?: number | null
  earlyBirdDeadlineTier2?: string | null
  remainingSessions?: number | null
  confirmedCreditCents?: number
}) {
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(players.length === 1 ? [players[0].id] : [])
  const [bookingType, setBookingType] = useState('term')
  const [paymentOption, setPaymentOption] = useState<'pay_now' | 'pay_later'>('pay_later')
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payModalFormData, setPayModalFormData] = useState<FormData | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const enrolWithIds = enrolInProgram.bind(null, programId, familyId)

  const isInlineStripePayNow =
    bookingType === 'term'
    && paymentOption === 'pay_now'
    && selectedPlayerIds.length === 1

  function onSubmitIntercept(e: React.FormEvent<HTMLFormElement>) {
    if (!isInlineStripePayNow) return // let the form action run
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setPayModalFormData(fd)
    setPayModalOpen(true)
  }

  const showPaymentOptions = bookingType === 'term'
  const eb = getActiveEarlyBird({
    early_pay_discount_pct: earlyPayDiscountPct,
    early_bird_deadline: earlyBirdDeadline,
    early_pay_discount_pct_tier2: earlyPayDiscountPctTier2,
    early_bird_deadline_tier2: earlyBirdDeadlineTier2,
  })
  const hasDiscount = eb.pct > 0
  const activeDiscountPct = eb.pct

  const sessions = remainingSessions ?? 0
  const playerById = new Map(players.map(p => [p.id, p]))
  const selectedPlayers = selectedPlayerIds.map(id => playerById.get(id)).filter((p): p is PlayerOption => !!p)

  // Aggregate term price across selected players. Each player contributes
  // their own effective per-session × sessions. Multi-group + partner-rate
  // are baked into effectivePerSessionCents already.
  const fallbackPerSession = perSessionCents ?? 0
  const termSubtotalGross = sessions * selectedPlayers.reduce((sum, p) => sum + (p.basePerSessionCents || fallbackPerSession), 0)
  const termSubtotalEffective = sessions * selectedPlayers.reduce((sum, p) => sum + p.effectivePerSessionCents, 0)
  const subtotalSavings = termSubtotalGross - termSubtotalEffective

  const termPrice = termSubtotalEffective > 0 ? termSubtotalEffective : null
  const discountedPrice = termPrice && hasDiscount
    ? Math.round(termPrice * (1 - activeDiscountPct / 100))
    : termPrice
  const finalTotal = discountedPrice ?? termPrice ?? 0

  // Buckets for the per-player line list inside the Pay Now card.
  const partnerRatePlayers = selectedPlayers.filter(p => p.morningSquadPartnerApplied)
  const multiGroupPlayers = selectedPlayers.filter(p => p.multiGroupApplied && !p.morningSquadPartnerApplied)
  const fullPricePlayers = selectedPlayers.filter(p => !p.morningSquadPartnerApplied && !p.multiGroupApplied)

  // For the multi-group chip + casual tile.
  const anySelectedGetsMultiGroup = selectedPlayers.some(p => p.multiGroupApplied)
  const multiGroupPlayerNames = multiGroupPlayers.map(p => p.firstName)
  const multiGroupSavingsCents = sessions > 0
    ? multiGroupPlayers.reduce((sum, p) => sum + sessions * (p.basePerSessionCents - p.effectivePerSessionCents), 0)
    : multiGroupPlayers.reduce((sum, p) => sum + (p.basePerSessionCents - p.effectivePerSessionCents), 0)

  // Casual session: per-player effective (already includes partner-rate / multi-group).
  const casualSelectedPlayers = selectedPlayers // same selection list

  return (
    <>
    <form ref={formRef} action={enrolWithIds} onSubmit={onSubmitIntercept}>
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-foreground">Enrol Players</h2>

          <div className="mt-4">
            <Label>Select players</Label>
            <div className="mt-2 space-y-2">
              {players.map((player) => {
                const isSelected = selectedPlayerIds.includes(player.id)
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayerIds(prev =>
                      prev.includes(player.id)
                        ? prev.filter(id => id !== player.id)
                        : [...prev, player.id]
                    )}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-muted/30'
                    )}
                  >
                    <div className={cn(
                      'flex size-5 items-center justify-center rounded-md border transition-colors',
                      isSelected ? 'border-primary bg-primary text-white' : 'border-border'
                    )}>
                      {isSelected && <Check className="size-3" />}
                    </div>
                    <span className="text-sm font-medium text-foreground">{player.name}</span>
                    {player.level && player.level !== programLevel && (
                      <span className="text-xs text-muted-foreground">({player.level} ball)</span>
                    )}
                  </button>
                )
              })}
            </div>
            {selectedPlayerIds.map(id => (
              <input key={id} type="hidden" name="player_id" value={id} />
            ))}
          </div>

          <div className="mt-4">
            <Label htmlFor="booking_type">Booking type</Label>
            <select
              id="booking_type"
              name="booking_type"
              required
              value={bookingType}
              onChange={(e) => setBookingType(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="term">Term enrolment</option>
              <option value="trial">Trial session</option>
              <option value="casual">Casual (single session)</option>
            </select>
          </div>

          {/* Pay Now / Pay Later for term enrollments — both show the EFFECTIVE
              total (partner-rate + multi-group resolved per player). Pay Now
              also breaks it down line-by-line and applies early-bird. */}
          {showPaymentOptions && termPrice && sessions > 0 && (
            <div className="mt-5">
              <Label>Payment option</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentOption('pay_now')}
                  className={`group relative rounded-xl border p-4 text-left transition-all ${
                    paymentOption === 'pay_now'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex size-8 items-center justify-center rounded-lg shrink-0 ${
                      paymentOption === 'pay_now' ? 'bg-primary/15' : 'bg-muted'
                    }`}>
                      <CheckCircle className={`size-4 ${paymentOption === 'pay_now' ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">Pay now</p>
                      <div className="mt-1 space-y-0.5 text-xs">
                        {/* Per-bucket lines so partner-rate vs full-price players each render correctly. */}
                        {partnerRatePlayers.map(p => (
                          <div key={p.id} className="flex justify-between text-muted-foreground">
                            <span className="truncate">{p.firstName}: {sessions} × {formatCurrency(p.effectivePerSessionCents)} <span className="text-success font-medium">(morning-squad pair)</span></span>
                            <span className="tabular-nums shrink-0 ml-2">{formatCurrency(p.effectivePerSessionCents * sessions)}</span>
                          </div>
                        ))}
                        {multiGroupPlayers.map(p => (
                          <div key={p.id} className="flex justify-between text-muted-foreground">
                            <span className="truncate">{p.firstName}: {sessions} × {formatCurrency(p.basePerSessionCents)}</span>
                            <span className="tabular-nums shrink-0 ml-2">{formatCurrency(p.basePerSessionCents * sessions)}</span>
                          </div>
                        ))}
                        {fullPricePlayers.map(p => (
                          <div key={p.id} className="flex justify-between text-muted-foreground">
                            <span className="truncate">{p.firstName}: {sessions} × {formatCurrency(p.basePerSessionCents)}</span>
                            <span className="tabular-nums shrink-0 ml-2">{formatCurrency(p.basePerSessionCents * sessions)}</span>
                          </div>
                        ))}
                        {/* Multi-group savings: line-item the discount that the partner-rate players already had baked in is NOT re-listed (they don't get an extra 25% on top). */}
                        {multiGroupPlayers.length > 0 && multiGroupSavingsCents > 0 && (
                          <div className="flex justify-between text-success">
                            <span>– Multi-group ({MULTI_GROUP_DISCOUNT_PCT}%)</span>
                            <span className="tabular-nums">−{formatCurrency(multiGroupSavingsCents)}</span>
                          </div>
                        )}
                        {hasDiscount && discountedPrice !== null && termPrice && discountedPrice < termPrice && (
                          <div className="flex justify-between text-success">
                            <span>– Early-bird ({activeDiscountPct}%)</span>
                            <span className="tabular-nums">−{formatCurrency(termPrice - discountedPrice)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-border/50 pt-0.5 text-sm font-bold text-primary">
                          <span>Total</span>
                          <span className="tabular-nums">{formatCurrency(finalTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentOption('pay_later')}
                  className={`group relative rounded-xl border p-4 text-left transition-all ${
                    paymentOption === 'pay_later'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex size-8 items-center justify-center rounded-lg ${
                      paymentOption === 'pay_later' ? 'bg-primary/15' : 'bg-muted'
                    }`}>
                      <Clock className={`size-4 ${paymentOption === 'pay_later' ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">Pay later</p>
                      <p className="mt-0.5 text-sm tabular-nums text-foreground">
                        {formatCurrency(termSubtotalEffective)}
                      </p>
                      {/* Show the gross strikethrough only when there's a real discount baked in. */}
                      {subtotalSavings > 0 && (
                        <p className="text-xs text-muted-foreground">
                          <span className="line-through">{formatCurrency(termSubtotalGross)}</span>{' '}
                          <span className="text-success font-medium">save {formatCurrency(subtotalSavings)}</span>
                        </p>
                      )}
                      {selectedPlayers.length === 1 && (
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(selectedPlayers[0].effectivePerSessionCents)}/session — charged as you attend
                        </p>
                      )}
                      {selectedPlayers.length > 1 && (
                        <p className="text-xs text-muted-foreground">
                          per-session, charged as each player attends
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              </div>
              <input type="hidden" name="payment_option" value={paymentOption} />
            </div>
          )}

          {/* Casual/trial pricing — per-player when partner-rate / multi-group differ. */}
          {bookingType === 'casual' && casualSelectedPlayers.length > 0 && (
            <div className="mt-3 rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
              {casualSelectedPlayers.length === 1 ? (
                <CasualPlayerLine player={casualSelectedPlayers[0]} fallbackPerSession={fallbackPerSession} />
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Session fee</p>
                  {casualSelectedPlayers.map(p => (
                    <div key={p.id} className="flex justify-between text-sm">
                      <span className="text-foreground">{p.firstName}</span>
                      <CasualPlayerLine player={p} fallbackPerSession={fallbackPerSession} compact />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {bookingType === 'trial' && (
            <div className="mt-3 rounded-lg bg-success/5 border border-success/20 px-4 py-2.5 text-sm text-success">
              Trial sessions are free - come try it out!
            </div>
          )}

          <div className="mt-4">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Any special requirements or comments..."
              className="mt-1"
            />
          </div>

          {anySelectedGetsMultiGroup && bookingType !== 'trial' && multiGroupSavingsCents > 0 && (
            <div className="mt-3">
              <MultiGroupChip
                state="applied"
                playerName={multiGroupPlayerNames.length === 1 ? multiGroupPlayerNames[0] : null}
                savingsCents={multiGroupSavingsCents}
                size="md"
              />
            </div>
          )}

          {confirmedCreditCents > 0 && bookingType === 'term' && finalTotal > 0 && (
            <div className="mt-3">
              <CreditChip
                creditCents={confirmedCreditCents}
                costCents={finalTotal}
              />
            </div>
          )}
          {confirmedCreditCents > 0 && bookingType === 'casual' && casualSelectedPlayers.length > 0 && (
            <div className="mt-3">
              <CreditChip
                creditCents={confirmedCreditCents}
                costCents={casualSelectedPlayers.reduce((sum, p) => sum + p.effectivePerSessionCents, 0)}
              />
            </div>
          )}

          {/* Multi-player + Pay Now: Stripe inline modal handles one player at a time;
              fall back to old redirect-to-payments flow until per-multi-player intent lands. */}
          {bookingType === 'term' && paymentOption === 'pay_now' && selectedPlayerIds.length > 1 && (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning-light/40 px-3 py-2 text-xs text-warning-foreground">
              Multi-player Pay Now will create the bookings now and send you to the payments page to pay. To pay inline at the card prompt, enrol players one at a time.
            </p>
          )}

          <div className="mt-4">
            <Button type="submit" disabled={selectedPlayerIds.length === 0}>
              {bookingType === 'term' && paymentOption === 'pay_now'
                ? `Enrol & Pay ${formatCurrency(finalTotal)}`
                : selectedPlayerIds.length > 1
                  ? `Enrol ${selectedPlayerIds.length} Players`
                  : 'Confirm Enrolment'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>

    <EnrolPayModal
      open={payModalOpen}
      onClose={() => setPayModalOpen(false)}
      programId={programId}
      programName={'this program'}
      playerName={
        selectedPlayers[0]?.firstName ?? ''
      }
      formData={payModalFormData}
    />
    </>
  )
}

function CasualPlayerLine({
  player,
  fallbackPerSession,
  compact = false,
}: {
  player: PlayerOption
  fallbackPerSession: number
  compact?: boolean
}) {
  const baseCents = player.basePerSessionCents || fallbackPerSession
  const effectiveCents = player.effectivePerSessionCents

  if (player.morningSquadPartnerApplied) {
    return (
      <span className={compact ? 'tabular-nums' : ''}>
        {!compact && <span className="text-muted-foreground">Session fee: </span>}
        <span className="font-medium text-foreground tabular-nums">{formatCurrency(effectiveCents)}</span>
        {!compact && (
          <span className="ml-1.5 text-xs font-medium text-success">morning-squad pair rate</span>
        )}
      </span>
    )
  }

  if (player.multiGroupApplied) {
    return (
      <span className={compact ? 'tabular-nums' : ''}>
        {!compact && <span className="text-muted-foreground">Session fee: </span>}
        <span className="font-medium text-foreground tabular-nums">{formatCurrency(effectiveCents)}</span>
        <span className="ml-1.5 text-xs text-muted-foreground line-through tabular-nums">{formatCurrency(baseCents)}</span>
        {!compact && (
          <span className="ml-1.5 text-xs font-medium text-success">{MULTI_GROUP_DISCOUNT_PCT}% off</span>
        )}
      </span>
    )
  }

  return (
    <span className={compact ? 'tabular-nums' : ''}>
      {!compact && <span className="text-muted-foreground">Session fee: </span>}
      <span className="font-medium text-foreground tabular-nums">{formatCurrency(effectiveCents)}</span>
    </span>
  )
}
