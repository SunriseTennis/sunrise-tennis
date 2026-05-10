'use client'

import { createLessonNote } from '../../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'

type Player = { id: string; first_name: string; last_name: string; classifications: string[] | null }

export function LessonNoteForm({
  sessionId,
  roster,
}: {
  sessionId: string
  roster: Player[]
}) {
  const action = createLessonNote.bind(null, sessionId)

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold text-foreground">Add Lesson Note</h2>
        <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="player_id">Player *</Label>
            <select
              id="player_id"
              name="player_id"
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select player...</option>
              {roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="focus">Focus Area</Label>
            <Input
              id="focus"
              name="focus"
              type="text"
              placeholder="e.g. Forehand topspin, serve consistency"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="progress">Progress</Label>
            <Input
              id="progress"
              name="progress"
              type="text"
              placeholder="e.g. Good improvement on follow-through"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="drills_used">Drills Used (comma separated)</Label>
            <Input
              id="drills_used"
              name="drills_used"
              type="text"
              placeholder="e.g. Rally 10, Target serve, Cross-court"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="video_url">Video Link</Label>
            <Input
              id="video_url"
              name="video_url"
              type="url"
              placeholder="https://youtube.com/..."
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="next_plan">Next Session Plan</Label>
            <Input
              id="next_plan"
              name="next_plan"
              type="text"
              placeholder="e.g. Work on backhand slice"
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit">Save Lesson Note</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
