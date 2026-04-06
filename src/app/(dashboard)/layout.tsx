import { DashboardHeader } from '@/components/dashboard-header'
import { PushPrompt } from '@/components/push-prompt'
import { PullToRefresh } from '@/components/pull-to-refresh'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen gradient-dawn">
      <DashboardHeader />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <PushPrompt />
        <PullToRefresh>
          {children}
        </PullToRefresh>
      </main>
    </div>
  )
}
