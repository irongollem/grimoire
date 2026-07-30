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

The join operation itself is performed by the `join_campaign_via_invite(p_token)` PostgreSQL function (security definer). It validates the token (not expired, not over max uses), inserts the membership row, increments the use count, and returns the `campaign_id` — all atomically. If the calling user is already a member, it returns the `campaign_id` idempotently without error or duplicate membership.

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
- A remove button for players (with a confirmation dialog). Players can rejoin via a new invite. The DM cannot be removed.

The DM membership is created automatically by the `create_dm_membership` trigger that fires `after insert on campaigns`. DMs never need to join their own campaign via invite.

## Role System

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
| **Danger Zone**       | Delete campaign (requires typing the campaign name to confirm; cascades to remove memberships and invites but does not delete notes/NPCs/etc.)                                                                                                                                  |

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

**`useCampaignLiveSync`** (`src/composables/useCampaignLiveSync.ts`)
Subscribes to Supabase `postgres_changes` for these tables (filtered by `campaign_id`):

- `notes`, `quests`, `locations`, `factions`, `puzzle_rooms`, `calendar_events`, `player_journal`

Any insert/update/delete on these tables triggers a TanStack Query cache invalidation for the matching query key. Both the DM's `DefaultLayout` and the player's `PlayerLayout` mount this composable, so both sides see updates instantly without polling.

**DELETE payloads carry only the primary key — never build on anything else.** Two Supabase constraints combine here, and both are easy to forget because a handler that violates them fails silently rather than erroring:

1. RLS is enabled on every synced table, and *"when RLS is enabled and `replica identity` is set to `full` on a table, the `old` record contains only the primary key(s)"*. Raising `REPLICA IDENTITY` to `FULL` does **not** buy back the other columns — it only inflates the WAL. Migration `20260730000005` reverted all 25 tables that had tried this.
2. *"Delete events are not filterable."* A `filter: campaign_id=eq.X` is honoured for INSERT/UPDATE but ignored for DELETE, so **every** subscriber receives **every** delete on that table, app-wide.

So a delete handler gets one id, possibly for a row in another campaign. Match on the primary key — which is inherently safe, since a foreign id simply isn't in the local cache — and if the handler needs to know anything else about the deleted row (who it belonged to, what it pointed at), it must either re-read authoritatively or invalidate broadly. `applyRealtimeRow` (`src/lib/realtimeCache.ts`) already does this correctly: it keys on `change.old.id` and only consults `matches()` for non-deletes. Three hand-written handlers did not, and had never worked — see the #580 entry in [`docs/log/fixes/database.md`](../../docs/log/fixes/database.md).

A table must also actually be in the `supabase_realtime` publication for any of this to fire; subscribing to an unpublished table is silent. Verify with `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`.

**`useCampaignPresence`** (`src/composables/useCampaignPresence.ts`)
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

- Notes, NPCs, monsters, encounters, etc. use `is_campaign_member(campaign_id)` or `is_campaign_dm(campaign_id)` in their RLS policies. Players can read data that is scoped to their campaign; only DMs can write most of it.
- Specific player-writable tables (party member HP, conditions, inventory, journal) have additional policies permitting writes from the linked player.

**Helper functions:**

- `is_campaign_member(cid uuid)` — returns true if `auth.uid()` has any row in `campaign_members` for that campaign.
- `is_campaign_dm(cid uuid)` — returns true if `auth.uid()` has a `dm` row for that campaign.
- Both are `security definer` with `stable` volatility and an explicit `search_path`, preventing privilege escalation or search-path injection.
