'use client'

import { useState } from 'react'
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
  players: { id: string; name: string; level: string | null }[]
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

  const enrolWithIds = enrolInProgram.bind(null, programId, familyId)

  const showPaymentOptions = bookingType === 'term'
  const eb = getActiveEarlyBird({
    early_pay_discount_pct: earlyPayDiscountPct,
    early_bird_deadline: earlyBirdDeadline,
    early_pay_discount_pct_tier2: earlyPayDiscountPctTier2,
    early_bird_deadline_tier2: earlyBirdDeadlineTier2,
  })
  const hasDiscount = eb.pct > 0
  const activeDiscountPct = eb.pct

  // Calculate prices — always from per-session × remaining × number of players
  const playerCount = Math.max(selectedPlayerIds.length, 1)
  const termPricePerPlayer = perSessionCents && remainingSessions ? perSessionCents * remainingSessions : null
  const termPrice = termPricePerPlayer ? termPricePerPlayer * playerCount : null
  const discountedPrice = termPrice && hasDiscount
    ? Math.round(termPrice * (1 - activeDiscountPct / 100))
    : termPrice

  return (
    <form action={enrolWithIds}>
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
                  <div className="flex items-center gap-3">
                    <div className={`flex size-8 items-center justify-center rounded-lg ${
                      paymentOption === 'pay_now' ? 'bg-primary/15' : 'bg-muted'
                    }`}>
                      <CheckCircle className={`size-4 ${paymentOption === 'pay_now' ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Pay now</p>
                      {hasDiscount && discountedPrice ? (
                        <div className="mt-0.5">
                          <span className="text-sm font-bold text-primary tabular-nums">
                            {formatCurrency(discountedPrice)}
                          </span>
                          <span className="ml-1.5 text-xs text-muted-foreground line-through tabular-nums">
                            {formatCurrency(termPrice)}
                          </span>
                          <span className="ml-1.5 text-xs font-medium text-success">
                            {activeDiscountPct}% off
                          </span>
                          {remainingSessions && (
                            <p className="text-xs text-muted-foreground">{remainingSessions} sessions remaining</p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-0.5">
                          <p className="text-sm font-bold text-primary tabular-nums">
                            {formatCurrency(termPrice)}
                          </p>
                          {remainingSessions && (
                            <p className="text-xs text-muted-foreground">{remainingSessions} sessions remaining</p>
                          )}
                        </div>
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
              <span className="font-medium text-foreground tabular-nums">{formatCurrency(perSessionCents)}</span>
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
  )
}
