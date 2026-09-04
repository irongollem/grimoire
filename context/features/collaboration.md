# Multi-Player Collaboration System

## Overview

Grimoire is a full multi-user campaign platform. A single campaign supports one Dungeon Master and any number of players, each authenticated with their own account and presented a role-appropriate interface. The DM has full access to all campaign management tools; players get a dedicated player portal scoped to their own character and what the DM has shared with them. Access control is enforced at the database level via PostgreSQL Row-Level Security — the role boundary cannot be circumvented from the client.

## How It Works

The collaboration flow is:

1. A user creates a campaign. They are automatically recorded as the DM.
2. The DM opens Campaign Settings > Members & Invites and generates one or more invite links.
3. The DM shares a link (e.g. `https://dungeongrimoire.com/join/<uuid-token>`) with a player.
4. The player visits the link, creates an account or signs in, and is atomically added to the campaign as a player.
5. After joining, the player is redirected straight to the player portal (`/play`).
6. The DM assigns the player to a party member (character) from the Members tab.
7. From that point on, both DM and player see live-updated campaign data in their respective interfaces.

## Invite System

Invites are managed in `src/components/campaign/InvitesTab.vue`, backed by the `campaign_invites` table.

Each invite record has:

- `token` — a UUID used as the URL path segment; unguessable
- `label` — optional DM note (e.g. "For Alice") shown in the invite list
- `expires_at` — optional expiry timestamp; null means never expires
- `max_uses` — optional cap on how many times the link can be used; null means unlimited
- `use_count` — how many times the link has been consumed so far
- `role` — the role granted on join; currently always `'player'`

The DM UI lets them:

- Generate a new invite with label, expiry date/time, and max-uses cap (all optional)
- See all active invites with their use count and expiry status
- Copy the full invite URL to clipboard with a one-click button (shows "Copied!" feedback for 2 seconds)
- Revoke (delete) any invite immediately

Invite URLs take the form `<origin>/join/<token>` (constructed at runtime from `window.location.origin`).

The join operation itself is performed by the `join_campaign_via_invite(p_token, p_party_member_id default null)` PostgreSQL function (security definer). It validates the token (not expired, not over max uses), inserts the membership row, increments the use count, and returns the `campaign_id` — all atomically. If the calling user is already a member, it returns the `campaign_id` idempotently without error or duplicate membership. Since #730 it optionally binds a character from the joiner's pool: the character must be owned by the caller and unattached (or already attached to this campaign — idempotent re-joins), it is attached and linked as the joiner's active character without ever clobbering an existing link. `JoinCampaignView` shows a "Bring a character?" chooser when the authenticated joiner has unattached characters, auto-joins exactly as before when they have none, and sets `userMode = "player"` on success.

## Campaign Members

Members are managed in `src/components/campaign/MembersTab.vue`, backed by the `campaign_members` table.

Each membership row has:

- `campaign_id` / `user_id` — the join key (unique pair)
- `role` — `'dm'` or `'player'`
- `party_member_id` — FK to `party_members`; links the user account to their character
- `display_name` — the name shown in the member list; backfilled from `user_metadata.display_name` or email on first login if blank
- `joined_at` / `updated_at`

The Members tab shows every member with:

- An avatar initial, role badge, and online/offline presence indicator (green dot = currently connected)
- For players: a character assignment dropdown (only shows party members not already assigned to another player)
- A remove button for players (with a confirmation dialog). Players can rejoin via a new invite. The DM cannot be removed. Removal **detaches** the player's owned characters back to their personal pool automatically (an `AFTER DELETE` trigger on `campaign_members`, migration `20260814221409`) — nothing is deleted, and the dialog says so. In the "characters without a player" list, claimed characters (`owner_user_id` set) offer Detach only; genuine delete remains for unclaimed DM-managed rows, which is also all RLS still permits.

The DM membership is created automatically by the `create_dm_membership` trigger that fires `after insert on campaigns`. DMs never need to join their own campaign via invite.

## Role System

**The DM/Player mode lens (#729).** Above the per-campaign role sits a
persisted, user-level mode: `useUiStore().userMode` (`"dm" | "player" | ""`,
localStorage `grimoire:user-mode`). It is a *lens, never a grant* —
`campaign_members.role` remains the truth RLS and capability checks key off;
the mode only decides which home the user lands on (`/dashboard` vs
`/play/home`) and which of their campaigns are in view. The router guard
(`src/router/index.ts`) fences the `/play` area to player mode and everything
else to DM mode (DM preview and `?memberId=` management excepted), infers the
mode once from the loaded membership for accounts that predate it, and sends a
fresh account with no mode and no membership to `/welcome` — the first-run
"What are you?" choice (`WelcomeView.vue`), which also arms the skippable
driver.js tour (`src/lib/tours/`, `FirstRunTour.vue`). Each mode remembers its
own last-active campaign (`campaign.switchUserMode()`); switching goes through
`useModeSwitch()` alone, which swaps that memory, clears the stale membership,
invalidates the query cache and navigates. The toggle itself is the shared
`ModeToggle.vue`, rendered in both account menus. Campaign-scoped `/play`
routes additionally require a real membership; the `playerStandalone` routes
(pool, character create/edit, pickers) exist precisely for the
member-of-nothing player.

**Which campaigns a lens may see — and the bug that came of leaving it
implicit.** "Which of their campaigns are in view" was documented as a property
of the mode long before anything enforced it. `campaigns_member_select` lets a
member read the campaign row of every campaign they are in, so `select * from
campaigns` returns the ones the account DMs *and* the ones it merely plays in,
indistinguishable. The DM sidebar auto-selected `list[0]` from that mixture, so
a player who flipped to DM mode could land on the DM shell of somebody else's
game — and, once there, the id was written to the DM slot in localStorage and
came back on every boot. RLS held: `npcs`, `quests`, `locations`, `encounters`
and `monsters` are owner-only or player-visibility-gated, `campaigns` itself is
owner-only for writes, and the BYOK vault refuses a blob the caller does not own
(`callerOwnsBlob`), so the shell came up empty rather than leaking. What it cost
was trust, plus a free account reading as over its campaign quota for campaigns
it had only joined (`check_quota` counts owned rows).

The lens is now enforced in the query, not at each call site. Every campaign
list goes through `fetchCampaignsAs(role, archived)` in `useCampaigns.ts`, which
inner-joins `campaign_members` on the caller's own row and filters by role:

| Composable              | Lens   | Used by                                                     |
| ----------------------- | ------ | ----------------------------------------------------------- |
| `useDmCampaigns`        | DM     | sidebar switcher, scope fields, homebrew editors, transfer, danger zone, downgrade trigger |
| `useDmArchivedCampaigns`| DM     | the switcher's Archived section                              |
| `useAllDmCampaigns`     | DM     | the downgrade picker (archived included, matching the quota) |
| `usePlayerCampaigns`    | Player | `PlayerHomeView`, the player shell's campaign sheet, post-join hydration |

`campaign_members.role` is the scope because it is the column
`private.is_campaign_dm()` reads, so the list cannot disagree with what RLS will
permit. Exactly one `dm` row exists per campaign and it is always the owner
(`create_dm_membership` on insert, flipped atomically by
`transfer_campaign_ownership`), so "campaigns I DM" and `campaigns.user_id = me`
are the same set — the membership join is used because it scopes both lenses
with one shape.

Two entry points sit outside the lists and are guarded separately.
`switchUserMode()` takes `campaignsInTargetLens` and drops a remembered id the
target lens does not hold, so a DM slot poisoned by an earlier build is
discarded rather than restored; `useModeSwitch` resolves that set from
`campaign_members` before the swap. And `App.vue` clears `activeCampaignId` when
the membership loaded for it contradicts the mode — the boot path, for
localStorage written before this was enforced. It acts only on a membership that
is genuinely for the active campaign and genuinely disagrees: a null membership,
a row for another campaign, or a mode not yet chosen all mean "don't know", and
not knowing is never grounds to clear.

Creating a campaign from the player shell is a lens change and goes through
`switchMode("dm")` — pushing at `/dashboard` with the mode ref still on
`"player"` only got the router guard to bounce it back to `/play/home` with a DM
campaign active under the player lens.

There are two roles:

**DM (`role = 'dm'`)**

- Full read/write access to all campaign data: notes, NPCs, monsters, encounters, party members, settings, calendar events, factions, locations, quests, scriptorium documents.
- Manages the member list and invite links.
- Can preview the full player portal in DM Preview Mode (`ui.dmPreviewMode` flag) to see what players see.
- Can navigate to any player's character sheet via a `?memberId=<id>` query parameter on player-portal routes.
- Blocked from player portal routes under normal circumstances (redirected to `/dashboard`).

**Player (`role = 'player'`)**

- Blocked from all DM routes — the router guard redirects any non-player-portal navigation to `/play`.
- Sees only the player portal: their character sheet, inventory, party view, quests, journal, notes, encounter view, factions, atlas, rules reliquary, crafting, and puzzle rooms.
- Data visible to players is either:
  - Their own record (own party member, own journal entries), or
  - DM-shared data (quests, locations, factions, etc.) scoped to the campaign they belong to.

The auth store exposes `isDM` and `isPlayer` computed properties derived from `membership.role`. These drive both the router guard and component-level conditional rendering.

`linkedPartyMemberId` in the auth store gives players direct access to their party member FK from anywhere in the app without an extra DB query.

## Campaign Settings

The Campaign Settings view (`/campaign/settings`, `src/views/campaign/CampaignSettingsView.vue`) is DM-only. It has a sidebar tab navigation (stacked on desktop, horizontal scroll on mobile) with these tabs:

| Tab                   | What it controls                                                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Details**           | Campaign name, world/setting, calendar system, current in-world year, visual theme, health visibility mode, immersive rolls toggle, multiclass prereq rule, and a one-click "Populate from Setting" action that seeds locations/NPCs/factions from the chosen canonical setting |
| **Members & Invites** | Member list (character assignment, presence indicator, remove player) + Invite Links sub-section (generate/copy/revoke) — both rendered on the same tab                                                                                                                         |
| **Scheduling**        | Session scheduling and availability tooling                                                                                                                                                                                                                                     |
| **Rules**             | Toggle optional D&D rules on/off; enabled rules are visible to players in the Rules Reliquary                                                                                                                                                                                   |
| **Classes**           | Campaign-specific custom class/archetype settings                                                                                                                                                                                                                               |
| **AI Assistant**      | AI-related campaign configuration                                                                                                                                                                                                                                               |
| **Spotify**           | Spotify integration for ambient music                                                                                                                                                                                                                                           |
| **Danger Zone**       | Transfer ownership to another member, and delete campaign (both require typing the campaign name to confirm; delete cascades to remove memberships and invites but does not delete notes/NPCs/etc.)                                                                             |

## Campaign Ownership Transfer

A DM can hand a campaign to any other member from **Settings → Danger Zone**
(`src/components/campaign/TransferOwnershipPanel.vue`). They pick the new DM from the
member list, optionally tick *"Leave the campaign as well"*, and type the campaign name
to confirm — the same gate the delete flow uses, shared via
`src/components/common/ConfirmByNameInput.vue`. If any monsters or traps are scoped
exclusively to the campaign, a radio group makes them choose what happens to their
originals: keep globally, move to another campaign they own (a picker appears; the
option is hidden when they own no other campaign), or delete. The choice is typed as
`TransferScopedDisposition` (`src/lib/campaign/campaignHomebrewDisposition.ts`), kept separate
from the deletion dialog's two-value `HomebrewDisposition` so `'reassign'` cannot leak
into a flow that has no target campaign to offer.

**Why this is an RPC and not an `update campaigns set user_id`.** `campaigns.user_id` is
only half of what ownership means here. Roughly forty campaign-scoped tables gate their
RLS on `auth.uid() = user_id` rather than on `private.is_campaign_dm(campaign_id)` —
notes, npcs, quests, locations, items, encounters, sounds, homebrew. Swapping the owner
column alone hands over an empty shell: the new DM passes `is_campaign_dm()` but cannot
read a single note, while the old DM keeps full read/write on all of it. So
`transfer_campaign_ownership(p_campaign_id, p_new_owner_id, p_leave_campaign,
p_scoped_copy_disposition, p_reassign_campaign_id)` (`supabase/migrations/20260731000001_transfer_campaign_ownership.sql`,
extended by `20260812000001_transfer_campaign_scoped_monsters_traps.sql` and
`20260814003041_transfer_quest_referenced_monsters_and_reassign.sql`) does the whole
thing in one `SECURITY DEFINER` transaction — a half-applied transfer would lock both
DMs out of the same campaign at once.

What the RPC does, in order:

1. **Authorizes.** Re-derives identity from `auth.uid()`; only the current owner may
   transfer, never to themselves, and **the recipient must already be a member** — that
   membership is the consent step, so a campaign cannot be pushed onto a stranger's
   account id.
2. **Clones the personal-library rows the campaign hydrates from.** `backgrounds` and
   `scriptorium_documents` have no `campaign_id`, and `monsters`/`traps` had none when
   this function was written — they are cross-campaign personal libraries — but the
   encounter runner resolves `combatants[].monster_id` against `monsters`, character
   sheets resolve `background_id`, and so on. They are copied under fresh ids into the
   new owner's library (never moved: the outgoing DM's *other* campaigns may use the
   same rows).

   `monsters` and `traps` gained a `campaign_id` in `20260809000003`. Since #630, rows
   scoped to the transferred campaign are copied even when no campaign content references
   them yet; the clone keeps that campaign scope. Before confirming, the outgoing DM must
   choose whether their originals become global (`campaign_id = null`), move to another
   campaign they still own (`'reassign'` + `p_reassign_campaign_id`, validated as
   caller-owned and distinct from the campaign being handed over), or are deleted.
   Referenced global rows are still copied for the recipient and remain global for their
   author. The disposition is part of the transfer RPC, so clone, transfer and cleanup are
   atomic. What counts as "referenced" is defined once, in
   `private.campaign_referenced_monster_ids()` / `_trap_ids()` — the base function's
   clone set and the wrapper's don't-copy-twice exclusion set call the same helpers,
   because their previous inline copies of that union had already drifted.

   Since #733 the same clone-and-repoint applies to the outgoing DM's **global** items,
   NPCs, factions and locations that quest content references (campaign-scoped rows of
   these kinds simply move in step 4, ids intact, so they need nothing). NPC clones pull
   their `linked_monster_id` stat block and `scriptorium_doc_id` handout into the
   monster/doc clone sets so the copy resolves; location clones include `location_set`
   `room_ids`, get `parent_location_id` remapped clone-to-clone and `source_map_id`
   nulled (the Cartographer deep-link rule); faction clones are shallow — `faction_*`
   junction rows are campaign relations and stay put. No disposition question is asked
   for any of these: originals are global, stay with their author, and lose nothing. Separately, `delete_campaign_with_homebrew` once disposed of left-behind rows
   with an owner-less `where campaign_id = …`; `20260809000004` confines each
   disposition to the caller's own rows and promotes anyone else's to global rather than
   deleting them.
3. **Repoints every reference at the clones**, including the jsonb ones. Monster ids nest
   at three different depths (`encounters.combatants`, `encounters.events[].actions[].spawns[]`,
   `party_members.wildshape_state`), so those are substituted inside the serialized
   document — a v4 uuid is globally unique, so a match anywhere in the document *is* that
   reference. Note that these fields also hold shared SRD keys like `srd_dire_wolf`; only
   well-formed uuids are candidates, or the cast raises `invalid input syntax for type uuid`.

   Quest references (`quest_refs` and `quest_beat_attachments`, for monsters since
   `20260814003041` and for items/NPCs/factions/location sets/handouts since #733) are
   both in the clone-reachability unions and repointed too — but as a final step *after*
   the campaign-row flip, `quest_refs` before the attachments. Both constraints are
   load-bearing: the beat-attachment update fires `validate_quest_beat_attachment`,
   whose global-row arms accept a recipient-owned clone only via the campaign's
   *current* owner (the `'monster'` arm was patched in `20260814003041`, the remaining
   arms with #733), and it also fires the `sync_quest_ref_from_beat_attachment` mirror
   trigger, whose insert must land as an `ON CONFLICT` no-op against an
   already-repointed `quest_refs` row.
4. **Moves the campaign's content** — `user_id` is re-stamped on every campaign-scoped
   table plus the FK children that carry a `user_id` but no `campaign_id` (`faction_*`,
   `quest_triggers`, `store_items`). Every update is filtered on
   `user_id = <outgoing DM>`, which is what leaves players' own rows alone.
5. **Swaps the roles.** Order matters: `campaign_members_guard_self_update` waves a row
   through only while `is_campaign_dm()` holds for `auth.uid()`, so the new owner is
   promoted *before* the outgoing DM is demoted — the reverse order makes the trigger
   reject the promotion as an illegal self role change. The new DM's `party_member_id` is
   cleared, or their character would read as "taken" in the member list forever.
6. **Updates the campaign row** — new `user_id`, and the three `*_api_key` columns are
   nulled (four until `20260809145858` dropped `falai_api_key`). `spotify_client_id`
   travels with the campaign (it is a public OAuth client id).

What deliberately does **not** move: credit-spend records (`ai_generation_jobs`,
`image_generation_jobs`), chat authorship (`campaign_messages`), personal annotations
(`entity_notes`, including private ones), purchased minis, and per-user personal state
(`player_*`, `session_availability`). `locations.source_map_id` and
`puzzle_rooms.dungeon_feature_id` are nulled rather than cloned — they are deep-links
into the outgoing DM's Cartographer workspace, a multi-row graph of its own, and a link
the new owner cannot open is worse than no link.

`monsters` and `scriptorium_documents` carry `BEFORE INSERT` quota triggers, and
`check_quota()` counts `where user_id = auth.uid()` — the *caller's* rows. Left alone, an
outgoing DM sitting at their free-plan monster cap could not hand their campaign over at
all. `enforce_quota()` therefore honours a transaction-local `grimoire.bypass_quota` flag
that only this function sets; quotas gate creation, and a transfer creates nothing new.
The flag is not reachable from a client (PostgREST exposes only `public`, and
`set_config` lives in `pg_catalog`).

Client side, `useTransferCampaignOwnership` invalidates the entire query cache — the
caller just gave away read access to nearly every row they had cached — then the panel
refreshes `auth.membership` before navigating, since the router guard reads the role that
just changed underneath it. Staying on as a player lands on `/play`; leaving switches to
another campaign (or clears the active one) and lands on `/dashboard`.

**Co-DM is not supported**, and that is a scope decision rather than an oversight: making
a second `role = 'dm'` actually see anything means adding `OR private.is_campaign_dm(campaign_id)`
to roughly 160 policies across those ~40 owner-gated tables. Transfer sidesteps that
entirely by re-stamping ownership instead. See #180.

## Join Flow (Player Experience)

When a player visits an invite URL (`/join/<token>`):

1. If not authenticated, they see a sign-up/sign-in toggle form.
   - Sign-up requires username, email, and password (min 8 chars). After sign-up, Supabase sends an email confirmation; the UI displays "Check your email to confirm, then sign in to join."
   - Sign-in requires email and password only.
2. Once authenticated (either by signing in, or if they were already logged in when they opened the link), `joinCampaignViaInvite(token)` is called automatically via a `watch` on `auth.isAuthenticated`.
3. A loading spinner is shown while the join RPC executes.
4. On success: `auth.refreshMembership(campaignId)` updates the auth store's membership state, the campaign is set as active, and the router navigates to `/play`.
5. On failure (invalid/expired token): an error message is shown with a link back to the dashboard.

The `/join/:token` route has no `requiresAuth` guard — it is accessible before login so the auth flow and join flow can happen on the same page without intermediate redirects.

## Live Sync

Real-time updates are handled by two complementary systems, both implemented as singleton composables with reference counting (safe to call from multiple layouts simultaneously).

**`useCampaignLiveSync`** (`src/composables/campaign/useCampaignLiveSync.ts`)
Subscribes to Supabase `postgres_changes` for these tables (filtered by `campaign_id`):

- `notes`, `quests`, `locations`, `factions`, `puzzle_rooms`, `calendar_events`, `player_journal`

Any insert/update/delete on these tables triggers a TanStack Query cache invalidation for the matching query key. Both the DM's `DefaultLayout` and the player's `PlayerLayout` mount this composable, so both sides see updates instantly without polling.

**DELETE payloads carry only the primary key — never build on anything else.** Two Supabase constraints combine here, and both are easy to forget because a handler that violates them fails silently rather than erroring:

1. RLS is enabled on every synced table, and *"when RLS is enabled and `replica identity` is set to `full` on a table, the `old` record contains only the primary key(s)"*. Raising `REPLICA IDENTITY` to `FULL` does **not** buy back the other columns — it only inflates the WAL. Migration `20260730000005` reverted all 25 tables that had tried this.
2. *"Delete events are not filterable."* A `filter: campaign_id=eq.X` is honoured for INSERT/UPDATE but ignored for DELETE, so **every** subscriber receives **every** delete on that table, app-wide.

So a delete handler gets one id, possibly for a row in another campaign. Match on the primary key — which is inherently safe, since a foreign id simply isn't in the local cache — and if the handler needs to know anything else about the deleted row (who it belonged to, what it pointed at), it must either re-read authoritatively or invalidate broadly. `applyRealtimeRow` (`src/lib/campaignLiveSync/realtimeCache.ts`) already does this correctly: it keys on `change.old.id` and only consults `matches()` for non-deletes. Three hand-written handlers did not, and had never worked (#580).

**Realtime is the primary read path.** HTTP reads are deliberately confined to three cases: initial load, genuine gap recovery, and the query shapes explicitly derived for it. Anything else re-fetching over HTTP is a bug — it means a subscription that should have carried the change is either missing or not trusted, and adding a poll on top hides that rather than fixing it.

A table must also actually be in the `supabase_realtime` publication for any of this to fire; subscribing to an unpublished table is silent. Verify with `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`.

**`useCampaignPresence`** (`src/composables/campaign/useCampaignPresence.ts`)
Uses Supabase Realtime Presence to track who is currently online. Each connected client broadcasts `{ user_id, display_name, online_at }`. The `MembersTab` uses `isOnline(userId)` to show a green/grey dot next to each member. This is the same channel referenced by the campaign chat system.

## Key Capabilities

- **True multi-user**: not just "share a link to a Google Doc" — each player has a real account with their own authenticated session and their own character data.
- **Role-gated interface**: players never see DM notes, encounter configs, monster stat blocks, or unpublished scriptorium documents. DMs never accidentally land on the player portal.
- **Invite flexibility**: DMs can create multiple links (one per player, one for a group), set expiry dates for one-off sessions, or cap uses to a single join. Revoke at any time.
- **Character linking**: each player account is linked to exactly one party member. The DM controls the assignment from the Settings UI; the player cannot claim a different character.
- **Live encounter participation**: players see the encounter as it runs in real time via the `PlayerEncounterView` — same data, role-appropriate view.
- **Presence awareness**: the DM can see at a glance which players are currently connected.
- **DM preview mode**: the DM can browse the full player portal to verify what players see, without creating a second account.

## Security Model

All access control is enforced via PostgreSQL Row-Level Security — the client cannot bypass it by crafting custom queries.

**`campaign_members` policies:**

- `campaign_members_dm_all` — DMs (verified by `is_campaign_dm(campaign_id)`) have full `ALL` access to the member list for their campaign.
- `campaign_members_select` — any authenticated user who is a member of the campaign can read the full member list (needed so players can see their party).
- `campaign_members_update_own` — members can update their own record (e.g. display name, party member assignment from the player side).

**`campaign_invites` policies:**

- `campaign_invites_dm_all` — only the campaign DM can create, update, or delete invites.
- `campaign_invites_read_by_token` — any authenticated user can read invite rows (needed to validate a token during the join flow before a membership exists).

**`join_campaign_via_invite` function:**

- Declared `security definer`, runs with elevated privileges to atomically validate the token and insert the membership. The caller gets no direct write access to `campaign_members` — they can only go through this function.

**Campaign data tables:**

- Notes, NPCs, monsters, encounters, etc. use `private.is_campaign_member(campaign_id)` or `private.is_campaign_dm(campaign_id)` in their RLS policies. Players can read data that is scoped to their campaign; only DMs can write most of it.
- Specific player-writable tables (party member HP, conditions, inventory, journal) have additional policies permitting writes from the linked player.

### Writing campaign content requires DM rights on that campaign

Read scoping and *write* scoping are separate questions, and until `20260828201935`
only the first was actually enforced. 51 policies across 27 tables gated their
`with check` on nothing but `(select auth.uid()) = user_id` — row ownership was the
whole test and `campaign_id` was never consulted — so any authenticated user could
write a row stamped with their own id and **someone else's campaign_id**.

That was reachable, not theoretical. `ImportBundleModal.vue` is mounted at
`App.vue:12` with no role check and opens from the OS `.grimoire` file handler
anywhere in the app, including `/play/*`; `useWorldBundle.executeImport()` then
batch-inserts into `locations`, `npcs`, `npc_relationships`, `monsters` and `items`
at `campaign_id = activeCampaignId` — for a player, the DM's campaign. And the
injected rows were visible to others, because `npcs_player_select` keys on
`player_visible_to` and `calendar_events_player_select` on
`player_visible`/`event_type = 'session'` — all columns the inserting user controls.

Every affected policy now carries:

```sql
and (campaign_id is null or private.is_campaign_dm(campaign_id))
```

One uniform predicate, including the `is null` arm on the seven tables where the
column is `NOT NULL`, so there is a single shape to review rather than a per-table
judgement. That arm is load-bearing rather than defensive: the personal library is
exactly the `campaign_id is null` case, so a player may still fork an SRD class from
`/codex` (`ClassList.vue` "Duplicate", `ArchetypeList.vue` "Load example" — both pass
`campaign_id: null`) into their own library; they simply cannot staple it to a
campaign they do not run.

**The bundle importer deliberately keeps no UI role check.** A World Bundle is a
*distribution* format — you export a campaign, sell it, and a buyer imports it — so
a user with no membership yet must be able to import one to create a new campaign.
RLS draws that line with the right granularity: a campaign you own is allowed,
someone else's is denied. Gating the modal on `auth.isDM` would break the buyer.

Regression cover: `supabase/tests/campaign_content_write_boundary.test.sql`, whose
final assertion is structural — every write policy on those 27 tables must consult
`campaign_id`, so a future migration that recreates one without the gate fails there
and names the offending policy.

**Helper functions:**

- `private.is_campaign_member(cid uuid)` — returns true if `auth.uid()` has any row in `campaign_members` for that campaign.
- `private.is_campaign_dm(cid uuid)` — returns true if `auth.uid()` has a `dm` row for that campaign.
- Both are `security definer` with `stable` volatility and an explicit `search_path`, preventing privilege escalation or search-path injection. They live in `private` rather than `public` so PostgREST cannot publish them as RPC endpoints — see the `SECURITY DEFINER` rules in CLAUDE.md.
