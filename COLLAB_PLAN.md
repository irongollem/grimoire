# Grimoire — Collaboration Features: Technical Plan

> **Scope**: Multi-user campaign participation — DM + players on the same campaign, real-time encounter sync, shared inventory, and a player-facing portal. VTT/map management is out of scope here but this architecture is designed to accommodate it.

---

## 1. Vision & Roles

| Role       | Access                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| **DM**     | Everything (current behaviour). Controls what players can see.                                                           |
| **Player** | Their own character sheet (editable), party tracker (read), DM-shared notes/quests, live encounter view, party inventory |

Players use the same Supabase auth (email/password). The difference is membership role, not a separate auth system.

---

## 2. What Infrastructure Do We Need?

### Already available — no new services required

| Need                     | Solution                                                                        |
| ------------------------ | ------------------------------------------------------------------------------- |
| Multi-user auth          | Supabase Auth — already works, any user can sign up                             |
| Real-time sync           | **Supabase Realtime** — built into `@supabase/supabase-js`, zero extra services |
| Row-level access control | Supabase RLS — already in use, needs redesign                                   |
| File/image storage       | Supabase Storage — already set up                                               |
| WebSocket / SSE          | Supabase Realtime channels cover this entirely                                  |

### New infrastructure: none

Supabase Realtime provides three primitives that cover every real-time use case:

- **Postgres Changes** — subscribe to INSERT/UPDATE/DELETE on tables. Used for: party HP, quest updates, encounter state persistence.
- **Broadcast** — ephemeral pub/sub on a named channel. Used for: ephemeral encounter runner events (whose turn, dice rolls, "DM is targeting you").
- **Presence** — track connected users on a channel. Used for: showing which players are online during a session.

No socket.io, no custom SSE endpoint, no separate WebSocket server.

---

## 3. Data Model Changes

### 3.1 New Tables

#### `campaign_members`

```sql
create table public.campaign_members (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  role           text not null check (role in ('dm', 'player')),
  party_member_id uuid references public.party_members(id) on delete set null,
  display_name   text,           -- player's in-game name override
  joined_at      timestamptz default now(),
  updated_at     timestamptz default now(),
  unique(campaign_id, user_id)
);
```

- The DM is a member with `role = 'dm'`. Created automatically when a campaign is created.
- Players are linked to their `party_members` record via `party_member_id`.

#### `campaign_invites`

```sql
create table public.campaign_invites (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  token       uuid not null unique default gen_random_uuid(),
  role        text not null default 'player' check (role in ('dm', 'player')),
  created_by  uuid not null references auth.users(id),
  label       text,              -- DM note, e.g. "For Alice"
  expires_at  timestamptz,       -- null = never expires
  max_uses    int,               -- null = unlimited
  use_count   int not null default 0,
  created_at  timestamptz default now()
);
```

- DM generates a link: `https://[app]/join/{token}`
- On click: sign up / log in → auto-join campaign as player

#### `party_inventory`

```sql
create table public.party_inventory (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  user_id         uuid not null references auth.users(id),  -- DM who added it
  item_id         uuid references public.items(id) on delete set null,
  name            text,          -- denormalised fallback if item deleted
  quantity        int not null default 1,
  carried_by      uuid references public.party_members(id) on delete set null,
  is_attuned      boolean default false,
  notes           text,
  updated_at      timestamptz default now()
);
```

- Readable by all campaign members; writable by DM (and optionally by players for quantity/carried_by).

#### `encounter_state`

Persists live combat state so players can subscribe to it via Postgres Changes.

```sql
create table public.encounter_state (
  id                      uuid primary key default gen_random_uuid(),
  encounter_id            uuid not null references public.encounters(id) on delete cascade,
  campaign_id             uuid not null references public.campaigns(id) on delete cascade,
  user_id                 uuid not null references auth.users(id),  -- DM
  is_running              boolean not null default false,
  current_round           int not null default 1,
  active_combatant_index  int not null default 0,
  combatants_live         jsonb not null default '[]',  -- LiveCombatant[]
  started_at              timestamptz,
  updated_at              timestamptz default now(),
  unique(encounter_id)    -- one live state per encounter
);
```

- When DM clicks "Start Encounter", this row is created/updated.
- All clients subscribe via Postgres Changes → `UPDATE on encounter_state WHERE id = ?`
- Players see initiative order, HP bars, conditions in real time.

### 3.2 Modified Tables

| Table        | New Column                                | Purpose                         |
| ------------ | ----------------------------------------- | ------------------------------- |
| `notes`      | `is_player_visible boolean default false` | DM toggles per-note visibility  |
| `quests`     | `is_player_visible boolean default false` | DM controls what players see    |
| `encounters` | `state_id uuid FK → encounter_state`      | Link to live state when running |

---

## 4. RLS Redesign

### Helper Functions

The current RLS pattern (`auth.uid() = user_id`) is owner-only. We need campaign-member-aware policies.

```sql
-- Is the current user a member of this campaign?
create function public.is_campaign_member(cid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = cid and user_id = auth.uid()
  );
$$;

-- Is the current user the DM of this campaign?
create function public.is_campaign_dm(cid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = cid and user_id = auth.uid() and role = 'dm'
  );
$$;
```

### Policy Matrix

| Table                   | DM        | Player                                                                  |
| ----------------------- | --------- | ----------------------------------------------------------------------- |
| `notes`                 | Full CRUD | SELECT where `is_player_visible = true`                                 |
| `npcs`                  | Full CRUD | No access (DM-only asset)                                               |
| `monsters`              | Full CRUD | No access                                                               |
| `items`                 | Full CRUD | No access (party_inventory is the player-facing layer)                  |
| `spells`                | Full CRUD | No access                                                               |
| `scriptorium_documents` | Full CRUD | No access                                                               |
| `party_members`         | Full CRUD | SELECT all in campaign; UPDATE own record (HP, conditions, death saves) |
| `party_inventory`       | Full CRUD | SELECT all; UPDATE `quantity` + `carried_by` on own row                 |
| `quests`                | Full CRUD | SELECT where `is_player_visible = true`                                 |
| `encounters`            | Full CRUD | SELECT (to see the encounter definition)                                |
| `encounter_state`       | Full CRUD | SELECT (read-only live state)                                           |
| `campaign_members`      | Full CRUD | SELECT (see who's in the party)                                         |
| `calendar_events`       | Full CRUD | No access (keep calendar DM-only for now)                               |
| `companions`            | Full CRUD | SELECT all in campaign                                                  |

---

## 5. Real-time Architecture

### Channels

| Channel name     | Primitive       | Used for                                                              |
| ---------------- | --------------- | --------------------------------------------------------------------- |
| `campaign:{id}`  | Presence        | Who is online right now                                               |
| `campaign:{id}`  | Broadcast       | DM announcements ("Quest completed", "Item added to inventory")       |
| `encounter:{id}` | Broadcast       | Fast ephemeral events: dice results, "your turn" ping, visual effects |
| Postgres Changes | encounter_state | Authoritative HP/initiative sync (persisted, survives reconnect)      |
| Postgres Changes | party_members   | HP/condition changes players make to their own sheet                  |
| Postgres Changes | party_inventory | Inventory adds/removes                                                |

### Why both Broadcast AND Postgres Changes for encounter?

- **Broadcast** is fire-and-forget, sub-10ms latency. Use for: "this combatant just got hit (animate the card)", turn notifications, dice results. These don't need to persist.
- **Postgres Changes** is the source of truth. HP changes, conditions, death saves — written to `encounter_state.combatants_live` JSONB by the DM client, then all clients receive the DB event and rehydrate. Survives page refresh.

### Client composables

```
src/composables/
├── useRealtime.ts          # Low-level: wraps supabase.channel(), handles subscribe/cleanup
├── useCampaignPresence.ts  # Who's online (Presence)
├── useEncounterLive.ts     # Encounter runner real-time: Broadcast + Postgres Changes on encounter_state
└── useCampaignBroadcast.ts # DM → players notifications
```

---

## 6. Invite Flow

```
DM generates invite link
  → creates row in campaign_invites with unique token
  → copies link: /join/{token}

Player opens link
  → if not logged in → redirect to /auth/signup?next=/join/{token}
  → after signup/login → POST /join/{token}:
      1. Validate token (not expired, use_count < max_uses)
      2. Insert campaign_members row (campaign_id, user_id, role='player')
      3. Increment use_count
      4. Redirect to /play (player portal)
```

The join action is a Supabase Edge Function (`supabase/functions/join-campaign/`). This is the one new server-side piece — needed because RLS can't safely validate tokens and insert membership atomically from the client.

> **Supabase Edge Functions** are Deno-based, deploy with `supabase functions deploy`. No separate server needed.

---

## 7. Player Portal — Routes & Views

```
/play                     PlayerHome.vue       — character summary, active encounter badge, online party
/play/character           PlayerCharacter.vue  — full character sheet (editable own fields only)
/play/party               PlayerParty.vue      — read-only party tracker (other members)
/play/inventory           PlayerInventory.vue  — shared party inventory
/play/quests              PlayerQuests.vue     — DM-shared quests (kanban/list, objectives read-only)
/play/notes               PlayerNotes.vue      — DM-shared notes (read-only)
/play/encounter           PlayerEncounter.vue  — live encounter view (initiative order, HP bars)
/join/:token              JoinCampaign.vue     — invite landing + join flow
```

Players never see DM routes. The router guard checks `authStore.currentRole`:

- `'dm'` → normal routes
- `'player'` → redirect all non-play routes to `/play`
- `null` → `/auth/login`

### Auth store additions

```ts
// New state
const campaignMembership = ref<CampaignMember | null>(null);

// New computed
const currentRole = computed(() => campaignMembership.value?.role ?? null);
const linkedPartyMemberId = computed(
  () => campaignMembership.value?.party_member_id ?? null,
);
const isDM = computed(() => currentRole.value === "dm");
const isPlayer = computed(() => currentRole.value === "player");
```

On login: fetch `campaign_members` for the current user. If exactly one campaign → set as active. Multi-campaign support can come later (campaign picker screen).

---

## 8. DM Controls (New UI)

### Campaign Settings page (`/campaign/settings`)

- **Members tab**: list members with roles, online indicator (Presence), kick button, link to party member record
- **Invites tab**: generate invite links, set expiry/use limit, copy/revoke
- **Sharing tab**: global toggles (e.g. "players can edit their own HP")

### Per-entity visibility toggles

- Notes editor: eye icon in toolbar → `is_player_visible`
- Quest detail: "Share with players" toggle
- Encounter: "Go Live" button → creates/updates `encounter_state`, notifies players via Broadcast

---

## 9. Player Character Sheet Editing

Players can edit **only their own** `party_members` row. The RLS policy:

```sql
create policy "party_members_update_own" on party_members
  for update using (
    -- DM can update anything
    is_campaign_dm(campaign_id)
    or
    -- Player can update their own linked record
    exists (
      select 1 from campaign_members
      where campaign_id = party_members.campaign_id
        and user_id = auth.uid()
        and party_member_id = party_members.id
    )
  );
```

Editable by player: `current_hp`, `temp_hp`, `conditions`, `death_saves`, `inspiration`.
DM-only fields (enforced in UI + app logic): ability scores, proficiencies, class, level, etc.

---

## 10. Phased Rollout

### Phase 1 — Foundation (database + invite flow)

- `campaign_members` + `campaign_invites` tables + RLS helpers
- Auto-create DM membership on campaign creation
- Supabase Edge Function: `join-campaign`
- `/join/:token` route + `JoinCampaign.vue`
- Auth store: `campaignMembership`, `currentRole`, router guard update

### Phase 2 — Player Portal (read-only)

- All `/play/*` routes and views (read-only first pass)
- `useCampaignPresence.ts` — online indicator in DM nav
- Notes + quest visibility flags + DM toggles
- `party_inventory` table + `PlayerInventory.vue`
- `useCampaignBroadcast.ts` — DM announcements

### Phase 3 — Live Encounter Sync

- `encounter_state` table
- `useEncounterLive.ts` composable
- EncounterRunner writes to `encounter_state` on every state change
- `PlayerEncounter.vue` — read-only initiative tracker + HP bars
- "Go Live" / "End Encounter" DM controls

### Phase 4 — Player Editing + DM Tools

- Player edits own HP/conditions (RLS policy + UI guard)
- Campaign Settings page (member management, invite management)
- Presence badges in DM party tracker (green dot = online)
- Broadcast notifications to players on quest/item events

---

## 11. Out of Scope (Future: VTT & Maps)

When the time comes, the architecture above accommodates:

- **Map images** → Supabase Storage bucket (`maps/`)
- **Token positions** → Broadcast channel (ephemeral, low-latency) with periodic Postgres write for persistence
- **Fog of war** → bitmask/region JSONB stored per-encounter-state
- **Drawing tools** → Broadcast only (no persistence needed)

The `encounter:{id}` Broadcast channel and `encounter_state` table are already the right primitives — VTT just adds a `map_state` JSONB column and more Broadcast message types.

---

## 12. File Change Summary

| Area                                            | New/Changed                                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/`                          | `*_campaign_members.sql`, `*_campaign_invites.sql`, `*_party_inventory.sql`, `*_encounter_state.sql`, `*_collab_rls.sql`                      |
| `supabase/functions/join-campaign/`             | New Edge Function                                                                                                                             |
| `src/types/`                                    | `campaign.types.ts` — add `CampaignMember`, `CampaignInvite`; `encounter.types.ts` — add `EncounterState`, `LiveCombatant`                    |
| `src/stores/auth.ts`                            | Add membership state + role helpers                                                                                                           |
| `src/router/index.ts`                           | Role-based guard, `/play/*` routes, `/join/:token`                                                                                            |
| `src/composables/`                              | `useRealtime.ts`, `useCampaignPresence.ts`, `useEncounterLive.ts`, `useCampaignBroadcast.ts`, `useCampaignMembers.ts`, `usePartyInventory.ts` |
| `src/views/play/`                               | 7 new player portal views                                                                                                                     |
| `src/views/auth/JoinCampaign.vue`               | New invite landing                                                                                                                            |
| `src/components/campaign/`                      | `CampaignSettings.vue`, `InviteManager.vue`, `MemberList.vue`                                                                                 |
| `src/components/encounters/EncounterRunner.vue` | Add "Go Live" + `useEncounterLive` integration                                                                                                |
