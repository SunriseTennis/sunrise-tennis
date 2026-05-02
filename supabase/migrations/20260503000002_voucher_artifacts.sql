-- Voucher artifacts: persist the generated batch CSV and the per-voucher
-- form-mode submission PDF to Supabase Storage so admins can re-download
-- both indefinitely (not just at the moment of generation).

ALTER TABLE voucher_batches ADD COLUMN IF NOT EXISTS csv_file_path text;

ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS form_pdf_path text;

-- Allow admin RW on the new batches/ subfolder of voucher-files.
-- Per-family voucher folders (and the existing "admin_voucher_files_all" policy)
-- already cover everything else.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'admin_voucher_batches_files'
  ) THEN
    CREATE POLICY "admin_voucher_batches_files" ON storage.objects
      FOR ALL TO authenticated
      USING (
        bucket_id = 'voucher-files'
        AND (storage.foldername(name))[1] = 'batches'
        AND is_admin(auth.uid())
      );
  END IF;
END $$;
