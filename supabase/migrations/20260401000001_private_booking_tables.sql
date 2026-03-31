-- Private Booking Feature: New Tables
-- Creates 6 tables for coach availability, player-coach restrictions,
-- coach earnings/payments, and cancellation tracking.

-- ── Coach Availability (repeating weekly windows) ──────────────────────

CREATE TABLE coach_availability (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  day_of_week     smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  created_at      timestamptz DEFAULT now(),

  CONSTRAINT coach_availability_time_order CHECK (end_time > start_time),
  CONSTRAINT coach_availability_effective_order CHECK (
    effective_until IS NULL OR effective_until >= effective_from
  ),
  UNIQUE (coach_id, day_of_week, start_time, effective_from)
);

COMMENT ON TABLE coach_availability IS
  'Repeating weekly availability windows per coach. E.g. "Wed 4pm-7pm every week".';

-- ── Coach Availability Exceptions (date-specific removals) ─────────────

CREATE TABLE coach_availability_exceptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  exception_date  date NOT NULL,
  start_time      time,
  end_time        time,
  reason          text,
  created_at      timestamptz DEFAULT now(),

  CONSTRAINT exception_time_order CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  ),
  UNIQUE (coach_id, exception_date, start_time)
);

COMMENT ON TABLE coach_availability_exceptions IS
  'Date-specific availability removals. NULL start/end = entire day blocked.';

-- ── Player Allowed Coaches (allowlist junction) ────────────────────────

CREATE TABLE player_allowed_coaches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  coach_id     uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  auto_approve boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now(),

  UNIQUE (player_id, coach_id)
);

COMMENT ON TABLE player_allowed_coaches IS
  'Allowlist: which coaches a player can book private lessons with. Empty = all coaches.';
COMMENT ON COLUMN player_allowed_coaches.auto_approve IS
  'If true, bookings with this coach are instantly confirmed (no approval step).';

-- ── Coach Earnings (per-session ledger) ────────────────────────────────

CREATE TABLE coach_earnings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id         uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  session_id       uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  session_type     text NOT NULL CHECK (session_type IN ('private', 'group')),
  amount_cents     integer NOT NULL CHECK (amount_cents >= 0),
  duration_minutes smallint NOT NULL CHECK (duration_minutes > 0),
  term             smallint,
  year             smallint,
  pay_period_key   text NOT NULL,
  status           text NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'paid')),
  created_at       timestamptz DEFAULT now(),

  UNIQUE (coach_id, session_id)
);

COMMENT ON TABLE coach_earnings IS
  'Ledger of earned amounts per completed session. Drives the coach pay dashboard.';
COMMENT ON COLUMN coach_earnings.pay_period_key IS
  'Grouping key: weekly = "2026-W14", end_of_term = "2026-T2".';

-- ── Coach Payments (actual payments made) ──────────────────────────────

CREATE TABLE coach_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  amount_cents    integer NOT NULL CHECK (amount_cents > 0),
  pay_period_key  text NOT NULL,
  notes           text,
  paid_by         uuid REFERENCES auth.users(id),
  paid_at         timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

COMMENT ON TABLE coach_payments IS
  'Records of actual payments made to coaches. Platform tracks, does not trigger payments.';

-- ── Cancellation Tracker (per-family-per-term) ─────────────────────────

CREATE TABLE cancellation_tracker (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id               uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  term                    smallint NOT NULL CHECK (term BETWEEN 1 AND 4),
  year                    smallint NOT NULL CHECK (year >= 2025),
  late_cancellation_count integer NOT NULL DEFAULT 0,
  noshow_count            integer NOT NULL DEFAULT 0,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),

  UNIQUE (family_id, term, year)
);

COMMENT ON TABLE cancellation_tracker IS
  'Tracks late cancellations and no-shows per family per school term for policy enforcement.';

-- ── Audit trigger for new tables ───────────────────────────────────────
-- The existing audit trigger function handles all tables generically.
-- Enable it on the new tables that need audit trails.

CREATE TRIGGER audit_coach_earnings
  AFTER INSERT OR UPDATE OR DELETE ON coach_earnings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_coach_payments
  AFTER INSERT OR UPDATE OR DELETE ON coach_payments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_cancellation_tracker
  AFTER INSERT OR UPDATE OR DELETE ON cancellation_tracker
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_player_allowed_coaches
  AFTER INSERT OR UPDATE OR DELETE ON player_allowed_coaches
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
