'use server'

import { createClient, requireAdmin } from '@/lib/supabase/server'
import { extractVoucherFromImage } from '@/lib/ai/extract-voucher'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function extractVoucherData(voucherId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: voucher } = await supabase
    .from('vouchers')
    .select('id, file_path, submission_method')
    .eq('id', voucherId)
    .single()

  if (!voucher?.file_path) {
    return { error: 'No file attached to this voucher' }
  }

  // Use service role to download from storage (admin RLS may not cover storage.objects)
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: fileData, error: downloadError } = await serviceClient.storage
    .from('voucher-files')
    .download(voucher.file_path)

  if (downloadError || !fileData) {
    console.error('File download failed:', downloadError?.message)
    return { error: 'Failed to download voucher file' }
  }

  // Convert to base64
  const arrayBuffer = await fileData.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mimeType = voucher.file_path.endsWith('.pdf')
    ? 'application/pdf'
    : voucher.file_path.endsWith('.png')
    ? 'image/png'
    : 'image/jpeg'

  const result = await extractVoucherFromImage(base64, mimeType)
  return result
}
