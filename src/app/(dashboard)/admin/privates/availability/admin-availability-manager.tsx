'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { Clock } from 'lucide-react'
import { BulkWeeklyEditor } from '@/components/coach-availability/bulk-weekly-editor'
import { RangeExceptionForm } from '@/components/coach-availability/range-exception-form'
import { GroupedExceptionList } from '@/components/coach-availability/grouped-exception-list'
import {
  adminSetCoachAvailabilityBulk,
  adminRemoveAvailabilityFromForm,
  adminAddExceptionRange,
  adminRemoveExceptionGroup,
} from '../actions'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Coach {
  id: string
  name: string
  is_owner: boolean | null
}

interface Window {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
}

interface Exception {
  id: string
  exception_date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
}

interface Props {
  coaches: Coach[]
  selectedCoachId: string | null
  windows: Window[] | null
  exceptions: Exception[] | null
}

export function AdminAvailabilityManager({ coaches, selectedCoachId, windows, exceptions }: Props) {
  const router = useRouter()
  const selectedCoach = coaches.find(c => c.id === selectedCoachId)

  const windowsByDay = DAY_NAMES.map((name, i) => ({
    day: i,
    name,
    windows: (windows ?? []).filter(w => w.day_of_week === i),
  }))

  return (
    <div className="space-y-6">
      {/* Coach selector */}
      <div className="flex flex-wrap gap-2">
        {coaches.map((coach) => (
          <Button
            key={coach.id}
            variant={selectedCoachId === coach.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => router.push(`/admin/privates/availability?coach_id=${coach.id}`)}
          >
            {coach.name.split(' ')[0]}
          </Button>
        ))}
      </div>

      {!selectedCoach && (
        <EmptyState
          icon={Clock}
          title="Select a coach"
          description="Choose a coach above to manage their availability"
        />
      )}

      {selectedCoach && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BulkWeeklyEditor
              windowsByDay={windowsByDay}
              coachId={selectedCoach.id}
              onApply={adminSetCoachAvailabilityBulk}
              onRemoveWindow={adminRemoveAvailabilityFromForm}
            />
          </div>
          <div className="space-y-3">
            <RangeExceptionForm
              coachId={selectedCoach.id}
              onAdd={adminAddExceptionRange}
            />
            <GroupedExceptionList
              exceptions={exceptions ?? []}
              onRemove={adminRemoveExceptionGroup}
            />
          </div>
        </div>
      )}
    </div>
  )
}
