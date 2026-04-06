'use client'

import { changePassword } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Lock } from 'lucide-react'

export function PasswordChangeForm() {
  return (
    <form action={changePassword}>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Lock className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Change Password</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Update your account password. Must be at least 8 characters.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="new_password" className="text-xs">New Password</Label>
              <Input
                id="new_password"
                name="new_password"
                type="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="mt-1"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="confirm_password" className="text-xs">Confirm Password</Label>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                required
                minLength={8}
                placeholder="Re-enter password"
                className="mt-1"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="mt-4">
            <Button type="submit" size="sm">
              Update Password
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
