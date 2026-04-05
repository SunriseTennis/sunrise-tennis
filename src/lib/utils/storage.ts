import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

const VOUCHER_BUCKET = 'voucher-files'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

/**
 * Upload a voucher file (image or PDF) to Supabase Storage.
 * Path: voucher-files/{familyId}/{voucherId}.{ext}
 */
export async function uploadVoucherFile(
  supabase: SupabaseClient<Database>,
  file: File,
  familyId: string,
  voucherId: string,
): Promise<{ path: string } | { error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: 'Invalid file type. Only JPG, PNG, and PDF are accepted.' }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: 'File too large. Maximum size is 10MB.' }
  }

  const ext = file.type === 'application/pdf' ? 'pdf'
    : file.type === 'image/png' ? 'png'
    : 'jpg'
  const path = `${familyId}/${voucherId}.${ext}`

  const { error } = await supabase.storage
    .from(VOUCHER_BUCKET)
    .upload(path, file, { upsert: true })

  if (error) {
    console.error('Voucher file upload failed:', error.message)
    return { error: 'File upload failed. Please try again.' }
  }

  return { path }
}

/**
 * Get a signed URL for viewing a voucher file (admin use).
 * Expires in 1 hour.
 */
export async function getVoucherFileUrl(
  supabase: SupabaseClient<Database>,
  filePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(VOUCHER_BUCKET)
    .createSignedUrl(filePath, 3600)

  if (error) {
    console.error('Signed URL creation failed:', error.message)
    return null
  }
  return data.signedUrl
}
