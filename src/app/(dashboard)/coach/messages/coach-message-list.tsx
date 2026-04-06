'use client'

import { useState } from 'react'
import { replyToMessage, markMessageRead } from './actions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MessageSquare, ChevronDown, ChevronUp, Reply, Clock, CheckCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  question_program: 'Program',
  scheduling: 'Scheduling',
  payment: 'Payment',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

interface CoachMessage {
  id: string
  category: string
  subject: string
  body: string
  admin_reply: string | null
  replied_at: string | null
  read_at: string | null
  created_at: string
  families: { display_id: string; family_name: string } | null
  players: { first_name: string } | null
  programs: { name: string } | null
}

export function CoachMessageList({ messages }: { messages: CoachMessage[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  const handleExpand = async (msg: CoachMessage) => {
    const isExpanding = expanded !== msg.id
    setExpanded(isExpanding ? msg.id : null)
    if (isExpanding && !msg.read_at) {
      await markMessageRead(msg.id)
    }
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        const isExpanded = expanded === msg.id
        const hasReply = !!msg.admin_reply
        const isUnread = !msg.read_at

        return (
          <Card
            key={msg.id}
            className={cn(
              'overflow-hidden border-border bg-card shadow-card transition-all',
              isUnread && 'border-primary/30 bg-primary/5'
            )}
          >
            <button
              type="button"
              onClick={() => handleExpand(msg)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            >
              <div className={cn(
                'mt-0.5 rounded-full p-1.5',
                isUnread ? 'bg-primary/10 text-primary' : hasReply ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
              )}>
                {hasReply ? <CheckCircle className="size-3.5" /> : isUnread ? <MessageSquare className="size-3.5" /> : <Clock className="size-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn('truncate text-sm', isUnread ? 'font-semibold' : 'font-medium')}>
                    {msg.subject}
                  </span>
                  {isUnread && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {msg.families && (
                    <span className="flex items-center gap-0.5">
                      <User className="size-3" />
                      {msg.families.family_name}
                    </span>
                  )}
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {CATEGORY_LABELS[msg.category] || msg.category}
                  </Badge>
                  {msg.players && <span>Re: {msg.players.first_name}</span>}
                  <span>{timeAgo(msg.created_at)}</span>
                </div>
              </div>
              {isExpanded ? <ChevronUp className="size-4 shrink-0 text-muted-foreground mt-1" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground mt-1" />}
            </button>

            {isExpanded && (
              <CardContent className="border-t border-border pt-3 pb-4 space-y-3">
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {msg.families ? msg.families.family_name : 'Parent'} wrote:
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{msg.body}</p>
                </div>

                {hasReply ? (
                  <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Reply className="size-3 text-primary" />
                      <p className="text-xs font-medium text-primary">
                        Your reply {msg.replied_at ? `- ${timeAgo(msg.replied_at)}` : ''}
                      </p>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{msg.admin_reply}</p>
                  </div>
                ) : replyingTo === msg.id ? (
                  <form action={replyToMessage} className="space-y-2">
                    <input type="hidden" name="message_id" value={msg.id} />
                    <textarea
                      name="reply"
                      required
                      rows={3}
                      maxLength={5000}
                      className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                      placeholder="Type your reply..."
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" className="gap-1.5">
                        <Reply className="size-3.5" />
                        Send Reply
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button size="sm" variant="default" className="gap-1.5" onClick={() => setReplyingTo(msg.id)}>
                    <Reply className="size-3.5" />
                    Reply
                  </Button>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
