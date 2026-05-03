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
  /** True when enrolling this player in this program will trigger the 25% multi-group discount. */
  willGetMultiGroupDiscount: boolean
}

export function EnrolForm({
  programId,
  familyId,
  players,
  programLevel,
  termFeeCents,
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

  // Calculate prices — per-player, accounting for multi-group discount per player
  const playerCount = Math.max(selectedPlayerIds.length, 1)
  const sessions = remainingSessions ?? 0
  const playerById = new Map(players.map(p => [p.id, p]))
  const discountFactor = 1 - MULTI_GROUP_DISCOUNT_PCT / 100

  function effectivePerSession(player: PlayerOption | undefined, applyMultiGroup: boolean) {
    if (!perSessionCents || !player) return perSessionCents ?? 0
    return applyMultiGroup ? Math.round(perSessionCents * discountFactor) : perSessionCents
  }

  const selectedPlayers = selectedPlayerIds.map(id => playerById.get(id)).filter((p): p is PlayerOption => !!p)
  const anySelectedGetsMultiGroup = selectedPlayers.some(p => p.willGetMultiGroupDiscount)
  const multiGroupPlayerNames = selectedPlayers.filter(p => p.willGetMultiGroupDiscount).map(p => p.firstName)

  // Term price (gross, no early-pay) summed per-selected-player with their per-player rate
  const termPricePerPlayerGross = perSessionCents && sessions ? perSessionCents * sessions : null
  const termPriceGross = termPricePerPlayerGross ? termPricePerPlayerGross * playerCount : null

  const termPriceWithMultiGroup = perSessionCents && sessions && selectedPlayers.length > 0
    ? selectedPlayers.reduce((sum, p) => sum + effectivePerSession(p, p.willGetMultiGroupDiscount) * sessions, 0)
    : termPriceGross
  const multiGroupSavings = (termPriceGross ?? 0) - (termPriceWithMultiGroup ?? 0)

  // Backwards-compat aliases used downstream in the JSX
  const termPrice = termPriceWithMultiGroup
  const discountedPrice = termPrice && hasDiscount
    ? Math.round(termPrice * (1 - activeDiscountPct / 100))
    : termPrice

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

          {/* Pay Now / Pay Later for term enrollments */}
          {showPaymentOptions && termPrice && (
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
                      {/* Layered breakdown */}
                      {(termPriceGross && termPriceGross > 0) ? (
                        <div className="mt-1 space-y-0.5 text-xs">
                          {remainingSessions && perSessionCents && playerCount > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                              <span>{remainingSessions} sessions × {formatCurrency(perSessionCents)}{playerCount > 1 ? ` × ${playerCount} players` : ''}</span>
                              <span className="tabular-nums">{formatCurrency(termPriceGross)}</span>
                            </div>
                          )}
                          {anySelectedGetsMultiGroup && multiGroupSavings > 0 && (
                            <div className="flex justify-between text-success">
                              <span>– Multi-group ({MULTI_GROUP_DISCOUNT_PCT}%)</span>
                              <span className="tabular-nums">−{formatCurrency(multiGroupSavings)}</span>
                            </div>
                          )}
                          {hasDiscount && discountedPrice && termPrice && discountedPrice < termPrice && (
                            <div className="flex justify-between text-success">
                              <span>– Early-bird ({activeDiscountPct}%)</span>
                              <span className="tabular-nums">−{formatCurrency(termPrice - discountedPrice)}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-border/50 pt-0.5 text-sm font-bold text-primary">
                            <span>Total</span>
                            <span className="tabular-nums">{formatCurrency(discountedPrice ?? termPrice ?? 0)}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-0.5 text-sm font-bold text-primary tabular-nums">
                          {formatCurrency(termPrice ?? 0)}
                        </p>
                      )}
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
                    <div>
                      <p className="font-medium text-foreground">Pay later</p>
                      <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                        {formatCurrency(termPrice)} full price
                      </p>
                      {perSessionCents && (
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(perSessionCents)}/session - charged as you attend
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              </div>
              <input type="hidden" name="payment_option" value={paymentOption} />
            </div>
          )}

          {/* Casual/trial pricing */}
          {bookingType === 'casual' && perSessionCents && (
            <div className="mt-3 rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">Session fee: </span>
              {anySelectedGetsMultiGroup ? (
                <>
                  <span className="font-medium text-foreground tabular-nums">{formatCurrency(Math.round(perSessionCents * discountFactor))}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground line-through tabular-nums">{formatCurrency(perSessionCents)}</span>
                  <span className="ml-1.5 text-xs font-medium text-success">{MULTI_GROUP_DISCOUNT_PCT}% off</span>
                </>
              ) : (
                <span className="font-medium text-foreground tabular-nums">{formatCurrency(perSessionCents)}</span>
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

          {anySelectedGetsMultiGroup && bookingType !== 'trial' && (
            <div className="mt-3">
              <MultiGroupChip
                state="applied"
                playerName={multiGroupPlayerNames.length === 1 ? multiGroupPlayerNames[0] : null}
                savingsCents={bookingType === 'casual'
                  ? selectedPlayers.filter(p => p.willGetMultiGroupDiscount).length * Math.round((perSessionCents ?? 0) * (MULTI_GROUP_DISCOUNT_PCT / 100))
                  : multiGroupSavings}
                size="md"
              />
            </div>
          )}

          {confirmedCreditCents > 0 && bookingType === 'term' && (discountedPrice ?? termPrice) && (
            <div className="mt-3">
              <CreditChip
                creditCents={confirmedCreditCents}
                costCents={(discountedPrice ?? termPrice ?? 0) * Math.max(selectedPlayerIds.length, 1)}
              />
            </div>
          )}
          {confirmedCreditCents > 0 && bookingType === 'casual' && perSessionCents && (
            <div className="mt-3">
              <CreditChip
                creditCents={confirmedCreditCents}
                costCents={perSessionCents}
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
                ? `Enrol & Pay ${formatCurrency((discountedPrice ?? termPrice ?? 0) * selectedPlayerIds.length)}`
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
