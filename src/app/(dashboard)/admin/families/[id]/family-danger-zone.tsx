'use client'

/**
 * Plan 21 — danger zone on /admin/families/[id]. Three actions:
 *  - Archive / activate (status flip — soft, reversible, for families
 *    with operational history).
 *  - Delete (hard delete via `admin_delete_family` RPC — only succeeds
 *    when the family has zero players + zero operational rows).
 *  - Plan 25 add-on: Force-delete (admin_force_delete_test_family RPC) —
 *    only enabled when families.is_test=true. CASCADEs every dependent
 *    row. Toggle Mark/Unmark via setFamilyIsTest.
 *
 * The Delete button is disabled (with a tooltip) when the page already
 * knows the family has blockers, so admin doesn't waste a click.
 */

import { useState, useTransition } from 'react'
import { Archive, ArchiveRestore, FlaskConical, Skull, Trash2 } from 'lucide-react'
import { deleteFamily, forceDeleteTestFamily, setFamilyIsTest, setFamilyStatus } from '../../actions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Props {
  familyId: string
  status: 'active' | 'inactive' | 'archived'
  /** True when the page knows the family has FK dependents (players,
   *  charges, etc). Disables the Delete button up-front. */
  hasBlockers: boolean
  /** Human description of what's blocking, surfaced in tooltip. */
  blockerLabel?: string | null
  /** Plan 25 — families.is_test flag. Gates force-delete. */
  isTest: boolean
  /** Display id shown inside the force-delete confirmation. */
  displayId: string
}

export function FamilyDangerZone({ familyId, status, hasBlockers, blockerLabel, isTest, displayId }: Props) {
  const [archivePending, startArchive] = useTransition()
  const [deletePending, startDelete] = useTransition()
  const [forcePending, startForce] = useTransition()
  const [testFlagPending, startTestFlag] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [forceConfirmInput, setForceConfirmInput] = useState('')

  const isArchived = status === 'archived'
  const forceUnlocked = isTest && forceConfirmInput.trim().toUpperCase() === displayId.toUpperCase()

  function handleArchive() {
    startArchive(async () => {
      await setFamilyStatus(familyId, isArchived ? 'active' : 'archived')
    })
  }

  function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    startDelete(async () => {
      await deleteFamily(familyId, 'family')
    })
  }

  function handleToggleTest() {
    startTestFlag(async () => {
      await setFamilyIsTest(familyId, !isTest)
    })
  }

  function handleForce() {
    if (!forceUnlocked) return
    startForce(async () => {
      await forceDeleteTestFamily(familyId)
    })
  }

  return (
    <Card className="border-destructive/20">
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Archive hides the family from default lists but keeps every record
            (charges, sessions, notes). Reverse with Reactivate. Delete is
            permanent and only works on families with zero operational data.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleArchive}
            disabled={archivePending}
          >
            {isArchived ? (
              <>
                <ArchiveRestore className="mr-1.5 size-4" />
                {archivePending ? 'Reactivating…' : 'Reactivate family'}
              </>
            ) : (
              <>
                <Archive className="mr-1.5 size-4" />
                {archivePending ? 'Archiving…' : 'Archive family'}
              </>
            )}
          </Button>

          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={hasBlockers || deletePending}
              title={hasBlockers ? `Cannot delete — ${blockerLabel}. Archive instead.` : 'Permanently delete this family'}
            >
              <Trash2 className="mr-1.5 size-4" />
              {deletePending ? 'Deleting…' : confirming ? 'Confirm delete' : 'Delete family'}
            </Button>
            {confirming && !hasBlockers && (
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deletePending}
                className="text-left text-xs text-muted-foreground underline hover:text-foreground"
              >
                Cancel
              </button>
            )}
            {hasBlockers && (
              <p className="text-xs text-muted-foreground">
                Blocked: {blockerLabel}.
              </p>
            )}
          </div>
        </div>

        {/* ── Plan 25: test-family flag + force-delete ── */}
        <div className="mt-6 space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <FlaskConical className="size-4" />
            Test family controls
          </div>
          <p className="text-xs text-muted-foreground">
            Mark a family as a test account to unlock a cascade-delete that wipes
            every dependent row (charges, payments, bookings, attendances, notes,
            push subscriptions, etc) and renames the parent emails so the
            originals are freed for re-signup. Real families must stay unmarked.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleTest}
              disabled={testFlagPending}
            >
              <FlaskConical className="mr-1.5 size-4" />
              {testFlagPending
                ? 'Saving…'
                : isTest ? 'Unmark as test family' : 'Mark as test family'}
            </Button>
            <span className="text-xs text-muted-foreground">
              Currently: <strong className={isTest ? 'text-destructive' : ''}>{isTest ? 'TEST' : 'real family'}</strong>
            </span>
          </div>

          {isTest && (
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-medium text-muted-foreground">
                Type the family display id (<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{displayId}</code>) to confirm:
              </label>
              <input
                type="text"
                value={forceConfirmInput}
                onChange={(e) => setForceConfirmInput(e.target.value)}
                placeholder={displayId}
                className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
                disabled={forcePending}
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleForce}
                disabled={!forceUnlocked || forcePending}
                title={forceUnlocked ? 'Cascade-delete this test family and all dependent data' : `Type "${displayId}" to enable`}
              >
                <Skull className="mr-1.5 size-4" />
                {forcePending ? 'Wiping…' : 'Force-delete test family'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
