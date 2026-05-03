import { redirect } from 'next/navigation'

export default async function OldAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ coach_id?: string; error?: string; success?: string }>
}) {
  // Preserve query params when bouncing to the canonical URL. Dropping
  // `error` here was hiding RPC failures from the save flow.
  const { coach_id, error, success } = await searchParams
  const qs = new URLSearchParams()
  if (coach_id) qs.set('coach_id', coach_id)
  if (error) qs.set('error', error)
  if (success) qs.set('success', success)
  const search = qs.toString()
  redirect(`/admin/coaches/availability${search ? `?${search}` : ''}`)
}
