-- Plan 11 follow-up — Fix charge → booking pointer for shared privates.
--
-- Pre Plan-10 paired-booking migration, shared (semi) private bookings were a
-- single row per session shared by two families. Each family's `charges` row
-- pointed at that one booking. Plan 10 introduced one booking row per family
-- linked via `bookings.shared_with_booking_id`. The migration backfilled the
-- second booking but DID NOT rewrite the partner family's `charges.booking_id`
-- to point at the same-family booking — they still point at the original
-- (now-other-family) booking row. Result: when the parent payments page
-- navigates from a charge to /parent/bookings/[bookingId], the family_id
-- ownership check fails and the page 404s.
--
-- Fix: where a charge's family_id doesn't match its referenced booking's
-- family_id BUT the booking has a shared sibling whose family_id DOES match
-- the charge's family_id, swap the pointer to the sibling.

UPDATE charges c
SET booking_id = b2.id
FROM bookings b1
JOIN bookings b2 ON b2.id = b1.shared_with_booking_id
WHERE c.booking_id = b1.id
  AND c.family_id <> b1.family_id
  AND c.family_id = b2.family_id;
