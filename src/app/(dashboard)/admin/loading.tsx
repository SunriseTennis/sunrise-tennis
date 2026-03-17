import { Skeleton } from '@/components/ui/skeleton'

export default function AdminLoading() {
  return (
    <div>
      {/* Page header */}
      <Skeleton className="h-8 w-32" />
      <Skeleton className="mt-2 h-4 w-56" />

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-9 w-16" />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="mt-8">
        <Skeleton className="h-6 w-40" />
        <div className="mt-3 rounded-lg border border-border bg-card p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
