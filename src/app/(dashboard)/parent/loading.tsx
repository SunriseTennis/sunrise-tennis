import { Skeleton } from '@/components/ui/skeleton'

export default function ParentLoading() {
  return (
    <div>
      {/* Header + balance */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
          <Skeleton className="mx-auto h-3 w-24" />
          <Skeleton className="mx-auto mt-2 h-8 w-16" />
        </div>
      </div>

      {/* Players */}
      <div className="mt-8">
        <Skeleton className="h-6 w-28" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-2 h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Sessions */}
      <div className="mt-8">
        <Skeleton className="h-6 w-40" />
        <div className="mt-3 rounded-lg border border-border bg-card p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-8 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
