-- Plan 22 follow-up — make the {date} suffix optional on parent.session.booked.
--
-- The rule was rendering `{playerName} booked into {programName} on {date}`,
-- but the casual-enrol path inside `enrolInProgram` has no session date (the
-- parent enrols for one session, date TBD). The dispatcher's naive {key}
-- substitution rendered an empty string and we ended up with
-- `"Testing-Ann booked into McAuley Afterschool on "` (trailing space).
--
-- Rebuild the rule using a `{dateSuffix}` placeholder. The caller passes
-- `dateSuffix: ' on ' + date` when a date is known (calendar quick-book) and
-- `dateSuffix: ''` when it isn't (casual enrol). Same pattern as the existing
-- `{ballColorSuffix}` and `{earlyBirdReminder}` placeholders.

UPDATE notification_rules
   SET body_template = '{playerName} booked into {programName}{dateSuffix}'
 WHERE event_type = 'parent.session.booked'
   AND audience   = 'admins';
