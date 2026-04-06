'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, ChevronDown, ChevronUp, Reply, Clock, CheckCircle } from 'lucide-react'
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

interface Message {
  id: string
  category: string
  subject: string
  body: string
  recipient_role: string
  admin_reply: string | null
  replied_at: string | null
  read_at: string | null
  created_at: string
}

export function MessageList({ messages }: { messages: Message[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Your Messages</h2>
      {messages.map((msg) => {
        const isExpanded = expanded === msg.id
        const hasReply = !!msg.admin_reply
        const isNewReply = hasReply && !msg.read_at

        return (
          <Card
            key={msg.id}
            className={cn(
              'overflow-hidden border-border bg-card shadow-card transition-all',
              isNewReply && 'border-primary/30 bg-primary/5'
            )}
          >
            <button
              type="button"
              onClick={() => setExpanded(isExpanded ? null : msg.id)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            >
              <div className={cn(
                'mt-0.5 rounded-full p-1.5',
                hasReply ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
              )}>
                {hasReply ? <CheckCircle className="size-3.5" /> : <Clock className="size-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{msg.subject}</span>
                  {isNewReply && (
                    <Badge variant="default" className="shrink-0 text-[10px] px-1.5 py-0">New reply</Badge>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {CATEGORY_LABELS[msg.category] || msg.category}
                  </Badge>
                  <span>To {msg.recipient_role === 'admin' ? 'Admin' : 'Coach'}</span>
                  <span>{timeAgo(msg.created_at)}</span>
                </div>
              </div>
              {isExpanded ? <ChevronUp className="size-4 shrink-0 text-muted-foreground mt-1" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground mt-1" />}
            </button>

            {isExpanded && (
              <CardContent className="border-t border-border pt-3 pb-4 space-y-3">
                {/* Original message */}
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1">You wrote:</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{msg.body}</p>
                </div>

                {/* Reply */}
                {hasReply ? (
                  <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Reply className="size-3 text-primary" />
                      <p className="text-xs font-medium text-primary">
                        Reply {msg.replied_at ? `- ${timeAgo(msg.replied_at)}` : ''}
                      </p>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{msg.admin_reply}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    <span>Awaiting reply - we typically respond within 24 hours</span>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
