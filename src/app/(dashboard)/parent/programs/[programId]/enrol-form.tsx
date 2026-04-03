'use client'

import { useState } from 'react'
import { enrolInProgram } from '../actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/currency'
import { CheckCircle, Clock } from 'lucide-react'

export function EnrolForm({
  programId,
  familyId,
  players,
  programLevel,
  termFeeCents,
  perSessionCents,
  earlyPayDiscountPct,
  earlyBirdDeadline,
  remainingSessions,
}: {
  programId: string
  familyId: string
  players: { id: string; name: string; level: string | null }[]
  programLevel: string
  termFeeCents?: number | null
  perSessionCents?: number | null
  earlyPayDiscountPct?: number | null
  earlyBirdDeadline?: string | null
  remainingSessions?: number | null
}) {
  const [bookingType, setBookingType] = useState('term')
  const [paymentOption, setPaymentOption] = useState<'pay_now' | 'pay_later'>('pay_later')

  const enrolWithIds = enrolInProgram.bind(null, programId, familyId)

  const showPaymentOptions = bookingType === 'term'
  const todayStr = new Date().toISOString().split('T')[0]
  const deadlineActive = !earlyBirdDeadline || todayStr <= earlyBirdDeadline
  const hasDiscount = earlyPayDiscountPct && earlyPayDiscountPct > 0 && deadlineActive

  // Calculate prices
  const termPrice = termFeeCents ?? (perSessionCents && remainingSessions ? perSessionCents * remainingSessions : null)
  const discountedPrice = termPrice && hasDiscount
    ? Math.round(termPrice * (1 - earlyPayDiscountPct / 100))
    : termPrice

  return (
    <form action={enrolWithIds}>
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-foreground">Enrol a Player</h2>

          <div className="mt-4">
            <Label htmlFor="player_id">Select player</Label>
            <select
              id="player_id"
              name="player_id"
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Choose a player...</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                  {player.level && player.level !== programLevel && ` (${player.level} ball)`}
                </option>
              ))}
            </select>
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
                            {earlyPayDiscountPct}% off
                          </span>
                        </div>
                      ) : (
                        <p className="mt-0.5 text-sm font-bold text-primary tabular-nums">
                          {formatCurrency(termPrice)}
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

          <div className="mt-4">
            <Button type="submit">
              {bookingType === 'term' && paymentOption === 'pay_now'
                ? `Enrol & Pay ${formatCurrency(discountedPrice ?? termPrice ?? 0)}`
                : 'Confirm Enrolment'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
