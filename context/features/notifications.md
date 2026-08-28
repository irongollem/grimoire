# Email Notifications

Players get an email when their DM publishes something for them. Two events
exist today:

| Event                | Fires when…                                                        | Recipients                                              |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| **Note shared**      | A note's `player_visible_to` gains party members (create or edit)  | Only the players **newly added** to `player_visible_to` |
| **Session proposed** | A DM adds a date in the Scheduling tab (`session_proposals` insert) | All `campaign_members` with `role = 'player'`           |

Both are **opt-out**: a missing `notification_preferences` row means every
email type is ON, and players toggle them off under **`/play/settings` →
Email Notifications** (`PlayerSettingsNotifications.vue`).

## Architecture — why client-invoked, not a DB trigger

The DM's action fires a **fire-and-forget** `supabase.functions.invoke` from
the browser (`src/composables/campaign/useEmailNotify.ts`, same pattern as
`queueNoteEmbedding`):

- `NoteEditor.vue` `save()` — diffs old vs new `player_visible_to` and sends
  the **added** party-member ids (NOT the `justShared` boolean, which misses
  adding a second player to an already-shared note).
- `SchedulingTab.vue` `addProposal()` — sends the created proposal id, and
  also posts the 📅 in-app `sendCampaignAnnouncement` chat message.

A `notes`/`session_proposals` AFTER-trigger was considered and rejected on
purpose: **campaign backup restore** (`useCampaignBackup.ts`) inserts straight
into both tables, and a trigger would mass-email every player about years-old
content on every restore. Losing coverage of non-UI write paths (MCP, REST) is
the accepted cost — do not "fix" this by adding a trigger.

## The edge function — `send-notification-email`

`supabase/functions/send-notification-email/index.ts`. The request body is a
*pointer*, never an authority:

1. Verifies the caller's JWT (`getUser()`), then that the caller is a
   `role = 'dm'` member of the row's campaign.
2. Re-derives recipients from DB state: for notes, the claimed "added" ids are
   intersected with the row's actual `player_visible_to`, then mapped
   `party_member_id → campaign_members.user_id`; the caller is always excluded.
3. Filters through `notification_preferences` (missing row = opted in).
4. Rate-limits (`email_notify`: 30 invocations/hour/user — one invocation may
   email a whole party).
5. Resolves addresses server-side via `auth.admin.getUserById` — **player
   emails exist only in `auth.users` and must never reach the browser.**
6. Sends one email per recipient via Resend's REST API. Titles and names are
   HTML-escaped in `emails.ts` (pure module, vitest-covered).

Emails contain the note/session **title only**, never note content — no
TipTap-JSON rendering server-side, and nothing sensitive in inboxes.

Note emails **deep-link the exact note**:
`/play/journal?tab=dm-notes&note=<id>`. `PlayerJournalView.vue` watches the
`note` query param on the DM Notes tab, expands that card, scrolls to it
(`dm-note-<id>` element ids in `PlayerJournalDmNotesTab.vue`), marks it read,
and then drops the param. Proposal emails link `/play/settings` (the RSVP
toggles).

## Configuration (production)

Without configuration the function is deployed but inert (`{ configured:
false }` — the poll-meshy-jobs precedent). To activate:

```
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set NOTIFY_FROM_EMAIL="Grimoire <notifications@dungeongrimoire.com>"  # optional, this is the default
```

The sending domain (`dungeongrimoire.com`) must be verified in the Resend
dashboard (DKIM + SPF DNS records) before Resend will accept the `from`.
Supabase itself offers SMTP only for **auth** emails (signup/reset) — there is
no Supabase-provided API for application email, hence Resend.

## DB

- `notification_preferences` (migration `20260805000002`): `user_id` PK →
  `auth.users`, `email_shared_notes`, `email_session_proposals`, both
  `default true`. RLS: own-row only, all four verbs. Rows are created lazily
  on first toggle (`useNotificationPreferences.ts`), so existing accounts need
  no backfill.
