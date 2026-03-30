-- Seed data: Winter 2026 competitions from tracking spreadsheet
-- Three competitions, their teams, and all known players

-- ============================================================================
-- Competitions
-- ============================================================================

INSERT INTO competitions (id, name, short_name, type, season, nomination_open, nomination_close, season_start, season_end, finals_start, finals_end, status) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Winter Pennant', 'WP', 'external', 'Winter 2026', '2026-03-06', '2026-04-07', '2026-05-09', '2026-08-22', '2026-08-29', '2026-09-05', 'nominations_open'),
  ('a1000000-0000-0000-0000-000000000002', 'Junior State League', 'JSL', 'external', 'Winter 2026', '2026-03-23', '2026-04-06', '2026-05-15', '2026-08-14', '2026-08-21', '2026-08-28', 'nominations_open'),
  ('a1000000-0000-0000-0000-000000000003', 'Glenelg & Western Districts', 'G&WD', 'external', 'Winter 2026', '2026-03-01', '2026-04-09', '2026-05-01', '2026-08-21', '2026-08-28', '2026-09-05', 'nominations_open');

-- ============================================================================
-- Teams — Winter Pennant (Saturday seniors)
-- ============================================================================

INSERT INTO teams (id, name, competition_id, division, gender, age_group, team_size_required, nomination_status, status) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Div 1 / Pennant Men', 'a1000000-0000-0000-0000-000000000001', 'Division 1', 'male', 'senior', 4, 'draft', 'active'),
  ('b1000000-0000-0000-0000-000000000002', 'Div 2 Men', 'a1000000-0000-0000-0000-000000000001', 'Division 2', 'male', 'senior', 4, 'draft', 'active'),
  ('b1000000-0000-0000-0000-000000000003', 'Div 3 Men', 'a1000000-0000-0000-0000-000000000001', 'Division 3', 'male', 'senior', 4, 'draft', 'active'),
  ('b1000000-0000-0000-0000-000000000004', 'Div 3 Women', 'a1000000-0000-0000-0000-000000000001', 'Division 3', 'female', 'senior', 4, 'draft', 'active'),
  ('b1000000-0000-0000-0000-000000000005', 'Div 5 Men', 'a1000000-0000-0000-0000-000000000001', 'Division 5', 'male', 'senior', 4, 'draft', 'active'),
  ('b1000000-0000-0000-0000-000000000006', 'Div 6 Men', 'a1000000-0000-0000-0000-000000000001', 'Division 6', 'male', 'senior', 4, 'draft', 'active');

-- ============================================================================
-- Teams — G&WD Saturday Juniors
-- ============================================================================

INSERT INTO teams (id, name, competition_id, division, gender, age_group, team_size_required, nomination_status, status) VALUES
  ('b1000000-0000-0000-0000-000000000010', 'Div 2 Boys', 'a1000000-0000-0000-0000-000000000003', 'Division 2', 'male', 'junior', 4, 'draft', 'active'),
  ('b1000000-0000-0000-0000-000000000011', 'Div 3 Boys', 'a1000000-0000-0000-0000-000000000003', 'Division 3', 'male', 'junior', 4, 'draft', 'active'),
  ('b1000000-0000-0000-0000-000000000012', 'Div 1 Girls', 'a1000000-0000-0000-0000-000000000003', 'Division 1', 'female', 'junior', 3, 'draft', 'active'),
  ('b1000000-0000-0000-0000-000000000013', 'Div 2 Girls', 'a1000000-0000-0000-0000-000000000003', 'Division 2', 'female', 'junior', 3, 'draft', 'active');

-- ============================================================================
-- Teams — G&WD Friday Night Juniors
-- ============================================================================

INSERT INTO teams (id, name, competition_id, division, gender, age_group, team_size_required, nomination_status, status) VALUES
  ('b1000000-0000-0000-0000-000000000014', 'Fri Prems Boys', 'a1000000-0000-0000-0000-000000000003', 'Premiers', 'male', 'junior', 4, 'draft', 'active'),
  ('b1000000-0000-0000-0000-000000000015', 'Fri A1 Boys', 'a1000000-0000-0000-0000-000000000003', 'A1', 'male', 'junior', 4, 'draft', 'active');

-- ============================================================================
-- Teams — Junior State League (Friday)
-- ============================================================================

INSERT INTO teams (id, name, competition_id, division, gender, age_group, team_size_required, nomination_status, status) VALUES
  ('b1000000-0000-0000-0000-000000000020', 'JSL Premier Boys', 'a1000000-0000-0000-0000-000000000002', 'Premier', 'male', 'junior', 5, 'draft', 'active'),
  ('b1000000-0000-0000-0000-000000000021', 'JSL 2', 'a1000000-0000-0000-0000-000000000002', 'JSL 2', 'male', 'junior', 5, 'draft', 'active');

-- ============================================================================
-- Players — Div 1 / Pennant Men
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, role, registration_status, notes) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Maxim', 'Paskalutsa', 'mainstay', 'unregistered', NULL),
  ('b1000000-0000-0000-0000-000000000001', 'Sota', 'Kawaguchi', 'mainstay', 'unregistered', 'Also in JSL'),
  ('b1000000-0000-0000-0000-000000000001', 'George', 'Retallick', 'mainstay', 'unregistered', 'Also in JSL'),
  ('b1000000-0000-0000-0000-000000000001', 'Nicholas', 'Bradley', 'fill_in', 'unregistered', NULL),
  ('b1000000-0000-0000-0000-000000000001', 'Gabriel', 'Santos', 'potential', 'unregistered', 'Maybe'),
  ('b1000000-0000-0000-0000-000000000001', 'Matt', 'Milham', 'potential', 'unregistered', 'Maybe fill in');

-- ============================================================================
-- Players — Div 2 Men
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, role, registration_status, notes) VALUES
  ('b1000000-0000-0000-0000-000000000002', 'Declan', NULL, 'mainstay', 'unregistered', 'Surname?'),
  ('b1000000-0000-0000-0000-000000000002', 'James', 'Domergue', 'mainstay', 'unregistered', NULL),
  ('b1000000-0000-0000-0000-000000000002', 'Scott', 'Martin', 'mainstay', 'unregistered', NULL),
  ('b1000000-0000-0000-0000-000000000002', 'Binh', 'Ho', 'fill_in', 'unregistered', NULL);

-- ============================================================================
-- Players — Div 3 Men
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, role, registration_status, notes) VALUES
  ('b1000000-0000-0000-0000-000000000003', 'Keita', 'Kawaguchi', NULL, 'mainstay', 'unregistered', 'Also in JSL 2'),
  ('b1000000-0000-0000-0000-000000000003', 'Lewis', 'Newman', 13, 'mainstay', 'registered', 'Also in JSL 2'),
  ('b1000000-0000-0000-0000-000000000003', 'Harry', 'Hockley', NULL, 'mainstay', 'unregistered', 'Also in JSL 2');

-- ============================================================================
-- Players — Div 3 Women
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, gender, role, registration_status, notes) VALUES
  ('b1000000-0000-0000-0000-000000000004', 'Sophie', 'Cerny', 16, 'female', 'mainstay', 'registered', 'Junior - also eligible for junior comps'),
  ('b1000000-0000-0000-0000-000000000004', 'Georgia', 'Caruso', NULL, 'female', 'mainstay', 'unregistered', NULL),
  ('b1000000-0000-0000-0000-000000000004', 'Anita', NULL, NULL, 'female', 'mainstay', 'unregistered', 'Surname?'),
  ('b1000000-0000-0000-0000-000000000004', 'Megan', NULL, NULL, 'female', 'mainstay', 'unregistered', 'Surname?'),
  ('b1000000-0000-0000-0000-000000000004', 'Zoe', 'Patful-Balmer', NULL, 'female', 'fill_in', 'unregistered', NULL);

-- ============================================================================
-- Players — Div 5 Men (all registered)
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, gender, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000005', 'Joshua', 'Bamford', 18, 'male', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000005', 'Brodie', 'Loftus', 20, 'male', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000005', 'Cooper', 'Ebert', 21, 'male', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000005', 'Cody', 'Russell', 18, 'male', 'mainstay', 'registered');

-- ============================================================================
-- Players — Div 6 Men
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, gender, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000006', 'Christopher', 'Bradley', 70, 'male', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000006', 'Tim', 'Sporne', 63, 'male', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000006', 'David', 'Haddow', 37, 'male', 'mainstay', 'registered');

INSERT INTO competition_players (team_id, first_name, last_name, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000006', 'Cedrik', 'Delavault', 'mainstay', 'unregistered');

-- ============================================================================
-- Players — G&WD Div 2 Boys (all registered)
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, gender, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000010', 'Sebastian', 'Buckley', 10, 'male', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000010', 'Lachlan', 'Croft', 11, 'male', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000010', 'Tomas', 'Perez van den Berg', 10, 'male', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000010', 'Mohamed', 'Bensaid', 10, 'male', 'mainstay', 'registered');

-- ============================================================================
-- Players — G&WD Div 3 Boys (registered + potential)
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, gender, role, registration_status, notes) VALUES
  ('b1000000-0000-0000-0000-000000000011', 'Charles', 'Buckley', 9, 'male', 'mainstay', 'registered', 'Too young for JSL'),
  ('b1000000-0000-0000-0000-000000000011', 'Ethan', 'Earl', 10, 'male', 'mainstay', 'registered', NULL),
  ('b1000000-0000-0000-0000-000000000011', 'Hugh', 'Davison', 11, 'male', 'mainstay', 'registered', NULL),
  ('b1000000-0000-0000-0000-000000000011', 'Peter', 'Jarvis', 14, 'male', 'mainstay', 'registered', NULL),
  ('b1000000-0000-0000-0000-000000000011', 'Mitchell', 'Lyle', 11, 'male', 'mainstay', 'registered', NULL),
  ('b1000000-0000-0000-0000-000000000011', 'Max', 'Pummeroy', 13, 'male', 'mainstay', 'registered', NULL),
  ('b1000000-0000-0000-0000-000000000011', 'Seb', 'Scholar', 14, 'male', 'mainstay', 'registered', NULL);

INSERT INTO competition_players (team_id, first_name, last_name, gender, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000011', 'Noah', 'Sandercock', 'male', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000011', 'Julian', 'Douglas', 'male', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000011', 'Finn', 'Rainer', 'male', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000011', 'Kelsey', 'Hara', 'male', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000011', 'Theo', 'Ballestrin', 'male', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000011', 'James', 'Evans', 'male', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000011', 'Leo', 'Pfitzner', 'male', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000011', 'Liam', 'Stuart', 'male', 'potential', 'unregistered');

-- ============================================================================
-- Players — G&WD Div 1 Girls (all registered)
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, gender, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000012', 'Hemani', 'Mikkilineni', 13, 'female', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000012', 'Kendal', 'Trang-Ho', 14, 'female', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000012', 'Reesey', 'Trang-Ho', 15, 'female', 'mainstay', 'registered');

-- ============================================================================
-- Players — G&WD Div 2 Girls
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, gender, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000013', 'Isla', 'Fraser', 11, 'female', 'mainstay', 'registered'),
  ('b1000000-0000-0000-0000-000000000013', 'Isla', 'Sanders', 11, 'female', 'mainstay', 'registered');

INSERT INTO competition_players (team_id, first_name, last_name, gender, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000013', 'Ella', 'Zhu', 'female', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000013', 'Olive', 'Nitschke', 'female', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000013', 'Reeva', 'Modi', 'female', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000013', 'Olivia', 'Treyhorn', 'female', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000013', 'Florence', 'Ballestrin', 'female', 'potential', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000013', 'Ashlyn', 'Stuart', 'female', 'potential', 'unregistered');

-- ============================================================================
-- Players — Fri Prems Boys
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000014', 'Jensen', 'Owen', 'mainstay', 'unregistered');

-- ============================================================================
-- Players — Fri A1 Boys
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, gender, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000015', 'Harrison', 'Sincock', 14, 'male', 'mainstay', 'registered');

INSERT INTO competition_players (team_id, first_name, last_name, role, registration_status) VALUES
  ('b1000000-0000-0000-0000-000000000015', 'Hendricks', 'Wiegolsz', 'mainstay', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000015', 'Ethan', 'Zhu', 'mainstay', 'unregistered'),
  ('b1000000-0000-0000-0000-000000000015', 'Lucas', 'Carey', 'mainstay', 'unregistered');

-- ============================================================================
-- Players — JSL Premier Boys
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, gender, role, registration_status, notes) VALUES
  ('b1000000-0000-0000-0000-000000000020', 'Justin', 'Wu', 12, 'male', 'mainstay', 'registered', NULL),
  ('b1000000-0000-0000-0000-000000000020', 'Charlie', 'Angus', 14, 'male', 'mainstay', 'registered', NULL),
  ('b1000000-0000-0000-0000-000000000020', 'Jacob', 'Newman', 16, 'male', 'mainstay', 'registered', NULL),
  ('b1000000-0000-0000-0000-000000000020', 'Sota', 'Kawaguchi', NULL, 'male', 'mainstay', 'unregistered', 'Also in Div 1 Men'),
  ('b1000000-0000-0000-0000-000000000020', 'George', 'Retallick', NULL, 'male', 'mainstay', 'unregistered', 'Also in Div 1 Men');

-- ============================================================================
-- Players — JSL 2
-- ============================================================================

INSERT INTO competition_players (team_id, first_name, last_name, age, gender, role, registration_status, notes) VALUES
  ('b1000000-0000-0000-0000-000000000021', 'Keita', 'Kawaguchi', NULL, 'male', 'mainstay', 'unregistered', 'Also in Div 3 Men'),
  ('b1000000-0000-0000-0000-000000000021', 'Lewis', 'Newman', 13, 'male', 'mainstay', 'registered', 'Also in Div 3 Men'),
  ('b1000000-0000-0000-0000-000000000021', 'Harry', 'Hockley', NULL, 'male', 'mainstay', 'unregistered', 'Also in Div 3 Men');

-- ============================================================================
-- Unassigned registered players — add as notes to competition
-- Harry Alderman (17, M, registered) and Ollie Sparkes (14, M, registered)
-- are registered on ClubSpark but not assigned to any team yet
-- ============================================================================

UPDATE competitions SET notes = 'Byes: 16-May (doubles only), 06-Jun, 11-Jul. Unassigned registered: Harry Alderman (17), Ollie Sparkes (14)' WHERE id = 'a1000000-0000-0000-0000-000000000001';
UPDATE competitions SET notes = 'Must be 10+ by 15-May. 5 players per team, locked after close. $200/team fee. No changes after nominations close.' WHERE id = 'a1000000-0000-0000-0000-000000000002';
UPDATE competitions SET notes = 'Byes: 05-06 Jun, 10-11 Jul, 17-18 Jul. Boys need 4, girls need 3. Fri night Prems/A1/A2 also run under G&WD.' WHERE id = 'a1000000-0000-0000-0000-000000000003';
