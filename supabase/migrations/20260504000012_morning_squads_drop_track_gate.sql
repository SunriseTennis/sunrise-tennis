-- Drop the `performance` track gate on morning squads so elite players who
-- aren't tagged with the performance track can still enrol. The
-- allowed_classifications=['advanced','elite'] gate continues to keep
-- non-elite/non-advanced families out (also surfaced to Strict-Hide via
-- isStrictlyGated's classifications-subset extension in eligibility.ts).
--
-- Thursday performance squads keep their `track_required='performance'` —
-- this migration only touches the two morning-squad rows.

update programs
   set track_required = null
 where slug in ('tue-morning-squad', 'wed-morning-squad');
