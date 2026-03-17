'use client'

import { useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send } from 'lucide-react'

interface Message {
  id: string
  body: string
  senderId: string
  senderName: string
  createdAt: string
  isOwn: boolean
}

interface Props {
  messages: Message[]
  sendAction: (formData: FormData) => Promise<void>
}

export function ChatThread({ messages, sendAction }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card shadow-card">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: '60vh', minHeight: '300px' }}>
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.isOwn ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    m.isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  }`}
                >
                  {!m.isOwn && (
                    <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">{m.senderName}</p>
                  )}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground/60">
                  {m.createdAt
                    ? new Date(m.createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
                    : ''}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Send form */}
      <form action={sendAction} className="flex gap-2 border-t border-border p-3">
        <Input
          name="body"
          type="text"
          required
          placeholder="Type a message..."
          autoComplete="off"
          className="flex-1"
        />
        <Button type="submit" size="icon">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}
