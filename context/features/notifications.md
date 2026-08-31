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

A proposal email is **composed per recipient**, not once for the party, because
each carries that player's own RSVP token — see below. The note email is still
one message repeated.

Emails contain the note/session **title only**, never note content — no
TipTap-JSON rendering server-side, and nothing sensitive in inboxes.

## Answering a session proposal from the email itself

The proposal email is the only place most of the party will see a suggested
date in time to act on it: they open Grimoire on session day, and by then the
DM has already had to pick. So the email carries two ways to answer, and both
land in `session_availability` exactly as the in-app toggle does.

**The token.** `issue_session_rsvp_invites(proposal_id, user_ids)` mints one
row in `session_proposal_invites` per recipient — a uuid capability, the same
shape as `campaigns.ical_token`. The table has RLS on and **no policies at
all**: nothing in the browser may read it, DMs included, because holding the
token is holding the right to answer in that player's name. Tokens are minted
after the opt-out filter, so nothing is issued for someone who will not be
mailed, and a failure to mint is non-fatal — the email still goes, minus the
buttons.

**Route 1 — two links** (`session-rsvp`, `verify_jwt = false`). "I'm in" and
"Can't make it", each `?token=…&answer=…`. GET renders a confirmation form and
only POST records, for the reason `waitlist-unsubscribe` spells out: mail
gateways prefetch every URL in a message, and unlike an unsubscribe a spurious
answer is *wrong* half the time — a phantom "I'm in" is how a DM books an
evening nobody attends.

**Route 2 — the invitation** (`session-rsvp-inbound`, `verify_jwt = false`).
The message also carries a `METHOD:REQUEST` iCalendar part built by
`_shared/ics.ts`, which is what makes Gmail, Apple Mail and Outlook draw
Accept / Maybe / Decline on the message. Its `ORGANIZER` is
`rsvp+<token>@<RSVP_INBOUND_DOMAIN>`, and every mail client copies `ORGANIZER`
verbatim into the `METHOD:REPLY` it sends back — so the reply identifies itself
by capability, never by a `From` header (forgeable, and rewritten by corporate
relays anyway). An inbound-email provider posts that reply to
`session-rsvp-inbound`, authenticated by `INBOUND_EMAIL_SECRET`.

**"Maybe" records nothing, on purpose.** Grimoire's availability is a boolean;
writing a tentative as a yes would tell the DM the player is coming, which is a
wrong answer given in that player's name. `availabilityFromPartstat` returns
null for `TENTATIVE`, `DELEGATED` and `NEEDS-ACTION`, and the endpoint answers
200 with a reason so the provider stops redelivering.

**Two secrets, and the graceful degradation between them.** Without
`RSVP_INBOUND_DOMAIN` the invitation is omitted entirely rather than sent with
an organizer address nobody reads — an invitation whose Accept goes nowhere is
worse than none, because the player believes they have answered. Without
`INBOUND_EMAIL_SECRET` the inbound function refuses everything with 503 rather
than accepting unauthenticated mail. The one-click links work either way.

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

# Optional — turns on the mail-app Accept/Decline route. Both or neither:
# the domain puts the token in the invitation's ORGANIZER address, the secret
# authenticates the provider webhook that brings the reply back.
supabase secrets set RSVP_INBOUND_DOMAIN=dungeongrimoire.com
supabase secrets set INBOUND_EMAIL_SECRET="$(openssl rand -hex 32)"
```

Then point an inbound route for `rsvp+*@<RSVP_INBOUND_DOMAIN>` at
`<project>/functions/v1/session-rsvp-inbound`, passing the secret as the
`X-Grimoire-Inbound-Secret` header or a `?secret=` query parameter — whichever
the provider can set. `session-rsvp-inbound/extract.ts` reads the webhook
shapes of the common providers (an explicit `ics` field, base64 attachments,
raw MIME) rather than binding to one.

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
