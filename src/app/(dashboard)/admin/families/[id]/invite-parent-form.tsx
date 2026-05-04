'use client'

import { useSearchParams } from 'next/navigation'
import { CheckCircle, Mail } from 'lucide-react'
import { createInvitation, resendInvitationEmail } from '../../../admin/actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface PendingInvite {
  id: string
  email: string
  expires_at: string | null
  created_at: string | null
  token: string
}

export function InviteParentForm({
  familyId,
  siteUrl,
  pendingInvites,
}: {
  familyId: string
  siteUrl: string
  pendingInvites?: PendingInvite[]
}) {
  const searchParams = useSearchParams()
  const invitedToken = searchParams.get('invited')
  const resent = searchParams.get('resent') === '1'
  const inviteLink = invitedToken ? `${siteUrl}/signup?invite=${invitedToken}` : null

  const createWithFamily = createInvitation.bind(null, familyId)

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold text-foreground">Invite Parent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll email a branded signup link. The link is also shown below so you can SMS it as a backup.
        </p>

        {resent && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-success/20 bg-success-light p-3 text-sm text-success">
            <CheckCircle className="size-4 shrink-0" />
            <span>Invitation email sent.</span>
          </div>
        )}

        {inviteLink && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-success/20 bg-success-light p-4 text-success">
            <CheckCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Invite created — email sent. Backup link:</p>
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

        {pendingInvites && pendingInvites.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pending invitations
            </p>
            <ul className="mt-2 space-y-2">
              {pendingInvites.map((inv) => {
                const expires = inv.expires_at ? new Date(inv.expires_at) : null
                const isExpired = expires ? expires.getTime() < Date.now() : false
                const link = `${siteUrl}/signup?invite=${inv.token}`
                return (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {isExpired
                          ? `Expired ${expires?.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
                          : expires
                          ? `Expires ${expires.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
                          : 'No expiry set'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => navigator.clipboard.writeText(link)}
                      >
                        Copy link
                      </Button>
                      <form action={resendInvitationEmail.bind(null, inv.id)}>
                        <Button
                          type="submit"
                          variant="secondary"
                          size="sm"
                          className="shrink-0"
                          disabled={isExpired}
                        >
                          <Mail className="mr-1.5 size-3.5" />
                          Resend
                        </Button>
                      </form>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
