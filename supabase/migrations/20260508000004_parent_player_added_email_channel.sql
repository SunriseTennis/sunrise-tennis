-- Plan 19 Phase 8 — strengthen parent.player.added notification.
--
-- Add the email channel + nudge body so the admin gets a real prompt to
-- confirm classifications when a parent self-adds a player. Body now
-- explicitly asks for action + links to the admin view of the family.

UPDATE notification_rules
   SET channels = '["push","in_app","email"]'::jsonb,
       title_template = 'New player added — please confirm classifications',
       body_template = '{familyName} added {playerName}{ballColorSuffix}. Tap to confirm their ball level and classifications.',
       url_template = '/admin/families'
 WHERE event_type = 'parent.player.added';
