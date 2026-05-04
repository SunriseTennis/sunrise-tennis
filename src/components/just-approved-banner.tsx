'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Sparkles, X } from 'lucide-react'
import { dismissJustApprovedBanner } from '@/app/(dashboard)/parent/actions'

/**
 * Plan 17 Block D — "You're approved!" banner shown on /parent for the
 * first 14 days after a family is approved (or until dismissed). Three
 * starting-point CTAs match the email body so the in-app + email
 * experience match.
 */
export function JustApprovedBanner({ familyId }: { familyId: string }) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  function handleDismiss() {
    setHidden(true)
    void dismissJustApprovedBanner(familyId)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated animate-fade-up">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-3 top-3 rounded-full bg-white/15 p-1.5 backdrop-blur-sm transition-colors hover:bg-white/25"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
          <Sparkles className="size-5" />
        </div>
        <div className="flex-1 pr-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/80">Welcome aboard</p>
          <h2 className="mt-1 text-xl font-bold">You&apos;re approved!</h2>
          <p className="mt-1.5 text-sm text-white/85">
            Your account is live. Pick a starting point:
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link href="/parent/programs" className="rounded-lg bg-white/15 px-3 py-2.5 text-center text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/25">
              Browse programs
            </Link>
            <Link href="/parent/bookings" className="rounded-lg bg-white/15 px-3 py-2.5 text-center text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/25">
              Book a private
            </Link>
            <Link href="/parent/settings" className="rounded-lg bg-white/15 px-3 py-2.5 text-center text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/25">
              Account settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
