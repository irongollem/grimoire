-- Migration: email_is_for_planning
--
-- Email is for planning between sessions, never for play. A note or a handout
-- is shared mostly during a session, with the whole table present, and already
-- reaches the player in the app (journal unread dots, the campaign
-- announcement). So `send-notification-email` no longer sends the shared-note
-- email (or the handout email #970 briefly added beside it), and the switch
-- that turned the shared-note email off has nothing left to switch.
--
-- Only the session-date proposal is emailed now, under
-- `email_session_proposals`, which stays.

alter table public.notification_preferences drop column email_shared_notes;
