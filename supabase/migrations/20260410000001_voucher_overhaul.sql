-- Sports Voucher Overhaul
-- Transforms the basic voucher system into a full SA Sports Vouchers Plus workflow:
-- - Replaces voucher_code/voucher_type with actual form fields (19 CSV columns)
-- - Adds voucher_batches table for CSV batch management
-- - Adds multi-stage status tracking (submitted → in_batch → submitted_to_portal → approved/rejected)
-- - Adds file upload support (image/PDF of physical voucher forms)
-- - Adds $200 (2x$100) linked voucher support
-- - Creates Supabase Storage bucket for voucher files

-- ============================================================
-- 1. Create voucher_batches table (before altering vouchers, since vouchers will FK to it)
-- ============================================================

CREATE TABLE voucher_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number serial,
  status text NOT NULL DEFAULT 'draft',
    -- draft: being assembled
    -- submitted: CSV uploaded to SA portal
    -- processed: money received for all vouchers in batch
  submitted_at timestamptz,
  submitted_by uuid REFERENCES auth.users(id),
  processed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_voucher_batches_status ON voucher_batches(status);

ALTER TABLE voucher_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_voucher_batches_all" ON voucher_batches
  FOR ALL USING (is_admin(auth.uid()));

-- ============================================================
-- 2. Alter vouchers table — drop obsolete columns, add new ones
-- ============================================================

-- Drop obsolete columns (voucher_code and voucher_type are not on the real SA form)
ALTER TABLE vouchers DROP COLUMN voucher_code;
ALTER TABLE vouchers DROP COLUMN voucher_type;

-- Which child this voucher is for
ALTER TABLE vouchers ADD COLUMN player_id uuid REFERENCES players(id);

-- Submission method and file storage
ALTER TABLE vouchers ADD COLUMN submission_method text NOT NULL DEFAULT 'form';
  -- 'form' = parent filled out digital form
  -- 'image' = parent uploaded photo/PDF of physical form
ALTER TABLE vouchers ADD COLUMN file_path text;
  -- Supabase Storage path for uploaded voucher image/PDF

-- Batch tracking
ALTER TABLE vouchers ADD COLUMN batch_id uuid REFERENCES voucher_batches(id);

-- Extended lifecycle timestamps
ALTER TABLE vouchers ADD COLUMN portal_submitted_at timestamptz;
ALTER TABLE vouchers ADD COLUMN portal_submitted_by uuid REFERENCES auth.users(id);
ALTER TABLE vouchers ADD COLUMN completed_at timestamptz;

-- Rejection reason (shown to parent, separate from admin notes)
ALTER TABLE vouchers ADD COLUMN rejection_reason text;

-- $200 (2x$100) support — each $100 is a separate voucher record
ALTER TABLE vouchers ADD COLUMN voucher_number smallint NOT NULL DEFAULT 1;
  -- 1 = first/only voucher, 2 = second voucher (for $200 submissions)
ALTER TABLE vouchers ADD COLUMN linked_voucher_id uuid REFERENCES vouchers(id);

-- ============================================================
-- 3. Add form data columns (match SA Sports Vouchers Plus CSV exactly)
-- ============================================================

-- Child's information
ALTER TABLE vouchers ADD COLUMN child_first_name text;
ALTER TABLE vouchers ADD COLUMN child_surname text;
ALTER TABLE vouchers ADD COLUMN child_gender text;
  -- 'Male', 'Female', 'Gender Diverse'
ALTER TABLE vouchers ADD COLUMN child_dob text;
  -- DD/MM/YYYY format (matches CSV)

-- Address (from parent/guardian section of form)
ALTER TABLE vouchers ADD COLUMN street_address text;
ALTER TABLE vouchers ADD COLUMN suburb text;
ALTER TABLE vouchers ADD COLUMN postcode text;

-- Medicare information
ALTER TABLE vouchers ADD COLUMN visa_number text;
  -- Australian visa number (alternative to Medicare)
ALTER TABLE vouchers ADD COLUMN medicare_number text;
  -- 11 digits: 10-digit Medicare card + 1-digit reference, concatenated
  -- e.g. card "2440 2156 3" + ref "5" → stored as "24402156 35" → "2440215635"

-- Parent/Guardian information
ALTER TABLE vouchers ADD COLUMN parent_first_name text;
ALTER TABLE vouchers ADD COLUMN parent_surname text;
ALTER TABLE vouchers ADD COLUMN parent_contact_number text;
ALTER TABLE vouchers ADD COLUMN parent_email text;

-- Demographic / eligibility questions
ALTER TABLE vouchers ADD COLUMN first_time boolean;
  -- "Is this the first time your child has joined this activity provider?"
ALTER TABLE vouchers ADD COLUMN has_disability boolean;
  -- "Has your child been identified as living with a disability?"
ALTER TABLE vouchers ADD COLUMN is_indigenous boolean;
  -- "Is your child from an Aboriginal or Torres Strait Islander background?"
ALTER TABLE vouchers ADD COLUMN english_main_language boolean;
  -- "Is English the main language spoken at home?"
ALTER TABLE vouchers ADD COLUMN other_language text;
  -- "If no, what language do you speak at home?"
ALTER TABLE vouchers ADD COLUMN activity_cost text;
  -- "What is the cost to participate in this activity?" — dollar amount as string (e.g. "260")

-- ============================================================
-- 4. Update default status from 'pending' to 'submitted'
-- ============================================================

ALTER TABLE vouchers ALTER COLUMN status SET DEFAULT 'submitted';

-- Migrate any existing 'pending' vouchers to 'submitted'
UPDATE vouchers SET status = 'submitted' WHERE status = 'pending';

-- ============================================================
-- 5. Add indexes for new columns
-- ============================================================

CREATE INDEX idx_vouchers_batch ON vouchers(batch_id);
CREATE INDEX idx_vouchers_player ON vouchers(player_id);
CREATE INDEX idx_vouchers_linked ON vouchers(linked_voucher_id);

-- ============================================================
-- 6. Supabase Storage bucket for voucher files
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voucher-files',
  'voucher-files',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
);

-- Storage policies: parents upload to their family folder, admins read all
CREATE POLICY "parent_voucher_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'voucher-files'
    AND (storage.foldername(name))[1] = get_user_family_id(auth.uid())::text
  );

CREATE POLICY "parent_voucher_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voucher-files'
    AND (storage.foldername(name))[1] = get_user_family_id(auth.uid())::text
  );

CREATE POLICY "admin_voucher_files_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'voucher-files'
    AND is_admin(auth.uid())
  );
