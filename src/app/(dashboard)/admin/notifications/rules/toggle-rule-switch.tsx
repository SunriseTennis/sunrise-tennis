'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toggleNotificationRule } from './actions'

export function ToggleRuleSwitch({ ruleId, enabled }: { ruleId: string; enabled: boolean }) {
  const [optimistic, setOptimistic] = useState(enabled)
  const [pending, startTransition] = useTransition()

  function handle() {
    const next = !optimistic
    setOptimistic(next)
    startTransition(async () => {
      const result = await toggleNotificationRule(ruleId, next)
      if (result.error) {
        // revert
        setOptimistic(!next)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        optimistic ? 'bg-primary' : 'bg-muted',
        pending && 'opacity-60',
      )}
      aria-pressed={optimistic}
    >
      <span
        className={cn(
          'inline-block size-4 transform rounded-full bg-white shadow-sm transition-transform',
          optimistic ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
      {pending && (
        <Loader2 className="absolute -right-5 size-3 animate-spin text-muted-foreground" />
      )}
    </button>
  )
}
