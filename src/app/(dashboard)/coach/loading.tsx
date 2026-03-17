import { Skeleton } from '@/components/ui/skeleton'

export default function CoachLoading() {
  return (
    <div>
      {/* Header */}
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-40" />

      {/* Today's sessions */}
      <div className="mt-8">
        <Skeleton className="h-6 w-36" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-4 w-56" />
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      <div className="mt-8">
        <Skeleton className="h-6 w-40" />
        <div className="mt-3 rounded-lg border border-border bg-card p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-8 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
