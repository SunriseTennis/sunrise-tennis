-- Migration: Update coach pay rates and attendance statuses
-- Coach rates: Zoe $40/hr all, George $20/$27, Capri $20/$30, Kylan $17.50/$22.50
-- Attendance: remove 'late', rename 'excused' → 'absent', 'absent' → 'noshow'

-- ── Coach pay rates ──────────────────────────────────────────────────────

UPDATE coaches SET hourly_rate = jsonb_build_object(
  'group_rate_cents', 4000,
  'private_rate_cents', 4000,
  'competition_rate_cents', 4000
) WHERE name ILIKE '%Zoe%';

UPDATE coaches SET hourly_rate = jsonb_build_object(
  'group_rate_cents', 2000,
  'private_rate_cents', 2700,
  'competition_rate_cents', 2000
) WHERE name ILIKE '%George%';

UPDATE coaches SET hourly_rate = jsonb_build_object(
  'group_rate_cents', 2000,
  'private_rate_cents', 3000,
  'competition_rate_cents', 2000
) WHERE name ILIKE '%Capri%';

UPDATE coaches SET hourly_rate = jsonb_build_object(
  'group_rate_cents', 1750,
  'private_rate_cents', 2250,
  'competition_rate_cents', 1750
) WHERE name ILIKE '%Kylan%';

-- Maxim is owner — excluded from pay calculations
UPDATE coaches SET is_owner = true WHERE name ILIKE '%Maxim%';

-- ── Attendance status migration ──────────────────────────────────────────
-- Old: present, absent, late, excused
-- New: present, absent (was excused), noshow (was absent)

UPDATE attendances SET status = CASE
  WHEN status = 'late' THEN 'present'
  WHEN status = 'excused' THEN 'absent'
  WHEN status = 'absent' THEN 'noshow'
  ELSE status
END
WHERE status IN ('late', 'excused', 'absent');
