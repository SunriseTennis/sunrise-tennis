import Link from 'next/link'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { getCurrentTermRange } from '@/lib/utils/school-terms'
import { getMultiGroupUsage, getEarlyBirdUsage } from '@/lib/utils/discount-stats'
import { MULTI_GROUP_DISCOUNT_PCT } from '@/lib/utils/player-pricing'
import { Card, CardContent } from '@/components/ui/card'
import { Tag, Sparkles, ShieldCheck, Archive, ChevronRight } from 'lucide-react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async function AdminDiscountsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { start: termStart, end: termEnd } = getCurrentTermRange(new Date())
  const startISO = `${termStart}T00:00:00Z`
  const endISO = `${termEnd}T23:59:59Z`
  const today = new Date().toISOString().split('T')[0]

  // Fetch in parallel
  const [
    multiGroupStats,
    { data: programs },
    { data: pricingRows },
  ] = await Promise.all([
    getMultiGroupUsage(supabase, startISO, endISO),
    supabase
      .from('programs')
      .select('id, name, type, day_of_week, status, early_pay_discount_pct, early_bird_deadline, early_pay_discount_pct_tier2, early_bird_deadline_tier2')
      .order('name'),
    supabase
      .from('family_pricing')
      .select('id, family_id, program_type, coach_id, per_session_cents, term_fee_cents, valid_from, valid_until, notes, families:family_id(display_id, family_name), coaches:coach_id(name)')
      .order('valid_from', { ascending: false }),
  ])

  // Per-program early-bird stats (parallel)
  const programsWithEb = (programs ?? []).filter(p =>
    p.status === 'active' && (p.early_pay_discount_pct || p.early_pay_discount_pct_tier2)
  )
  const ebStats = await Promise.all(
    programsWithEb.map(async p => {
      const stats = await getEarlyBirdUsage(supabase, p.id, startISO, endISO)
      const isExpired =
        (p.early_bird_deadline ? p.early_bird_deadline < today : true) &&
        (p.early_bird_deadline_tier2 ? p.early_bird_deadline_tier2 < today : true)
      return { ...p, ...stats, isExpired }
    })
  )

  const activeEb = ebStats.filter(p => !p.isExpired)
  const expiredEb = ebStats.filter(p => p.isExpired)

  // Family pricing — partition active vs archived
  const enrichedPricing = (pricingRows ?? []).map(p => {
    const family = p.families as unknown as { display_id: string; family_name: string } | null
    const coach = p.coaches as unknown as { name: string } | null
    const isActive = !p.valid_until || p.valid_until >= today
    return {
      id: p.id,
      family_id: p.family_id,
      family_label: `${family?.display_id ?? ''} ${family?.family_name ?? ''}`.trim(),
      program_type: p.program_type,
      coach_name: coach?.name ?? null,
      per_session_cents: p.per_session_cents,
      term_fee_cents: p.term_fee_cents,
      valid_from: p.valid_from,
      valid_until: p.valid_until,
      notes: p.notes,
      isActive,
    }
  })

  const activePricing = enrichedPricing.filter(p => p.isActive)
  const archivedPricing = enrichedPricing.filter(p => !p.isActive)

  function rateLabel(p: typeof enrichedPricing[number]): string {
    if (p.per_session_cents != null) {
      return p.program_type === 'private'
        ? `${formatCurrency(p.per_session_cents)} / 30min`
        : `${formatCurrency(p.per_session_cents)} / session`
    }
    if (p.term_fee_cents != null) return `${formatCurrency(p.term_fee_cents)} / term`
    return '—'
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative">
          <p className="text-sm font-medium text-white/80">Admin</p>
          <h1 className="text-2xl font-bold">Discount Centre</h1>
          <p className="mt-0.5 text-sm text-white/70">
            Every discount in one place — platform rules, per-program early-bird campaigns, and per-family overrides.
          </p>
        </div>
      </div>

      {/* Section 1 — Platform rules */}
      <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="size-4" /> Platform-wide
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                  {MULTI_GROUP_DISCOUNT_PCT}% off
                </span>
                <h3 className="text-base font-semibold text-foreground">Multi-group</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Second+ group/squad per player at {MULTI_GROUP_DISCOUNT_PCT}% off. Per player (siblings don&apos;t share).
                Recalculated at every billing event. Composes with morning-squad partner rate as best-deal-wins.
                Multiplicative with early-bird.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-muted/30 px-3 py-2 text-xs">
                <div>
                  <p className="text-muted-foreground">This term</p>
                  <p className="font-semibold tabular-nums">{multiGroupStats.chargeCount} {multiGroupStats.chargeCount === 1 ? 'charge' : 'charges'}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground">Total saved</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(multiGroupStats.savedCents)}</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Edit the percentage in <code className="rounded bg-muted px-1 py-0.5">src/lib/utils/player-pricing.ts</code>
                {' '}(constant <code className="rounded bg-muted px-1 py-0.5">MULTI_GROUP_DISCOUNT_PCT</code>). DB-config slot is reserved for when a second platform discount needs editing.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                  $15 flat
                </span>
                <h3 className="text-base font-semibold text-foreground">Morning-squad partner</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                When a player is enrolled in BOTH Tue and Wed Morning Squad, both squads price at $15/session
                (instead of $25). Best-deal-wins: when this fires, the {MULTI_GROUP_DISCOUNT_PCT}% multi-group does NOT
                also stack on top.
              </p>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Implementation: <code className="rounded bg-muted px-1 py-0.5">getMorningSquadPartnerPrice</code> in player-pricing.ts.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 2 — Early-bird campaigns */}
      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Tag className="size-4" /> Early-bird (per program)
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {activeEb.length} active
          </span>
        </h2>
        {activeEb.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No active early-bird campaigns. Configure tier 1/tier 2 percent + deadline on each program&apos;s edit form.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Program</th>
                      <th className="px-3 py-2 text-left">Tier 1</th>
                      <th className="px-3 py-2 text-left">Tier 2</th>
                      <th className="px-3 py-2 text-right">Uses</th>
                      <th className="px-3 py-2 text-right">Saved</th>
                      <th className="px-3 py-2 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {activeEb.map(p => (
                      <tr key={p.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.day_of_week != null ? DAYS[p.day_of_week] : ''} · {p.type}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {p.early_pay_discount_pct ? (
                            <>
                              <span className="font-medium">{p.early_pay_discount_pct}%</span>
                              <span className="text-muted-foreground"> until {p.early_bird_deadline ? formatDate(p.early_bird_deadline) : '—'}</span>
                            </>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {p.early_pay_discount_pct_tier2 ? (
                            <>
                              <span className="font-medium">{p.early_pay_discount_pct_tier2}%</span>
                              <span className="text-muted-foreground"> until {p.early_bird_deadline_tier2 ? formatDate(p.early_bird_deadline_tier2) : '—'}</span>
                            </>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.chargeCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.savedCents)}</td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/admin/programs/${p.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            Edit <ChevronRight className="size-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Stats are approximate when historical charges don&apos;t carry the breakdown JSON yet — they fall back to
                description-suffix matching.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Section 3 — Family-level overrides */}
      <section className="animate-fade-up" style={{ animationDelay: '240ms' }}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="size-4" /> Family overrides (grandfathered + per-coach)
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {activePricing.length} active
          </span>
        </h2>
        {activePricing.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No active family overrides. Add bulk grandfathered rates from <Link href="/admin/payments" className="text-primary hover:underline">Admin → Payments</Link>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Family</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Coach</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-left">From</th>
                      <th className="px-3 py-2 text-left">Until</th>
                      <th className="px-3 py-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {activePricing.map(p => (
                      <tr key={p.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <Link href={`/admin/families/${p.family_id}`} className="font-medium hover:text-primary transition-colors">
                            {p.family_label}
                          </Link>
                        </td>
                        <td className="px-3 py-2 capitalize text-muted-foreground">{p.program_type}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.coach_name ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{rateLabel(p)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.valid_from ? formatDate(p.valid_from) : '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.valid_until ? formatDate(p.valid_until) : 'No end'}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={p.notes ?? ''}>{p.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Cancel an override from <Link href="/admin/payments" className="text-primary hover:underline">Admin → Payments → Active grandfathered rates</Link>.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Section 4 — Archive */}
      <section className="animate-fade-up" style={{ animationDelay: '320ms' }}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Archive className="size-4" /> Archive
        </h2>
        <Card>
          <CardContent>
            {expiredEb.length === 0 && archivedPricing.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing archived yet.</p>
            ) : (
              <div className="space-y-5">
                {expiredEb.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Expired early-bird campaigns ({expiredEb.length})</p>
                    <ul className="space-y-1.5">
                      {expiredEb.map(p => (
                        <li key={p.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                          <Link href={`/admin/programs/${p.id}`} className="font-medium hover:text-primary transition-colors">
                            {p.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {p.chargeCount} uses · {formatCurrency(p.savedCents)} saved
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {archivedPricing.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Ended family overrides ({archivedPricing.length})</p>
                    <ul className="space-y-1.5">
                      {archivedPricing.map(p => (
                        <li key={p.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                          <span>
                            <Link href={`/admin/families/${p.family_id}`} className="font-medium hover:text-primary transition-colors">
                              {p.family_label}
                            </Link>
                            <span className="ml-2 text-xs capitalize text-muted-foreground">
                              {p.program_type}{p.coach_name ? ` · ${p.coach_name}` : ''}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {rateLabel(p)} · {p.valid_from ? formatDate(p.valid_from) : '—'} → {p.valid_until ? formatDate(p.valid_until) : '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
