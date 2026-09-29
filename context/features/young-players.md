# Young Players' Accounts

## Overview

Grimoire accounts for players under 16 are parent-managed rather than
self-registered (#919). An under-16 never ticks a "16 or older" box to get
past a gate: that either locks children out of their own player portals or
teaches them to answer untruthfully. Instead a parent with an ordinary account
creates the child's account, or approves a request the child sent them, and
that act is the recorded parental consent (COPPA; GDPR Art 8 and the Dutch
UAVG art 5, whose 16 is the strictest EU threshold and the one the whole
feature is built around).

A young player's account can do almost everything an ordinary player account
can, joining campaigns, playing characters, chatting, taking notes, with AI,
purchases, the calendar feed and email switched off. It signs in with a login
name the parent chose, not an email address, because it has none.

## The model

- **`child_accounts`** (migration `20260928053257_child_accounts.sql`) is the
  parent link: `child_user_id` (PK, references `auth.users`), `parent_user_id`
  (`on delete restrict`, see "Decisions not to undo"), `login_name`, `adult_on`,
  `consent_version`, `consented_at`. One row per child; RLS lets the parent and
  the child read their own rows and has **no write policy at all**. Every
  write comes from the `child-account` edge function under the service role.
- **`adult_on`** is the only age fact stored: the first day the account counts
  as 16, derived from a birth month and year and rounded up to the first of the
  following month (`adultOn()` in `_shared/childAccount.ts`). No birth date is
  ever kept, for the child or anyone answering the Terms gate's age question.
- **`private.is_child_account(p_user_id)`** is the canonical predicate:
  `exists (... adult_on > current_date)`, total by construction (`exists` is
  never NULL, so it can't fall through the way `is_app_admin()` once did). It
  lives in `private`, revoked from every client role; server-side callers that
  can't reach it (edge functions) query `child_accounts` directly instead
  (`_shared/accountGate.ts`'s `isChildAccount`).
- **The reserved login domain.** A child account has no email of its own.
  Supabase auth still needs one, so it gets
  `<login_name>@players.dungeongrimoire.invalid`. `.invalid` is reserved
  (RFC 2606) and can never resolve, so nothing Grimoire or Supabase sends can
  reach anyone, by construction rather than by a filter. `childLoginEmail()`,
  `isChildLoginEmail()` in `_shared/childAccount.ts`.
- **Login-name sign-in.** `signInEmail(identifier)` treats anything without an
  `@` as a login name and maps it to the reserved address; anything with an
  `@` passes through unchanged. `useAuthStore.signIn` calls it, so `LoginView`
  and `JoinCampaignView`'s login tab take one field ("Email or login name")
  with no separate child-login mode. It's deterministic, needing no lookup,
  and therefore no endpoint that would let someone probe whether a login name
  exists.
- `_shared/childAccount.ts` is pure and dependency-free, imported by both the
  client (`@edge-shared/childAccount.ts` alias) and every edge function that
  touches child accounts, so the age math and login-name rules cannot drift
  between the form and the server.

## Three ways a child account comes to exist

All three end up in the `child-account` edge function's `create` action
(`supabase/functions/child-account/index.ts`), which either creates a brand
new `auth.users` row or **converts** one that already exists (see below).

### 1. A parent adds one directly

`/account/family/add` (`AddChildView.vue`) with no `?request=` query param. The
parent fills in display name, login name, password, the child's birth month
and year, ticks the consent checkbox, and submits. `useCreateChild` posts
`{ action: "create", consentVersion: PARENTAL_CONSENT_VERSION, ... }`.
`handleCreate` in the edge function first checks the caller may act as a
parent at all (`parentRefusal`): Grimoire keeps no adult flag, so two things
the account told us stand in for one. An open `parental_consent_requests` row
for the caller means it said it is under 16 (`awaiting_parent`); a
`terms_version` other than the current one means it never answered the age
question as 16+ (`terms_not_accepted`). "Not an active child" alone is not
enough, since an under-16 still waiting for its parent is not one yet. It then
checks the consent version is current,
the birth month makes the child under 16 (a 16+ answer is refused with
`not_a_child`, since that path is for younger players only), the login name
and password are valid, then calls `createNewAccount`: `auth.admin.createUser`
at the reserved address, then insert the `child_accounts` link. If the link
insert fails, the just-created auth user is deleted again rather than left
behind: an unlinked `.invalid` login is a dead end nobody could ever sign
into.

### 2. An under-16 asks a parent, at signup or on a campaign invite

`SignupView.vue` and `JoinCampaignView.vue`'s signup tab both open on an age
question (`BirthMonthField`) before anything else can be typed. Nothing is
stored for an adult answer; only the under-16 branch writes anything down.
Answering under 16 swaps to `ParentRequestForm`, which posts the parent's
email to `request-parental-consent` (`verify_jwt = false`, since there's no
session yet to attach a bearer token to). That function:

- Validates the address and checks an optional campaign invite token is
  still valid (silently ignored if expired or revoked; the parent's form
  just creates the child unjoined in that case),
- Treats a bearer token that claims a user as a session that must verify
  (401 `unauthorized` otherwise). Only the anon or publishable key, which
  supabase-js sends when signed out, counts as anonymous. Falling back to
  anonymous would record an existing account's request as a new signup
  that can never convert, stranding the child on the waiting screen,
- Rate-limits in the append-only `rate_limit_events` log, before touching any
  row: 3 per address per 24h (keyed by a hash of the address, so the log
  never holds it), 3 per signed-in caller per 24h, and 60 an hour across all
  anonymous callers, which is what bounds how many *different* addresses can
  be mailed. A limited request gets `{ sent: true }` like a sent one, so the
  limit reveals nothing about an address. (Counting this function's own rows
  was bypassable: the signed-in path replaces the caller's previous request.)
- Inserts a `parental_consent_requests` row (`token`, `parent_email`,
  `campaign_invite_token`, `child_user_id: null` for this path) and emails
  the parent a link to `/account/family/add?request=<token>`. The email is
  fixed text: it says an invite was involved but never names the campaign,
  because anyone can name a campaign and have it mailed to any address.

The parent opens that link; `AddChildView` calls `inspect-request` to show
what they're approving (existing account or not, campaign name), then submits
the same form as path 1 but with `requestToken` attached. `handleCreate`
loads the request, checks the caller's **own confirmed email** equals the
request's `parent_email` (the token alone isn't the credential: it travels
in an email to whatever address the child typed, and a forwarded message or
shared inbox must not hand the child to whoever opens it first), then calls
`createNewAccount` exactly as path 1. If a `campaign_invite_token` rode along,
`join_campaign_for_child` (service-role RPC) joins the new account to that
campaign. The request row is deleted once used.

Session memory: `rememberUnder16()` / `wasAnsweredUnder16()`
(`src/lib/ageGateSession.ts`, `sessionStorage`) keeps a reload or back
navigation from simply re-offering the age question until it gets the wanted
answer. Standard age-gate hygiene, not paranoia specific to this feature.

### 3. An existing account is caught by the Terms gate

`TermsGate.vue` is a blocking dialog mounted once in `DefaultLayout` and
`PlayerLayout`, shown whenever `subscription.terms_version !== TERMS_VERSION`
(`shouldShowTermsGate` in `src/components/account/termsGate.ts`), except on
exactly `/account` and `/billing`, where its "I don't agree" links lead. The
Family pages are *not* exempt: adding a young player needs the current Terms,
so a parent arriving from a request email answers the gate first. Every
account created before #919 has a stale `terms_version` and was never asked
the age question, since a brand-new signup now stamps the current version and
age answer at creation. The gate asks the new Terms *and* the age question
together (`accept` phase). Answering under 16 moves to `parent-request`
(`ParentRequestForm`, `suppress-sent-state`, since the gate has its own next
state to show), which posts to `request-parental-consent` **with the
session's bearer token this time**, so the request row carries `child_user_id`
and the edge function can tell "existing account" from "brand-new signup"
without the component knowing which case it's in. The gate then shows
`waiting`, polling `useChildAccount().refetch` every 20s; the moment the
parent approves, `isChild` flips true and `shouldShowTermsGate` returns false
on its own.

Approving here uses the **same** `create` action as paths 1 and 2, but because
`consentRequest.child_user_id` is set, `handleCreate` calls
`convertExistingAccount` instead of `createNewAccount`: it links `child_accounts`
first, then rewrites the account's email to the reserved address (link before
login-rewrite, so a failure partway leaves the account as it was rather than
signed out of its old email with no parent to reset it). Three account shapes
are refused outright by `isConvertible`: an app admin, an account that is
itself a parent, and one with a live paid subscription (which would go on
being charged for Pro a child account can never use), all `cannot_convert`.

**`accept_terms(p_version)` refuses while a parent request is open.** The
server remembers an open `parental_consent_requests` row for the caller even
when the browser doesn't (a fresh tab, cleared storage), and raises "Waiting
for a parent to approve this account" rather than letting a second, different
age answer reopen the account before the parent has decided. `TermsGate`
catches that specific message and jumps straight to `waiting`. A child account
itself can never call `accept_terms`; it raises "A parent accepts the terms
for a child account", because the parent's consent already covers it.

`TermsGate` steps aside on `/account` and `/billing` and everything nested
under them (`isTermsGateExemptPath`). Otherwise the "I don't agree" phase's
own links to those pages would be blocked by the dialog they're supposed to
be the way out of. "I don't agree" (Terms §12) leaves the account exactly as
it was, offering data export and deletion instead of a dead end.

## Restriction layers

A child account is refused paid AI, Pro, purchases, the calendar feed, MCP
access and email at multiple independent layers: server-side gates that hold
even if a client-side check is stale or skipped.

| Layer | Where | What it does |
| --- | --- | --- |
| Spend gate | `public.assert_spend_allowed` (migration) | `private.is_child_account` check before the freeze/velocity checks; both `reserve_credits` and `spend_credits` delegate to it, so paid AI is closed everywhere at once |
| Pro status | `public.is_user_pro` | `and not private.is_child_account(...)`, so a child never ranks as Pro whatever its `user_subscriptions.plan_id` says. This is what closes bring-your-own-key: BYOK/local mode requires Pro and never touches the server, so gating Pro itself is the only way to close that path |
| Generation edge functions | `_shared/accountGate.ts` `generationRefusal` / `isChildAccount` | Called by every `generate-*` function, `embed-content`, `embed-monsters`, `import-extract`, `import-match`, `style-map`, `tile-pack-generator`, `quest-designer-turn`, `forge-mini`, `generate-chronicle-*`. Fails **open** on a query error (a legitimate user must not be blocked by a DB blip) but the platform-credit path is independently, fail-closed refused by the spend gate, and BYOK by `is_user_pro`. The exceptions are the free embedding paths, which have no such check behind them: `embed-content` and `embed-monsters` return 503 on a lookup error, and `import-match` calls `generationRefusal(..., { failClosed: true })` |
| Stripe | `stripe-create-checkout`, `stripe-create-credit-checkout`, `stripe-create-portal` | `isChildAccount` check, fails **closed**: a checkout/portal request refused on a transient blip is just retried, but a child reaching Stripe is not acceptable |
| Calendar feed | `ical-feed` | `isChildAccount(supabase, campaign.user_id)`, since a link-shareable surface must not exist for a young DM's campaign; fails closed |
| MCP | `mcp/index.ts` | `isChildAccount` before serving any tool call, since an external AI client reading/editing a child's campaign is exactly what parental consent doesn't cover; fails closed |
| Email | `send-notification-email`'s `filterOutChildAccounts` | Drops active child accounts from every recipient list before addresses are resolved or RSVP tokens minted. Not strictly load-bearing against a bounce (the `.invalid` domain can never receive mail anyway), but made explicit on purpose: an unreachable domain being the only thing standing between a child and an email is not a property anyone asked for |
| Client presentation | `useChildAccount()` (`src/composables/account/useChildAccount.ts`) | Presentation only. Hides what a child account can't use (`AiTab.vue` shows a plain notice instead of the AI form when `isChild`; `isAiEnabled` etc. is irrelevant because there's nothing to toggle). A stale `false` here shows a control that then refuses server-side, never a feature that actually works |
| Router fence | `src/router/index.ts`, `CHILD_BLOCKED_ROUTE_NAMES` | Sends an active child away from `billing`, `family`, `family-add` (routes that manage *other* accounts or money) back to `/account`. Independent of the DM/player lens fence, since a child may be a DM or a player |

`isUnderAdultAge` / `is_child_account` both key on `adult_on`, so every one of
these gates stops applying automatically the moment the account turns 16,
before the daily sweep even runs (see Graduation).

## Parent controls

`/account/family` (`FamilyView.vue`) lists every child the signed-in account
parents, via `useFamily()` (`child_accounts` joined to `profiles` for the
display name). Each child renders as a `FamilyChildCard` with three actions:

- **Reset password**: `ResetChildPasswordDialog`, posts `{ action:
  "reset-password", childUserId, password }`; `handleResetPassword` checks the
  caller is the child's **active** parent before calling
  `auth.admin.updateUserById`.
- **Download their data**: `useDataExport().exportData(childUserId,
  loginName)`, which is the same composable an adult uses for their own
  export, given a `targetUserId`. `export-my-data` re-verifies the parent
  link itself (not merely trusting the client), and `export_user_data`'s SQL
  re-checks it a third time before it will read a row that isn't the caller's
  own. The DSR log records `identity_verification = 'parent_session'`, so the
  record shows a parent asked, not the child.
- **Delete account**: `DeleteChildAccountDialog`, which calls `delete-account`.
  **This is also how consent is withdrawn**: there is no separate "unlink"
  action. `delete-account` checks the `child_accounts` link before falling
  back to the admin gate, so a parent who is not also an app admin can still
  act on their own child; `prepare_user_erasure` re-verifies independently
  and logs `actor_kind = 'parent'`.

**A parent cannot delete their own account while they still actively parent a
child.** `delete-account` counts active `child_accounts` rows for the target
before any destructive work and returns `409 has_child_accounts`, checked
before the storage purge (which cannot be undone), because
`child_accounts.parent_user_id` is `on delete restrict` and letting the
constraint be what stops it would mean the purge had already run on an
account the auth delete then refuses to remove. The client message: "Remove
your child accounts first: a young player's account can't be left without its
parent."

## Who a young player plays with (#927)

A parent decides who is at their child's table. A join that involves a child
is a **request**, not a membership, until every parent it concerns says yes
(`20260929211745_parent_approved_tables`):

| Joiner | Campaign owner | Needs a yes from |
| --- | --- | --- |
| a child | an adult who isn't their parent | the joiner's parent |
| a child | their own parent | nobody (the parent chose it by running it) |
| a child | another family's child | both parents |
| a child | their sibling | their shared parent, once |
| an adult | a child | the DM's parent, unless the adult *is* that parent |

- `join_campaign_via_invite` returns `{status: 'joined' | 'pending', campaign_id, request_id?}`.
  A pending joiner has **no `campaign_members` row**, so every RLS policy keyed
  on membership keeps them out with no new condition anywhere.
- `campaign_join_requests` holds only pending requests. Approving the last
  side admits the joiner (`private.admit_campaign_member`, which also brings
  the character they chose) and deletes the row; declining deletes it. A capped
  invite counts the request as its use.
- A parent creating their child from a campaign invite
  (`join_campaign_for_child`, service role, with the verified parent id) has
  approved their own side already; only the other family's parent is asked.
- `decide_campaign_join_request` re-derives the parent link from
  `child_accounts` at call time (`private.parent_of_child`) instead of trusting
  the row, so a child who has come of age, or a parent link that is gone, no
  longer counts.
- `remove_from_family_campaign`: a parent can take their child out of any
  table, and anyone but the owner out of a table their child runs.
- `get_family_campaigns` is the Family page's one read: each child's tables
  and who is at them, and the requests waiting on the caller. A parent is not
  a member of those campaigns, so RLS alone would show them nothing.
- Emails: the joiner's page calls `notify-join-request`, and `child-account`
  does the same when a parent-created child waits on the other family. Both go
  through `_shared/joinRequestNotify.ts`: one email per parent still to answer
  (one, not two, when a parent is on both sides), fixed text with no campaign
  or player name in it (both are attacker-controlled; the names are shown in
  the app), sent once per request (`notified_at`), rate-limited per parent.
- Whispers (story 5, `20260929104117`): no whisper between a child and an
  adult who isn't their parent, enforced in the `campaign_messages` insert
  policy; immersive rolls, which reach the DM as a whisper, roll openly
  between them instead.

## Graduation

Nothing "happens" to a child account at 16 beyond two things, both driven by
`adult_on`:

1. **`private.is_child_account` stops counting the row** the moment
   `adult_on <= current_date`, so every restriction layer above lifts
   immediately, before any cleanup job runs.
2. **The daily sweep** (`private.sweep_child_accounts`, `pg_cron` job
   `sweep-child-accounts`, `17 3 * * *` UTC) deletes `parental_consent_requests`
   past `expires_at` and `child_accounts` rows past `adult_on`. Because (1)
   already stopped enforcing before the row is gone, the sweep's timing never
   widens anything; it only tidies. Once the link is gone the account is
   simply an ordinary one with a stale `terms_version` (it was never set for a
   child, since the parent's consent covered acceptance), so the Terms gate
   catches it on next visit and asks the now-16-year-old to accept the Terms
   themselves, together with the gate's age question, which they now answer as
   16 or older.

## Game content vs. real likenesses in AI

A DM's AI generation may draw on a child party member's character and notes.
That's game content, and the parental consent wording and privacy policy say
so explicitly (`AddChildView.vue`'s consent checkbox: "characters and notes
they write are game content: a Dungeon Master running AI features in a
campaign they play in may include them"). This is a policy decision, not a
separate code gate: the spend/Pro/generation gates above stop the **child's
own account** from reaching AI; they say nothing about a DM's account
including a child character's stats or journal text in a prompt, which is
allowed. A **real photo of a child**, by contrast, needs the parent's
permission. That boundary is drawn in the consent wording and the privacy
policy (§8), not enforced by a database check, because there is no reliable
server-side way to tell "a photo of this specific child" apart from any other
uploaded image.

## File map

| Concern | File |
| --- | --- |
| Schema, gates, `accept_terms`, `join_campaign_for_child`, daily sweep, parent export/erasure | `supabase/migrations/20260928053257_child_accounts.sql` |
| Shared pure rules (age math, login-name shape, reserved domain) | `supabase/functions/_shared/childAccount.ts` (also `@edge-shared/childAccount.ts` on the client) |
| Create/convert a child account, inspect a request, reset password | `supabase/functions/child-account/index.ts`, `validation.ts` |
| Send a parent the "add a young player" email | `supabase/functions/request-parental-consent/index.ts`, `email.ts`, `validation.ts` |
| Account-standing gate for every generator | `supabase/functions/_shared/accountGate.ts` |
| Stripe / calendar feed / MCP child refusals | `stripe-create-checkout`, `stripe-create-credit-checkout`, `stripe-create-portal`, `ical-feed`, `mcp/index.ts` |
| Parent export/delete of a child's account | `supabase/functions/delete-account/index.ts`, `export-my-data/index.ts` |
| Email recipient filter | `supabase/functions/send-notification-email/index.ts` (`filterOutChildAccounts`) |
| Family page, per-child actions | `src/views/FamilyView.vue`, `src/components/account/FamilyChildCard.vue`, `ResetChildPasswordDialog.vue`, `DeleteChildAccountDialog.vue`, `src/composables/account/useFamily.ts` |
| Add/approve a child | `src/views/AddChildView.vue` |
| Join requests, approvals, removal, the Family page's read | `supabase/migrations/20260929211745_parent_approved_tables.sql` |
| Parent emails for a pending join | `supabase/functions/notify-join-request/index.ts`, `_shared/joinRequestNotify.ts`, `_shared/joinRequestEmail.ts` |
| Whispers between a child and an adult | `supabase/migrations/20260929104117_whispers_respect_young_players.sql`, `src/composables/campaign/useWhisperRecipients.ts` |
| Whether the signed-in account is an active child (presentation only) | `src/composables/account/useChildAccount.ts` |
| Terms gate | `src/components/account/TermsGate.vue`, `termsGate.ts` |
| Age question, session memory | `src/components/auth/BirthMonthField.vue`, `src/lib/ageGateSession.ts` |
| Parent-request form (shared by signup, join, Terms gate) | `src/components/auth/ParentRequestForm.vue`, `parentRequestErrors.ts` |
| Age step in signup / campaign-join | `src/views/auth/SignupView.vue`, `src/views/auth/JoinCampaignView.vue` |
| Login-name sign-in | `src/views/auth/LoginView.vue`, `src/stores/auth.ts` (`signIn` calls `signInEmail`) |
| Router fence | `src/router/index.ts` (`CHILD_BLOCKED_ROUTE_NAMES`, `resolveIsChild`) |
| No AI controls for a child DM | `src/components/campaign/AiTab.vue` |
| Terms version, consent version | `_shared/consent.ts` (`TERMS_VERSION`, re-exported by `src/lib/legal.ts`; `accept_terms` accepts only `private.current_terms_version()`, which `consent.test.ts` holds equal to it), `_shared/childAccount.ts` (`PARENTAL_CONSENT_VERSION`) |

## Tests

- `supabase/tests/child_accounts.test.sql`: the predicate's totality, every
  gate (spend, `is_user_pro`), grants (`is_child_account` uncallable from the
  browser, `join_campaign_for_child` service-role-only and self-checking even
  with EXECUTE), parent export/erasure re-checks, `accept_terms` refusals, and
  RLS (parent sees their children, child sees only their own row, nobody can
  write from the browser, `parental_consent_requests` invisible to everyone
  including the child it concerns).
- `supabase/tests/parent_approved_tables.test.sql`: who must approve in every
  pairing (including the automatic and sibling cases), that a pending joiner
  holds no membership, one request per joiner and invite use, who can see a
  request, who can decide it, removal rules, the Family read, grants.
- `supabase/tests/whisper_young_players.test.sql`: the whisper rule as each
  sender, and the "To:" list.
- `src/router/guard.test.ts`: "the child-account fence (#919)". Sends a child
  away from billing and the family page, leaves a non-child alone, leaves a
  grown-up (`adult_on` passed) alone, doesn't fence routes the restriction
  doesn't cover.
- `src/composables/account/useFamily.test.ts`, `useAccountDeletion.test.ts`,
  `useDataExport.test.ts`: form validation (`childFormErrors`), error-code
  mapping, parent target-id plumbing.
- `src/components/account/termsGate.test.ts`: `shouldShowTermsGate`'s
  loading-race and exempt-path logic.
- `src/lib/ageGateSession.test.ts`: the under-16 session-memory flag.
- `supabase/functions/_shared/accountGate.test.ts`,
  `_shared/childAccount.test.ts`, `child-account/validation.test.ts`,
  `request-parental-consent/validation.test.ts`, `email.test.ts`: pure-logic
  and gate coverage on the edge-function side.

## Decisions not to undo

- **No "I am 16 or older" checkbox, ever.** The age question
  (`BirthMonthField`) is deliberately neutral: both fields start empty, and
  there is no way to blindly click past it. A checkbox is not neutral at all,
  it's an invitation to lie once.
- **Never store a birth date.** Only `adult_on` (a derived, rounded-up date)
  is kept, for the same reason a birth date is more than the gate needs and
  more than COPPA/GDPR ask for.
- **No client-writable policy on `child_accounts`, ever.** RLS with a select
  policy and no write policy is the lockdown, not an oversight to "complete."
  Every write goes through the service-role `child-account` edge function.
  Adding an insert/update/delete policy, even one scoped tightly to the
  parent, would let a compromised parent session, or a bug elsewhere, rewrite
  the one row that says who consented to what.
- **`parent_user_id` stays `on delete restrict`, not `cascade`.** Cascading
  would silently turn an under-16 into an unrestricted account the moment
  their parent's account is deleted. `delete-account` refuses a parent with
  active children up front instead, before touching anything destructive.
- **A child account can never itself be a parent**, and an account with a
  live paid subscription can never be converted into one, both enforced in
  `isConvertible`, not merely encouraged by the form.
- **No client-writable policy on `campaign_join_requests`, ever.** Same
  reasoning as `child_accounts`: the approvals on that row decide who is let
  in, so they are written only by the definer functions that check who is
  approving. A request is never made "approved" by an update from the browser.
- **A pending joiner gets no membership row.** Not a membership with a
  `pending` flag: every policy in the schema keys on `campaign_members`, and a
  flag would have to be remembered in all of them. The request table is where
  a pending joiner lives until the last yes.
- **A DM cannot write a member row.** `campaign_members_dm_all` (insert,
  update, delete) became update and delete only in `20260929211745`, and
  `guard_campaign_member_self_update` pins `user_id` and `campaign_id` for
  everyone, the DM included. Both are load-bearing for the approvals above: a
  DM inserting a row by hand, or re-pointing a player's row at another account,
  would seat anyone without an invite or a parent's yes. Every legitimate
  insert is a definer function; nothing in the client ever needed the policy.
