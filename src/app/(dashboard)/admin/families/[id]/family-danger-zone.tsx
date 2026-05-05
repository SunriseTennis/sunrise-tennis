'use client'

/**
 * Plan 21 — danger zone on /admin/families/[id]. Two actions:
 *  - Archive / activate (status flip — soft, reversible, for families
 *    with operational history).
 *  - Delete (hard delete via `admin_delete_family` RPC — only succeeds
 *    when the family has zero players + zero operational rows).
 *
 * The Delete button is disabled (with a tooltip) when the page already
 * knows the family has blockers, so admin doesn't waste a click.
 */

import { useState, useTransition } from 'react'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { deleteFamily, setFamilyStatus } from '../../actions'
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
}

export function FamilyDangerZone({ familyId, status, hasBlockers, blockerLabel }: Props) {
  const [archivePending, startArchive] = useTransition()
  const [deletePending, startDelete] = useTransition()
  const [confirming, setConfirming] = useState(false)

  const isArchived = status === 'archived'

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
      </CardContent>
    </Card>
  )
}
