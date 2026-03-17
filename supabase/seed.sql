-- Seed: Complete data for Sunrise Tennis Term 1, 2026
-- Venues, coaches, and all 22 active programs

-- =====================================================
-- VENUES
-- =====================================================

INSERT INTO venues (id, name, address, courts, notes)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Somerton Park Tennis Club',
  '40 Wilton Ave, Somerton Park SA 5044',
  4,
  'Primary venue for all FTD/Sunrise Tennis programs'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO venues (id, name, address, courts, notes)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  'Paringa Park Primary School',
  NULL,
  NULL,
  'School venue — Monday afterschool program'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO venues (id, name, address, courts, notes)
VALUES (
  '00000000-0000-0000-0000-000000000011',
  'McAuley Community School',
  NULL,
  NULL,
  'School venue — Wednesday afterschool program'
) ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- COACHES
-- =====================================================

INSERT INTO coaches (id, name, phone, email, status, is_owner)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Maxim',
  '0431 368 752',
  'foundationtennis@hotmail.com',
  'active',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO coaches (id, name, phone, email, status, is_owner)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Zoe',
  NULL,
  NULL,
  'active',
  false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO coaches (id, name, phone, email, status, is_owner)
VALUES (
  '00000000-0000-0000-0000-000000000004',
  'George',
  NULL,
  NULL,
  'active',
  false
) ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- PROGRAMS — Monday (day_of_week = 1)
-- =====================================================

INSERT INTO programs (id, name, slug, type, level, day_of_week, start_time, end_time, duration_min, venue_id, term_fee_cents, per_session_cents, max_capacity, status, term, description)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'Paringa Park Afterschool', 'mon-paringa-park', 'school', 'red', 1, '15:15', '16:00', 45, '00000000-0000-0000-0000-000000000010', NULL, NULL, NULL, 'active', 'Term 1 2026', 'School-based afterschool program at Paringa Park Primary School'),
  ('10000000-0000-0000-0000-000000000002', 'Mon Red Ball', 'mon-red-ball', 'group', 'red', 1, '16:15', '17:00', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', NULL),
  ('10000000-0000-0000-0000-000000000003', 'Mon Orange Ball', 'mon-orange-ball', 'group', 'orange', 1, '17:00', '17:45', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', NULL),
  ('10000000-0000-0000-0000-000000000004', 'Mon Green Ball', 'mon-green-ball', 'group', 'green', 1, '17:45', '18:30', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', NULL),
  ('10000000-0000-0000-0000-000000000005', 'Mon Yellow Ball', 'mon-yellow-ball', 'group', 'yellow', 1, '18:30', '19:30', 60, '00000000-0000-0000-0000-000000000001', 20000, 2500, NULL, 'active', 'Term 1 2026', NULL);

-- =====================================================
-- PROGRAMS — Tuesday (day_of_week = 2)
-- =====================================================

INSERT INTO programs (id, name, slug, type, level, day_of_week, start_time, end_time, duration_min, venue_id, term_fee_cents, per_session_cents, max_capacity, status, term, description)
VALUES
  ('10000000-0000-0000-0000-000000000006', 'Tue Blue Ball', 'tue-blue-ball', 'group', 'blue', 2, '15:45', '16:15', 30, '00000000-0000-0000-0000-000000000001', 12000, 1500, NULL, 'active', 'Term 1 2026', NULL),
  ('10000000-0000-0000-0000-000000000007', 'Tue Red Ball', 'tue-red-ball', 'group', 'red', 2, '16:00', '16:45', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', 'Zoe starts at 4:00pm, Maxim takes over at 4:15pm'),
  ('10000000-0000-0000-0000-000000000008', 'Tue Orange Ball', 'tue-orange-ball', 'group', 'orange', 2, '16:45', '17:30', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', NULL),
  ('10000000-0000-0000-0000-000000000009', 'Tue Green Ball', 'tue-green-ball', 'group', 'green', 2, '17:30', '18:15', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', NULL);

-- =====================================================
-- PROGRAMS — Wednesday (day_of_week = 3)
-- =====================================================

INSERT INTO programs (id, name, slug, type, level, day_of_week, start_time, end_time, duration_min, venue_id, term_fee_cents, per_session_cents, max_capacity, status, term, description)
VALUES
  ('10000000-0000-0000-0000-000000000010', 'McAuley Afterschool', 'wed-mcauley', 'school', 'red', 3, '15:15', '16:00', 45, '00000000-0000-0000-0000-000000000011', 6000, 2000, NULL, 'active', 'Term 1 2026', 'Afterschool program at McAuley. 3 paid weeks + 1 free trial.'),
  ('10000000-0000-0000-0000-000000000011', 'Wed Girls Red Ball', 'wed-girls-red', 'group', 'red', 3, '16:15', '17:00', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', 'Girls only'),
  ('10000000-0000-0000-0000-000000000012', 'Wed Girls Orange/Green', 'wed-girls-orange-green', 'group', 'orange-green', 3, '17:00', '17:45', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', 'Girls only'),
  ('10000000-0000-0000-0000-000000000013', 'Wed Girls Yellow', 'wed-girls-yellow', 'group', 'yellow', 3, '17:45', '18:45', 60, '00000000-0000-0000-0000-000000000001', 20000, 2500, NULL, 'active', 'Term 1 2026', 'Girls only'),
  ('10000000-0000-0000-0000-000000000014', 'Wed Yellow Ball', 'wed-yellow-ball', 'group', 'yellow', 3, '18:45', '19:45', 60, '00000000-0000-0000-0000-000000000001', 20000, 2500, NULL, 'active', 'Term 1 2026', NULL);

-- =====================================================
-- PROGRAMS — Thursday Squads (day_of_week = 4)
-- =====================================================

INSERT INTO programs (id, name, slug, type, level, day_of_week, start_time, end_time, duration_min, venue_id, term_fee_cents, per_session_cents, max_capacity, status, term, description)
VALUES
  ('10000000-0000-0000-0000-000000000015', 'Thu Red Squad', 'thu-red-squad', 'squad', 'red', 4, '16:00', '16:45', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', 'Invitation/selection based performance squad'),
  ('10000000-0000-0000-0000-000000000016', 'Thu Orange Squad', 'thu-orange-squad', 'squad', 'orange', 4, '16:45', '17:30', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', 'Invitation/selection based performance squad'),
  ('10000000-0000-0000-0000-000000000017', 'Thu Green Squad', 'thu-green-squad', 'squad', 'green', 4, '17:30', '18:15', 45, '00000000-0000-0000-0000-000000000001', 16000, 2000, NULL, 'active', 'Term 1 2026', 'Invitation/selection based performance squad'),
  ('10000000-0000-0000-0000-000000000018', 'Thu Yellow Squad', 'thu-yellow-squad', 'squad', 'yellow', 4, '18:15', '19:15', 60, '00000000-0000-0000-0000-000000000001', 20000, 2500, NULL, 'active', 'Term 1 2026', 'Invitation/selection based performance squad'),
  ('10000000-0000-0000-0000-000000000019', 'Thu Elite Squad', 'thu-elite-squad', 'squad', 'elite', 4, '19:15', '20:30', 75, '00000000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'active', 'Term 1 2026', 'High-performance squad. George and Sota (8+ UTR).');

-- =====================================================
-- PROGRAMS — Friday (day_of_week = 5)
-- =====================================================

INSERT INTO programs (id, name, slug, type, level, day_of_week, start_time, end_time, duration_min, venue_id, term_fee_cents, per_session_cents, max_capacity, status, term, description)
VALUES
  ('10000000-0000-0000-0000-000000000020', 'Fri Red/Orange Match Play', 'fri-match-play', 'competition', 'red-orange', 5, '16:15', '17:15', 60, '00000000-0000-0000-0000-000000000001', 20000, 2500, NULL, 'active', 'Term 1 2026', 'Supervised match play run by Zoe');

-- =====================================================
-- PROGRAMS — Saturday (day_of_week = 6)
-- =====================================================

INSERT INTO programs (id, name, slug, type, level, day_of_week, start_time, end_time, duration_min, venue_id, term_fee_cents, per_session_cents, max_capacity, status, term, description)
VALUES
  ('10000000-0000-0000-0000-000000000021', 'Sat Red Comp', 'sat-red-comp', 'competition', 'red', 6, '11:00', '12:00', 60, '00000000-0000-0000-0000-000000000001', 20000, 2500, NULL, 'active', 'Term 1 2026', 'Saturday competition run by Zoe'),
  ('10000000-0000-0000-0000-000000000022', 'Sat Orange/Green Comp', 'sat-orange-green-comp', 'competition', 'orange-green', 6, '11:00', '12:15', 75, '00000000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'active', 'Term 1 2026', 'Saturday competition');

-- =====================================================
-- PROGRAM COACHES — link coaches to programs
-- =====================================================

-- Monday: all Maxim
INSERT INTO program_coaches (program_id, coach_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'primary');

-- Tuesday: Maxim primary on all, Zoe assists on Red Ball
INSERT INTO program_coaches (program_id, coach_id, role, availability) VALUES
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', 'primary', NULL),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002', 'primary', 'Takes over at 4:15pm'),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', 'assistant', 'Starts at 4:00pm, hands over at 4:15pm'),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002', 'primary', NULL),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000002', 'primary', NULL);

-- Wednesday: all Maxim
INSERT INTO program_coaches (program_id, coach_id, role) VALUES
  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000002', 'primary');

-- Thursday: Maxim primary + George assistant (Red through Yellow), Maxim only on Elite
INSERT INTO program_coaches (program_id, coach_id, role) VALUES
  ('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000004', 'assistant'),
  ('10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000004', 'assistant'),
  ('10000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000004', 'assistant'),
  ('10000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000002', 'primary'),
  ('10000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000004', 'assistant'),
  ('10000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000002', 'primary');

-- Friday: Zoe primary
INSERT INTO program_coaches (program_id, coach_id, role) VALUES
  ('10000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000003', 'primary');

-- Saturday: Zoe primary on Red Comp, Maxim primary on Orange/Green Comp
INSERT INTO program_coaches (program_id, coach_id, role) VALUES
  ('10000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000003', 'primary'),
  ('10000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000002', 'primary');
