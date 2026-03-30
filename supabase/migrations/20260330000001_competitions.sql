-- Migration: Competitions management
-- Depends on: teams, players, coaches, RLS helper functions

-- ============================================================================
-- competitions table
-- ============================================================================

CREATE TABLE competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  type text NOT NULL DEFAULT 'external',
  season text NOT NULL,
  nomination_open date,
  nomination_close date,
  season_start date,
  season_end date,
  finals_start date,
  finals_end date,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- Extend teams table for competition support
-- ============================================================================

ALTER TABLE teams ADD COLUMN competition_id uuid REFERENCES competitions(id);
ALTER TABLE teams ADD COLUMN division text;
ALTER TABLE teams ADD COLUMN gender text;
ALTER TABLE teams ADD COLUMN age_group text;
ALTER TABLE teams ADD COLUMN team_size_required smallint;
ALTER TABLE teams ADD COLUMN nomination_status text NOT NULL DEFAULT 'draft';

CREATE INDEX idx_teams_competition_id ON teams(competition_id);

-- ============================================================================
-- competition_players - standalone player records for competitions
-- ============================================================================

CREATE TABLE competition_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id),
  first_name text NOT NULL,
  last_name text,
  age smallint,
  gender text,
  role text NOT NULL DEFAULT 'mainstay',
  registration_status text NOT NULL DEFAULT 'unregistered',
  utr_profile_id text,
  utr_rating_display text,
  utr_rating_status text,
  utr_fetched_at timestamptz,
  notes text,
  sort_order smallint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_comp_players_team_name ON competition_players(team_id, first_name, COALESCE(last_name, ''));
CREATE INDEX idx_comp_players_team_id ON competition_players(team_id);
CREATE INDEX idx_comp_players_player_id ON competition_players(player_id);

-- ============================================================================
-- RLS policies
-- ============================================================================

ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_players ENABLE ROW LEVEL SECURITY;

-- Admin: full access to competitions
CREATE POLICY "admin_competitions_all" ON competitions
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Admin: full access to competition_players
CREATE POLICY "admin_comp_players_all" ON competition_players
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Parents: can see competitions containing their family's players
CREATE POLICY "parent_competitions_select" ON competitions FOR SELECT
  USING (id IN (
    SELECT t.competition_id FROM teams t
    JOIN competition_players cp ON cp.team_id = t.id
    WHERE cp.player_id IN (
      SELECT p.id FROM players p WHERE p.family_id = get_user_family_id(auth.uid())
    )
  ));

-- Parents: can see competition_players linked to their family
CREATE POLICY "parent_comp_players_select" ON competition_players FOR SELECT
  USING (player_id IN (
    SELECT p.id FROM players p WHERE p.family_id = get_user_family_id(auth.uid())
  ));

-- Coach: can see competitions for teams they coach
CREATE POLICY "coach_competitions_select" ON competitions FOR SELECT
  USING (id IN (
    SELECT competition_id FROM teams WHERE coach_id = get_user_coach_id(auth.uid())
  ));

-- Coach: can see competition_players on their teams
CREATE POLICY "coach_comp_players_select" ON competition_players FOR SELECT
  USING (team_id IN (
    SELECT id FROM teams WHERE coach_id = get_user_coach_id(auth.uid())
  ));
