'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { updateNotificationRule, testRule } from '../../actions'

interface Props {
  rule: {
    id: string
    audience: 'admins' | 'family' | 'coach' | 'eligible_families'
    enabled: boolean
    channels: string[]
    title_template: string
    body_template: string
    url_template: string
  }
}

const ALL_CHANNELS = ['push', 'in_app', 'email']
const AUDIENCES: { value: Props['rule']['audience']; label: string; hint: string }[] = [
  { value: 'admins', label: 'Admins', hint: 'All admin users.' },
  { value: 'family', label: 'Family', hint: 'All parents in the affected family (requires familyId in the event context).' },
  { value: 'coach', label: 'Coach', hint: 'The assigned coach (requires coachId in the event context).' },
  { value: 'eligible_families', label: 'Eligible families', hint: 'All parents allowed to book the relevant coach (used for freed standing slots).' },
]

export function RuleEditForm({ rule }: Props) {
  const [enabled, setEnabled] = useState(rule.enabled)
  const [channels, setChannels] = useState<Set<string>>(new Set(rule.channels))
  const [audience, setAudience] = useState(rule.audience)
  const [title, setTitle] = useState(rule.title_template)
  const [body, setBody] = useState(rule.body_template)
  const [url, setUrl] = useState(rule.url_template)
  const [pending, startTransition] = useTransition()
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const update = updateNotificationRule.bind(null, rule.id)

  function toggleChannel(c: string) {
    setChannels((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  function handleTest() {
    setTestMessage(null)
    startTransition(async () => {
      const result = await testRule(rule.id)
      if (result.error) setTestMessage({ type: 'error', message: result.error })
      else if (result.success) setTestMessage({ type: 'success', message: result.success })
    })
  }

  return (
    <form action={update} className="space-y-4">
      <input type="hidden" name="channels" value={[...channels].join(',')} />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              id="enabled"
              name="enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-4 rounded border-border"
            />
            <Label htmlFor="enabled">Enabled</Label>
          </div>

          <div>
            <Label>Audience</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {AUDIENCES.find((a) => a.value === audience)?.hint}
            </p>
            <select
              name="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as Props['rule']['audience'])}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Channels</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Email is reserved — no provider wired yet (see SYSTEM-MAP).</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_CHANNELS.map((c) => {
                const selected = channels.has(c)
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleChannel(c)}
                    disabled={c === 'email'}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                    } ${c === 'email' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {c.replace('_', '-')}
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <Label htmlFor="title_template">Title</Label>
            <Input
              id="title_template"
              name="title_template"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="body_template">Body</Label>
            <Textarea
              id="body_template"
              name="body_template"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="url_template">Click-through URL</Label>
            <Input
              id="url_template"
              name="url_template"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1"
              placeholder="/parent or /admin/..."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank to suppress the click-through. Templates supported.
            </p>
          </div>
        </CardContent>
      </Card>

      {testMessage && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            testMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {testMessage.message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
        </Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={pending}>
          Test send to me
        </Button>
      </div>
    </form>
  )
}
