-- Parent RLS policies for attendances and charges
-- Parents need INSERT/UPDATE/DELETE on attendances (book, mark away, cancel)
-- Parents need INSERT/UPDATE on charges (create charge on book, void on cancel/away)

-- ── attendances ────────────────────────────────────────────────────────────

CREATE POLICY "parent_attendances_insert" ON attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE family_id = get_user_family_id(auth.uid())
    )
  );

CREATE POLICY "parent_attendances_update" ON attendances
  FOR UPDATE TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE family_id = get_user_family_id(auth.uid())
    )
  );

CREATE POLICY "parent_attendances_delete" ON attendances
  FOR DELETE TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE family_id = get_user_family_id(auth.uid())
    )
  );

-- ── charges ────────────────────────────────────────────────────────────────

CREATE POLICY "parent_charges_insert" ON charges
  FOR INSERT TO authenticated
  WITH CHECK (
    family_id = get_user_family_id(auth.uid())
  );

CREATE POLICY "parent_charges_update" ON charges
  FOR UPDATE TO authenticated
  USING (
    family_id = get_user_family_id(auth.uid())
  );
