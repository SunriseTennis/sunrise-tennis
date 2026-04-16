'use client'

import { useState } from 'react'
import { ChevronRight, User, Bell, CalendarDays, Camera, Mail, Lock, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  User, Bell, CalendarDays, Camera, Mail, Lock, LogOut,
}

export interface AccordionSection {
  id: string
  iconName: string
  label: string
  description?: string
  content: React.ReactNode
  destructive?: boolean
}

export function SettingsAccordion({ sections }: { sections: AccordionSection[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card divide-y divide-border/40">
      {sections.map(section => {
        const isOpen = openId === section.id
        const Icon = ICON_MAP[section.iconName] ?? User
        return (
          <div key={section.id}>
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : section.id)}
              className={cn(
                'flex w-full items-center gap-3 px-5 py-4 text-left transition-colors',
                isOpen ? 'bg-muted/10' : 'hover:bg-muted/5',
              )}
            >
              <div className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                section.destructive ? 'bg-danger/10' : 'bg-primary/10',
              )}>
                <Icon className={cn('size-4', section.destructive ? 'text-danger' : 'text-primary')} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-semibold', section.destructive ? 'text-danger' : 'text-foreground')}>
                  {section.label}
                </p>
                {section.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                )}
              </div>
              <ChevronRight className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                isOpen && 'rotate-90',
              )} />
            </button>
            {isOpen && (
              <div className="animate-fade-up border-t border-border/30 px-5 pb-5 pt-3">
                {section.content}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
