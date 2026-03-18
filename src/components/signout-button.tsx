'use client'

import { signout } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function SignoutButton() {
  return (
    <form action={signout}>
      <Button type="submit" variant="ghost" size="sm" className="gap-1.5 text-white/70 hover:text-white hover:bg-white/10">
        <LogOut className="size-4" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </form>
  )
}
