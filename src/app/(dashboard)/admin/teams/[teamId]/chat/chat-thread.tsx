'use client'

import { useRef, useEffect } from 'react'

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
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: '60vh', minHeight: '300px' }}>
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500">No messages yet. Start the conversation!</p>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.isOwn ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    m.isOwn ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {!m.isOwn && (
                    <p className="mb-0.5 text-[10px] font-medium text-gray-500">{m.senderName}</p>
                  )}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
                <span className="mt-0.5 text-[10px] text-gray-400">
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
      <form action={sendAction} className="flex gap-2 border-t border-gray-200 p-3">
        <input
          name="body"
          type="text"
          required
          placeholder="Type a message..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          autoComplete="off"
        />
        <button
          type="submit"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Send
        </button>
      </form>
    </div>
  )
}
