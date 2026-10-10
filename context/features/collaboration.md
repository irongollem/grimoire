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

Since #919 the token-validation-and-membership-insert half is lifted into `private.consume_campaign_invite(p_token, p_user_id)`, which `join_campaign_via_invite` calls with `auth.uid()`. That split exists for a second caller: a young player under 16 never lands on `/join/<token>` themselves (see [young-players.md](young-players.md)). A parent creating or approving their account instead passes the invite token through, and the service-role-only `join_campaign_for_child(p_token, p_child_user_id)` calls the same private helper with the child's id, after verifying the caller is `service_role` and the target is an active child account. Both paths therefore validate the token and insert the membership through one shared implementation.

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

**The lens fence (#847).** Choosing a hat is the paragraph above; the fence is
the other half — *once a hat is chosen, the active campaign must be one where
that role actually holds*. It lives in `src/router/lens.ts` and runs in the
route guard, after the mode redirects have settled:

| Piece                            | What it is                                                                 |
| -------------------------------- | -------------------------------------------------------------------------- |
| `routeLens(to)`                  | which lens a route's campaign belongs to, or `null` for routes holding none |
| `lensContradicts(lens, role)`    | the rule, in one place — also what `App.vue`'s watcher now expresses         |
| `knownRoleInCampaign(id)`        | the role already loaded, no request                                          |
| `resolveRoleInCampaign(qc, id)`  | that, else one cached `campaign_members` select; `{ fresh: true }` skips both |
| `lensRefusal`                    | why the last campaign was closed, rendered by `CampaignLensNotice`           |

Four decisions in it are worth not undoing:

- **The lens set is derived, not opted into.** A `meta.requiresCampaignLens`
  flag on ~110 DM routes fails open for the 111th. `routeLens` classifies
  instead, and `router/lens.test.ts` pins the *whole* set of unfenced routes
  (the auth shell, the unauthenticated harnesses, the 404, `/admin`) — so a
  campaign surface that slips out of the fence fails the suite rather than
  going quiet.
- **An unresolved role is never grounds to act**, which is deliberately the
  opposite of `switchUserMode`'s fail-closed on the same unknown (#845). There,
  refusing an unverifiable campaign costs one click on an explicit user action;
  here it would cost a DM their live campaign for one dropped request, on every
  navigation, mid-session at the table.
- **A contradiction is re-confirmed against the server before anything closes.**
  A cached role is enough to say "carry on" and is not evidence enough to act
  on: once co-DM ships (#590), the account whose cached role still reads
  `player` is precisely the one just promoted.
- **It is written over the lens, not for the DM alone.** The rule is symmetric,
  and the DM-only spelling is the hole #590 would walk into.

It is defence in depth and not the boundary. RLS is the boundary and it holds —
measured as a player, `private.is_campaign_dm()` answers false, every DM read
returns zero rows, self-promotion is refused by
`guard_campaign_member_self_update` and `start_campaign_session` raises, all
pinned by `supabase/tests/player_is_not_a_dm.test.sql`. But each of those zeroes
is RLS working alone, and this repo has shipped all three shapes that take that
away: an RPC that forgot its guard (`grab_item_drop`), a view that lost
`security_invoker` (`ai_generation_costs`), a predicate that returned NULL
(`get_user_ledger`).

Closing a campaign silently would repeat the failure #845 was reported as, so
`CampaignLensNotice` (mounted on `DashboardView` and `PlayerHomeView`) says
which hat the campaign belongs to and offers the one click that opens it again.
It clears on unmount, which makes it explain the navigation that just happened
rather than follow the user around.

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
| **Species** | Which species the party-member race picker offers; campaign-only species are always on |
| **AI Assistant**      | AI-related campaign configuration                                                                                                                                                                                                                                               |
| **AI Connections** | Connect the DM's own AI assistant to Grimoire over MCP (`AiConnectionTab`) |
| **Spotify**           | Spotify integration for ambient music                                                                                                                                                                                                                                           |
| **Backup** | Two exports (`BackupTab`). **Export Campaign** writes the restorable `.grimoire-backup` JSON (`useCampaignBackup.ts`; restore lives in the campaign switcher). **Export as Markdown** (#932, story 2) writes an Obsidian vault zip: one `.md` per party member, NPC, location, faction, quest and note, with YAML frontmatter, and @mentions and parents as path-qualified `[[Folder/Name\|Name]]` wikilinks. Names are unique only within a folder, so a bare `[[Name]]` would be ambiguous. Rows → files is pure in `src/lib/campaignExport/markdownVault.ts`; fetch and zip (fflate) are in `useCampaignMarkdownExport.ts`. It is read-only by design and nothing imports it back. Restoring a `.grimoire-backup` also rewrites @mention ids inside every rich-text column to the restored rows, and drops the stored names older backups carry (`remapMentionIds`, `src/lib/campaign/mentionRemap.ts`) |
| **World Bundle** | Package selected campaign content and library entries as a portable `.grimoire` bundle, or embed one in a Scriptorium PDF |
| **Import Document** | The document importer (see [document-import.md](document-import.md)) |
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
   monster/doc clone sets so the copy resolves; location clones follow a beat's
   `staged_at_location_id` **and everything beneath it** (#797 — the previous
   `metadata.room_ids` array only cloned rooms the DM had remembered to list, so a
   dungeon could arrive at its new owner missing rooms), get `parent_id` remapped
   clone-to-clone and `source_map_id` nulled (the Cartographer deep-link rule); faction clones are shallow — `faction_*`
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
   - Sign-up opens on an age question first (#919). 16 or older continues to the ordinary form: username, email, and password (min 8 chars); after sign-up, Supabase sends an email confirmation and the UI tells them to check their email, promising the confirmation link brings them straight back here to join. Under 16 swaps to `ParentRequestForm` instead, which emails a parent a link to approve the account; the invite token rides along so the parent's approval joins the child to this campaign in the same step. See [young-players.md](young-players.md).
   - Sign-in takes an email or a child's login name: `useAuthStore.signIn` maps a login name to the reserved internal address before authenticating.
2. Once authenticated (either by signing in, or if they were already logged in when they opened the link), `joinCampaignViaInvite(token)` is called automatically via a `watch` on `auth.isAuthenticated`.
3. A loading spinner is shown while the join RPC executes.
4. On success: `auth.refreshMembership(campaignId)` updates the auth store's membership state, the campaign is set as active, and the router navigates to `/play`.
5. On failure (invalid/expired token): an error message is shown with a link back to the dashboard.

The `/join/:token` route has no `requiresAuth` guard — it is accessible before login so the auth flow and join flow can happen on the same page without intermediate redirects.

## Live Sync

Real-time updates are handled by two complementary systems, both implemented as singleton composables with reference counting (safe to call from multiple layouts simultaneously).

**`useCampaignLiveSync`** (`src/composables/campaign/useCampaignLiveSync.ts`)
Listens to the **campaign doorbell**: one private Realtime Broadcast topic per campaign, `doorbell:<campaign id>`. Both the DM's `DefaultLayout` and the player's `PlayerLayout` mount it.

**How a change reaches a screen** (#999 4.2, `20261009233206`). Every live table has statement-level ring triggers on insert, update and delete. They work out which campaigns a change belongs to (`signal_campaign_change` for rows that carry `campaign_id`, `signal_parent_change(parent_table, fk_column[, signal])` for rows that hang off a character, place, quest, faction, recipe or playlist, `signal_handout_change`, `signal_party_member_left_campaign`, and `private.signal_campaign_row_change` for the campaign row itself) and call `private.ring_campaigns(campaign_ids, signal)`. That function stays quiet during a campaign copy and queues the pairs in `private.campaign_sync_pending`, once per transaction. At commit a deferred constraint trigger, `private.send_campaign_rings()`, drains the queue and sends one Broadcast message per (campaign, signal) with `realtime.send`: event `ring`, payload `{ table }`. It is the only sender, which `live_sync_registry.test.sql` holds. Sending at commit is inherited from the doorbell table it replaced, where ringing mid-transaction deadlocked two writers to one campaign.

A ring names what changed and never carries a row (the "thin event", or notify-then-fetch, pattern). Every tab hears every ring, including the one whose write caused it, and invalidates every query root `SIGNAL_KEYS` maps the signal to (`src/lib/campaignLiveSync/registry.ts`). So every client re-reads through its own RLS, embeds and redacted projections, which a signal cannot get subtly wrong the way a hand-applied row can. State kept outside TanStack Query (the chat list, the encounter runner and the player's encounter, the audio stream, the removal guard) hears the same rings through `onCampaignRing` / `onCampaignReconcile` (`src/lib/campaignLiveSync/rings.ts`) rather than opening a channel of its own.

**Only members can hear a topic.** Joining a private channel is authorized by RLS on `realtime.messages`: `realtime_messages_select` admits `authenticated` callers for whom `private.can_hear_realtime_topic(realtime.topic())` is true, which is a member of the campaign the topic names and false for anything else (never NULL). There is no insert policy, so no client can ring a campaign. `supabase/tests/realtime_doorbell.test.sql` proves it as a player, the DM, a DM of another campaign and anon. Realtime checks the policy at join, so a player removed mid-session still hears the `campaign_members` ring on the open channel; `usePlayerRemovalGuard` re-reads its own membership on it, and the next join is refused.

**Why not `postgres_changes`.** It was the other half of this system until 9 Oct 2026, and it is gone on purpose. Realtime serves `postgres_changes` by polling the database's replication slot (`realtime.list_changes`) about once a second, decoding the whole write-ahead log and checking every change against every subscriber's RLS, whatever changed. The re-baseline that day found that loop at 91% of all database execution time, against about a thousand writes to live tables in two days. Broadcast is read by a streaming replication connection with no polling, and Supabase recommends it for scalability and security. Nothing is in the `supabase_realtime` publication any more, and a single `postgres_changes` subscription anywhere would restart the loop. The doorbell itself started out as a table, `campaign_sync` (`20260904230420`), because a campaign-filtered `postgres_changes` subscription never receives a DELETE: under RLS the old record holds only the primary key, so the `campaign_id` filter cannot match it. Every delete handler written against it had been unreachable code.

Which tables ring, and why each route looks the way it does. The history is the reasoning, so it stays, read with one change in mind: since #999 4.2 every table below rings on insert, update and delete, whatever it rang before; the `PLAYER_ONLY_SIGNALS` gate and the exact-row channels (`usePartyLive`, the reducers) are gone, replaced by refetching on every ring; and "published" or "subscribed" describes the route a table had then.

- **`store_items` for every event.** That table has no `campaign_id`, only `location_id`, so it could not join the campaign-filtered channel for inserts or updates either, and was absent from the registry entirely (#811). Its three triggers derive the campaign through `locations`.
- **Every write to a table whose rows must not travel** (`20260928225909`). The quest runtime (`quest_runtime_state`, `quest_threads`, `quest_beat_transitions`) is DM-only history that `20260810000012` keeps out of the publication on purpose, and `campaign_sessions` (the session log, `20261006072708`) is a table players may not read though they may know it changed: its doorbell maps to `player-session-state` and `player-sessions`. Each rings on insert, update and delete; the client maps the three runtime tables to every runtime cache, because one transition writes all of them. These replaced four 5-second polls and a 60-second one.
- **A named signal for a table only some members may read** (`20260928233302`). Players cannot select `npcs` rows at all, only the `get_player_visible_npcs` projection, so their `npcs` subscription carries nothing. `npcs` therefore rings `npcs_player` on insert and update: `signal_campaign_change()` takes the signal name as an optional trigger argument (`tg_argv[0]`, defaulting to the table name). The client maps `npcs_player` to `PLAYER_NPCS_KEY` only, the projection's own query root, so the DM, who already received the row event, refetches nothing of theirs. A delete still rings as `npcs`. The registry test keeps these in a third list, `live_sync_named_signal`.
- **Notes and factions for players** (`20261007092700`, #932). The `npcs_player` move again: players lose their select policies on `notes` and `factions` (a raw row would carry secret blocks) and read `get_player_visible_notes` / `get_player_visible_factions`. Both tables ring `notes_player` / `factions_player` on insert and update (delete still rings the table name); the client maps them to `PLAYER_NOTES_KEY` / `PLAYER_FACTIONS_KEY`. They are not in `PLAYER_ONLY_SIGNALS`: the DM holds only preview caches under those roots, which the DM's own row events also invalidate. `applyNotes` splices rows into `["notes", id]` for the DM only.
- **Places and quests for players** (`20261005015440`). The same move for four more tables players read only through projections or owner-only policies: `locations` and `quests` ring `locations_player` / `quests_player` on insert and update (their deletes still ring the table name), and `quest_beats` and `quest_objectives`, which are not published at all, ring `quest_beats_player` / `quest_objectives_player` on every write. `quest_objectives` has no `campaign_id`, so it rings through the parent quest (now `signal_parent_change('quests', 'quest_id', 'quest_objectives_player')`). These roots (`locations`, `quests`, `quest_beats`, `quest_objectives`) also hold the DM's own caches, so `PLAYER_ONLY_SIGNALS` makes a DM client ignore them rather than refetch its editors on every autosave. A runtime move refreshes the player's beats too, through `QUEST_RUNTIME_SYNC_KEYS`, because a beat is revealed by a visit in the transition log, not by an edit to its row. Before this, all four reached an open player screen only on reload (audit, 5 Oct 2026).
- **A character's sheet** (`20261008225105`, #1026). `character_classes` and `character_spells` have no `campaign_id` (they hang off `party_members`), and spells are readable only by the character's owner and the campaign's DM, so neither is published: both ring on every write through the character (now `signal_parent_change('party_members', 'party_member_id')`). `ruleset_reviews` moved onto the same function, retiring its own copy. A DM's level, subclass or terrain edit, and the spells `private.sync_subclass_spells` regrants server-side, now reach the player's open sheet, and the reverse. `party_members` keeps its exact-row channel (`usePartyLive`) and rings only for what that channel cannot carry: a delete, and a character leaving the campaign (the UPDATE matches the filter on its *new* `campaign_id`, so a row-level `party_members_signal_leave` trigger rings the old one). The registry test keeps it in a fourth list, `live_sync_own_channel`.
- **Play state** (`20261008230509`, #1033 wave 1). Grimoire runs live games, so (almost) every campaign table is on a route; what is not must say why. Seventeen tables that change during play ring on every write: the three reveal tables, PC notes, NPC ratings and favours, faction membership, tracker state, pinned forms, door and room state, placements, consequence events, encounters, loot and roll tables, dungeon maps and features. None subscribes, because each is owner-only, readable by the DM and one player, DM-only, or has no `campaign_id`. Tables that hang off a place ring through it, and `store_items` shares that route instead of its own copy. A DM's editor hears its own save echo back as a refetch of the root its mutation already invalidated, so the doorbell adds no new hazard under an open form.
- **Campaign content** (`20261008231653`, #1033 wave 2). What the DM writes and the table reads: homebrew monsters, spells, species, classes, subclasses and features, rules, traps, recipes with their ingredients, outputs and modifiers, enabled sources, tile packs, sounds, pages, playlists and tracks, NPC sets, faction links (deities, places, items, NPCs, relations), a place's doors and map regions, and quest wiring (edges, gates, attachments, consequences, refs). All ring; none subscribes. Quest wiring rings under its own name for everyone, the DM included, unlike a beat row (which rings `quest_beats_player` so an autosaving beat form is not refetched under the DM): no autosaving form writes edges, gates or attachments, and their mutations already invalidate the same roots on success. Transient search results (`global-search`, `spellSearch`) are deliberately not refreshed, because they are re-asked on the next keystroke and every listed root is also persisted to disk.
- **The rest, and live by default** (`20261008232137`, #1033 wave 3). Spell-change windows (through the character), NPC relationships, campaign invites and player favourites ring too. `live_sync_registry.test.sql` now holds the rule itself: every table that carries `campaign_id`, `party_member_id`, `location_id` or `quest_id`, or reaches one through foreign keys at any depth, either rings, is published for a channel, or sits in `live_sync_exempt` with a written reason, and a stale exemption fails as well. The exemptions today: server job progress under a sanctioned poll (`document_imports`, the two tile-pack generation tables), derived search indexes (`*_embeddings`), a log no screen reads (`spell_cast_records`), a deny-all table read by token (`session_proposal_invites`), per-user state written too often to ring (`player_read_items`), join requests (read by a parent outside the campaign, whom the doorbell cannot reach), and the dashboard layout (below). `crafting_recipe_grants` turned up in the same audit with nothing reading it since recipes moved to `player_visible_to` (5 Apr 2026), and was dropped (`20261008233451`).

  **Before routing a table, check how its writers treat their own cache.** The doorbell echoes a client's own write back to it as an invalidation, which is harmless exactly when the mutation invalidates the same roots itself (on success or settle). `useDashboardLayout` deliberately does not: Customize mode saves on every drag and writes the server's answer back without refetching, so an echo would refetch under the drag and could restore an older layout. That is why it is exempt. A writer that declines to refetch on purpose is the case to look for.
- **The player-visible item projection.** A store row and a party-inventory row each carry only an `item_id`; the name behind it comes from `get_player_visible_items`. So both map to `["items"]` as well as their own key — refresh one without the other and a newly stocked shop lists "Unknown item".

`supabase/tests/live_sync_registry.test.sql` checks the database half against the real schema: every table in `SYNC_TABLES` rings on insert, update and delete; the named-signal and parent routes ring as listed; the publication is empty; only `private.send_campaign_rings` sends a ring and only `private.ring_campaigns` queues one; and every campaign-reachable table either rings or sits in `live_sync_exempt` with its reason. `campaignSyncTables.test.ts` holds those lists equal to `SYNC_TABLES` and `SIGNAL_KEYS`, and fails on a signal the database can ring that maps to no query and is not deliberately listener-only (`LISTENER_ONLY_SIGNALS`).

**What a member learns from it, and why that is accepted.** A ring carries a signal name and the tab that caused it (an opaque random id), no row ids and no content, to every member of the campaign. Some ringing tables are not player-readable at all (`loot_placements` is `is_campaign_dm`; `discovered_monsters`, the downtime tables and the quest runtime are partly or wholly DM-only), so a player can infer *"the DM just changed something in loot_placements"*. That is spoiler-shaped metadata rather than a data leak, and it is kept deliberately: filtering DM-only signals out would also drop the player-visible changes in tables that are only *partly* DM-only, which is the failure this mechanism exists to end. Revisit it if a table is ever added whose mere name is a spoiler.

Ten of the triggered tables have a *nullable* `campaign_id` (general-scope rows owned by a user rather than a campaign). A change to one of those rings nothing, since there is no campaign to ring, which is why a general vault item edited by the DM reaches another device on its next read.

**The read path is the ordinary one.** HTTP reads happen on first load, on a ring, and after a gap (`RECONCILE_KEYS`, re-read whenever the channel may have missed rings). A poll on top of that is a bug: it means a table that should ring does not.

**A topic's old channel must be gone before it is joined again** (found under `postgres_changes`; a Broadcast channel's `.on()` meets the same rule) (`createRealtimeChannel`, `src/lib/realtimeChannel.ts`). realtime-js returns the existing channel when a topic is asked for twice, and `removeChannel` only drops it once the server acknowledges the leave. A layout torn down and rebuilt inside that window (App's loading screen does it) was handed the old, already-joined channel, the first `.on()` threw "cannot add postgres_changes callbacks after subscribe()", and the player had no live sync until a reload (about one page load in eight on a phone). The helper defers a join until the previous channel on the same topic has left and evicts one whose leave timed out; presence checks staleness by handle identity, because `handle.channel` does not exist before the join.

**The request deadline passes null-body statuses through untouched** (`src/lib/requestDeadline.ts`). Browsers give a 204 an empty but non-null body stream, so rebuilding the response threw and every `/rest/v1` answer without content (deletes, updates without `.select()`, void RPCs) failed client-side after the server had done the work. Character creation lost a new character that way: the attach succeeded, the client threw, and the rollback deleted it.

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

**`realtime.messages` policy (the doorbell):**

- `realtime_messages_select`: an `authenticated` caller may join a private Broadcast topic only if `private.can_hear_realtime_topic(realtime.topic())` is true, a member of the campaign the `doorbell:<campaign id>` topic names. There is deliberately no insert policy: every ring comes from `private.send_campaign_rings` at commit, so a client that could forge a signal, and force every other client at the table into a refetch loop, has no way in. The reasoning lives with [the mechanism](#live-sync).

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
