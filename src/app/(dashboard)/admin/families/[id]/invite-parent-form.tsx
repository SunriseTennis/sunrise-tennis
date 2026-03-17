'use client'

import { useSearchParams } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { createInvitation } from '../../../admin/actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function InviteParentForm({ familyId, siteUrl }: { familyId: string; siteUrl: string }) {
  const searchParams = useSearchParams()
  const invitedToken = searchParams.get('invited')
  const inviteLink = invitedToken ? `${siteUrl}/signup?invite=${invitedToken}` : null

  const createWithFamily = createInvitation.bind(null, familyId)

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold text-foreground">Invite Parent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a signup link that automatically links this parent to this family account.
        </p>

        {inviteLink && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-success/20 bg-success-light p-4 text-success">
            <CheckCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Invite created! Share this link:</p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="bg-card text-foreground"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                >
                  Copy
                </Button>
              </div>
              <p className="mt-2 text-xs">Link expires in 7 days.</p>
            </div>
          </div>
        )}

        <form action={createWithFamily} className="mt-4 flex gap-3">
          <Input
            name="email"
            type="email"
            required
            placeholder="parent@email.com"
            className="w-full"
          />
          <Button type="submit" className="shrink-0">Create invite</Button>
        </form>
      </CardContent>
    </Card>
  )
}
