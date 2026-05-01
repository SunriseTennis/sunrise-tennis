-- Migration: Hard-delete pre-Term-2-week-2 sessions and regenerate from 2026-05-04
-- Term 2 effectively starts at week 2 (2026-05-04). Week 1 (27-Apr to 03-May)
-- did not run. Purge any sessions/attendances/lesson_notes/charges in that window
-- so they don't appear anywhere, then regenerate fresh sessions for the rest of Term 2.

DO $$
DECLARE
  cutoff date := '2026-05-04';
  term_end date := '2026-07-03';
  victim_session_ids uuid[];
  session_count integer;
BEGIN
  -- Collect every session that needs to disappear.
  -- Includes: pre-cutoff sessions for ANY active program (week 1 wash),
  -- AND every session of programs whose times changed (Thursday squads,
  -- Wed girls programs, Wed yellow) — since the start/end times no longer match.
  SELECT ARRAY_AGG(s.id) INTO victim_session_ids
  FROM sessions s
  JOIN programs p ON p.id = s.program_id
  WHERE s.date >= '2026-04-27'   -- start of Term 2 week 1
    AND s.date <= term_end
    AND (
      s.date < cutoff
      OR p.slug IN (
        'thu-red-squad','thu-orange-squad','thu-green-squad','thu-yellow-squad','thu-elite-squad',
        'wed-girls-red','wed-girls-orange','wed-girls-orange-green','wed-girls-yellow','wed-yellow-ball'
      )
    );

  IF victim_session_ids IS NULL OR array_length(victim_session_ids, 1) IS NULL THEN
    RAISE NOTICE 'No sessions to clean up.';
    RETURN;
  END IF;

  session_count := array_length(victim_session_ids, 1);
  RAISE NOTICE 'Cleaning up % sessions (and their dependents)', session_count;

  -- Cascade-delete dependents that don't have ON DELETE CASCADE.
  DELETE FROM attendances    WHERE session_id = ANY(victim_session_ids);
  DELETE FROM lesson_notes   WHERE session_id = ANY(victim_session_ids);

  -- Charges referencing these sessions: hard-delete the throwaway pending/voided
  -- rows; void confirmed rows AND clear their session_id so the FK doesn't block
  -- the session delete. The voided audit trail is preserved.
  DELETE FROM charges
  WHERE session_id = ANY(victim_session_ids)
    AND status IN ('pending', 'voided');

  UPDATE charges
  SET status = 'voided',
      session_id = NULL
  WHERE session_id = ANY(victim_session_ids)
    AND status NOT IN ('pending', 'voided');

  -- Bookings referencing these sessions: clear the session_id pointer
  -- (booking records survive — they're per-program, not per-session).
  UPDATE bookings SET session_id = NULL WHERE session_id = ANY(victim_session_ids);

  -- Finally, kill the sessions.
  DELETE FROM sessions WHERE id = ANY(victim_session_ids);

  RAISE NOTICE 'Deleted % sessions', session_count;
END $$;

-- ── Regenerate sessions for Term 2 from 2026-05-04 onwards ─────────────────────
-- Iterates through 2026-05-04 → 2026-07-03 and inserts a session for every
-- active program whose day_of_week matches and whose date is not a public holiday.
-- Uses ON CONFLICT-style guard via NOT EXISTS to stay idempotent.
DO $$
DECLARE
  cur_date date := '2026-05-04';
  term_end date := '2026-07-03';
  prog record;
  jsday smallint;
  inserted_count integer := 0;
  -- SA public holidays in the window
  holidays date[] := ARRAY[
    '2026-06-08'::date  -- King's Birthday (none in this window in SA but kept for safety)
  ];
BEGIN
  WHILE cur_date <= term_end LOOP
    jsday := EXTRACT(DOW FROM cur_date)::smallint;

    IF NOT (cur_date = ANY(holidays)) THEN
      FOR prog IN
        SELECT id, type, day_of_week, start_time, end_time, venue_id
        FROM programs
        WHERE status = 'active'
          AND day_of_week = jsday
          AND start_time IS NOT NULL
          AND end_time   IS NOT NULL
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM sessions
          WHERE program_id = prog.id AND date = cur_date
        ) THEN
          INSERT INTO sessions (
            program_id, date, start_time, end_time,
            session_type, venue_id, status
          ) VALUES (
            prog.id, cur_date, prog.start_time, prog.end_time,
            CASE prog.type
              WHEN 'competition' THEN 'competition'
              WHEN 'squad'       THEN 'squad'
              WHEN 'school'      THEN 'school'
              ELSE 'group'
            END,
            prog.venue_id, 'scheduled'
          );
          inserted_count := inserted_count + 1;
        END IF;
      END LOOP;
    END IF;

    cur_date := cur_date + INTERVAL '1 day';
  END LOOP;

  RAISE NOTICE 'Inserted % new sessions for Term 2 (from 2026-05-04)', inserted_count;
END $$;
