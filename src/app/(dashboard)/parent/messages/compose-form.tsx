'use client'

import { useState } from 'react'
import { sendMessage } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Send, ChevronDown, ChevronUp } from 'lucide-react'

const selectClass = 'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

const CATEGORIES = [
  { value: 'general', label: 'General enquiry' },
  { value: 'question_program', label: 'Question about a program' },
  { value: 'scheduling', label: 'Scheduling request' },
  { value: 'payment', label: 'Payment query' },
]

export function ComposeForm({
  coaches,
  players,
  programs,
  defaultOpen = false,
}: {
  coaches: { id: string; name: string; userId: string | null }[]
  players: { id: string; firstName: string }[]
  programs: { id: string; name: string }[]
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [recipientRole, setRecipientRole] = useState('admin')
  const [category, setCategory] = useState('general')

  return (
    <Card className="overflow-hidden border-border bg-card shadow-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Send className="size-4 text-primary" />
          New Message
        </span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <CardContent className="border-t border-border pt-4">
          <form action={sendMessage} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="recipient_role">Send to</Label>
                <select
                  id="recipient_select"
                  className={selectClass}
                  value={recipientRole}
                  onChange={(e) => setRecipientRole(e.target.value)}
                >
                  <option value="admin">Admin (Sunrise Tennis)</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={`coach_${c.userId}`}>
                      Coach {c.name}
                    </option>
                  ))}
                </select>
                {/* Hidden fields for actual form values */}
                <input type="hidden" name="recipient_role" value={recipientRole.startsWith('coach_') ? 'coach' : 'admin'} />
                {recipientRole.startsWith('coach_') && (
                  <input type="hidden" name="recipient_id" value={recipientRole.replace('coach_', '')} />
                )}
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  name="category"
                  required
                  className={selectClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {category === 'question_program' && programs.length > 0 && (
                <div>
                  <Label htmlFor="program_id">Program (optional)</Label>
                  <select id="program_id" name="program_id" className={selectClass}>
                    <option value="">Select a program...</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {players.length > 0 && (
                <div>
                  <Label htmlFor="player_id">About player (optional)</Label>
                  <select id="player_id" name="player_id" className={selectClass}>
                    <option value="">Select a player...</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>{p.firstName}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="sm:col-span-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" name="subject" required maxLength={200} className="mt-1" placeholder="Brief summary of your message" />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="body">Message</Label>
                <textarea
                  id="body"
                  name="body"
                  required
                  rows={4}
                  maxLength={5000}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                  placeholder="Type your message..."
                />
              </div>
            </div>

            <Button type="submit" className="gap-2">
              <Send className="size-4" />
              Send Message
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  )
}
