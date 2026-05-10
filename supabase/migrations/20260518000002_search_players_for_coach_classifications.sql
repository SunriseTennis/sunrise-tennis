-- Plan 24 PR1 — replace search_players_for_coach RPC return shape:
-- ball_color (column being retired) → classifications (text[]).
--
-- DROP first because Postgres can't change a function's RETURNS TABLE
-- column types via CREATE OR REPLACE.

DROP FUNCTION IF EXISTS search_players_for_coach(text);

CREATE OR REPLACE FUNCTION search_players_for_coach(query text)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  classifications text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.first_name, p.last_name, p.classifications
  FROM players p
  WHERE p.status = 'active'
    AND (
      p.first_name ILIKE '%' || query || '%'
      OR p.last_name ILIKE '%' || query || '%'
    )
  ORDER BY p.last_name, p.first_name
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION search_players_for_coach(text) TO authenticated;
