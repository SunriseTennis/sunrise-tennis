import Link from 'next/link'
import { Clock, MessageSquare } from 'lucide-react'

interface Props {
  status: 'pending_review' | 'changes_requested'
  note: string | null
  hasPlayers: boolean
}

/**
 * Plan 15 Phase C — calm informational banner for self-signup families
 * waiting on approval. Deliberately not punitive — the dashboard is a
 * tool not a dunning surface (Zanshin/Decisions/platform/parent-overview.md).
 */
export function PendingApprovalBanner({ status, note, hasPlayers }: Props) {
  if (status === 'changes_requested') {
    return (
      <div
        className="animate-fade-up rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-card"
        style={{ animationDelay: '20ms' }}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-200">
            <MessageSquare className="size-4 text-amber-800" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-900">One thing to update</p>
            {note && (
              <p className="mt-1 text-sm text-amber-900/90 whitespace-pre-wrap">{note}</p>
            )}
            <p className="mt-2 text-xs text-amber-900/70">
              Once you&apos;ve made the change, your account will be re-reviewed automatically.
            </p>
            {!hasPlayers && (
              <Link
                href="/parent/players/new"
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
              >
                + Add a player
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  // pending_review
  return (
    <div
      className="animate-fade-up rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-card"
      style={{ animationDelay: '20ms' }}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <Clock className="size-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Your account is being reviewed</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Maxim usually approves new families within 24 hours. While you wait, feel free to{' '}
            <Link href="/parent/programs" className="font-medium text-primary hover:text-primary/80">browse our programs</Link>
            {hasPlayers ? (
              <>
                {' '}or{' '}
                <Link href="/parent" className="font-medium text-primary hover:text-primary/80">add more player details</Link>.
              </>
            ) : (
              <>
                {' '}or{' '}
                <Link href="/parent/players/new" className="font-medium text-primary hover:text-primary/80">add your first player</Link>.
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-muted-foreground/80">
            You&apos;ll get a notification the moment we&apos;re ready.
          </p>
        </div>
      </div>
    </div>
  )
}
