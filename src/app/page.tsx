import Link from 'next/link'
import { Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <div className="gradient-sunrise flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-card/95 p-8 text-center shadow-elevated backdrop-blur">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Sun className="size-7 text-primary" />
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Sunrise Tennis
        </h1>
        <p className="mt-2 text-muted-foreground">
          Coaching, bookings, and team management
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/signup">Create account</Link>
          </Button>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Somerton Park Tennis Club — Adelaide, SA
        </p>
      </div>
    </div>
  )
}
