import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { ParentAddPlayerForm } from './add-player-form'

export default async function ParentAddPlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('family_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .single()
  if (!userRole?.family_id) redirect('/login')

  return (
    <div className="space-y-4">
      <Link href="/parent" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Back to overview
      </Link>

      <div className="rounded-2xl bg-gradient-to-r from-[#2B5EA7] via-[#6480A4] to-[#E87450] p-5 text-white shadow-elevated">
        <h1 className="text-2xl font-bold leading-tight">Add a player</h1>
        <p className="mt-1 text-sm text-white/80">
          Tell us about your child. We&apos;ll confirm their ball level shortly.
        </p>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-3 text-sm text-red-700">{decodeURIComponent(error)}</CardContent>
        </Card>
      )}

      <ParentAddPlayerForm />
    </div>
  )
}
