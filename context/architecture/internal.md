# Internal Application Architecture

How the frontend is layered, where state lives, and how data moves. For
*what each feature does*, read [`../features/index.md`](../features/index.md) —
this doc is about the shapes that every feature shares.

Stack: Vue 3.5 + TypeScript + Vite 8 (rolldown) · Vue Router 5 · Pinia 4 +
TanStack Query 5 · Tailwind v4 (no config file; tokens in `src/assets/*.css`) ·
Reka UI · Tiptap v3 · `@supabase/supabase-js`. Hand-rolled service worker (no
Workbox / vite-plugin-pwa).

## The layer diagram

Every feature follows the same vertical. If a bug report names a feature,
walk this stack top-down; the layer names below are literal directory names.

```mermaid
flowchart TB
    subgraph pages ["Pages & navigation"]
        router["src/router/routes.ts<br/>guard: src/router/index.ts"]
        layouts["src/layouts/<br/>Default (DM) · Player · Auth"]
        views["src/views/&lt;area&gt;/"]
    end

    subgraph ui ["UI layer"]
        components["src/components/&lt;area&gt;/<br/>feature components"]
        common["src/components/common/<br/>primitives: AppButton, AppInput,<br/>RichTextEditor, FocalImage, EntityCombobox"]
    end

    subgraph state ["State (two planes)"]
        composables["src/composables/&lt;domain&gt;/use*.ts<br/>SERVER state — TanStack Query,<br/>one composable per domain"]
        stores["src/stores/ (8 Pinia stores)<br/>UI state — filters, run state, playback"]
    end

    subgraph logic ["Domain logic (no I/O)"]
        rules["src/rules/<br/>5e computation: AC, HP, slots,<br/>initiative, conditions, wildshape"]
        lib["src/lib/&lt;subsystem&gt;/<br/>audio, battlemap, dice, quests,<br/>scriptorium, tiptap, library, …"]
        data["src/data/<br/>static tables, no logic"]
    end

    subgraph io ["I/O boundary"]
        client["src/lib/supabase.ts<br/>single client instance"]
        realtime["src/lib/realtimeChannel.ts<br/>+ src/lib/campaignLiveSync/"]
        storagelib["src/lib/storage/<br/>Supabase Storage + R2 barrel"]
    end

    supa[("Supabase<br/>Postgres · Auth · Realtime · Storage · Edge Functions")]

    router --> layouts --> views --> components
    components --> common
    views --> composables
    components --> composables
    components --> stores
    composables --> rules
    components --> lib
    composables --> client
    composables --> realtime
    components --> storagelib
    client --> supa
    realtime --> supa
    storagelib --> supa
```

Two deliberate separations that look mergeable but are not:

- `src/cartographer/` (tile-pack **authoring** tool) vs `src/lib/battlemap/`
  (live encounter **runner** math). Do not merge — see CLAUDE.md § Module
  Placement.
- `src/ai/` holds one composable per AI generator plus the credit/quota
  composables; the generators call **edge functions**, never providers
  directly (provider keys live server-side or in the per-campaign vault).

## State management: two planes, never mixed

| Plane | Lives in | Shape |
| --- | --- | --- |
| **Server state** | `src/composables/<domain>/use*.ts` (a few UI/platform primitives stay at `src/composables/` root) | `useQuery`/`useMutation` wrapping module-private `fetchX/createX/…` that call `supabase.from(...)`. Query keys are `[QUERY_KEY, activeCampaignId]`, gated on an active campaign. Global defaults in `src/main.ts`: `networkMode: "always"`, `staleTime: 60s`, no refetch-on-focus. |
| **UI state** | `src/stores/` (Pinia) | Filters/sort/search (**always** `ui.ts` — the Filter State Pattern), run state, playback state. |

The 8 stores and their roles:

| Store | Role |
| --- | --- |
| `auth.ts` | Supabase session, campaign membership, `isAppAdmin`/`isDM`/`isPlayer`; feeds the router guard and `setCachedUser()` |
| `campaign.ts` | `activeCampaignId` (localStorage-persisted) — the key nearly every query is scoped by; BYOK API-key decryption |
| `ui.ts` | All list filters + per-feature UI modes + `dmPreviewMode` (mandated by CLAUDE.md) |
| `encounterRun.ts` | Live combat run state. Deliberately UI-only: DB writes are injected via `setPersistHandler`, dice via `InitiativeRoller` |
| `soundboard.ts` | Playback, buses, ducking, playlist run state (audio objects held non-reactive at module level) |
| `spotify.ts` | Spotify Web Playback SDK device + transport |
| `calendar.ts` | Active calendar adapter, custom campaign calendars |
| `cardForge.ts` | Card size/style/selection, collections in localStorage |

## Data access: three verbs

Roughly **209** direct table reads/writes, **71** RPCs, **40** edge-function
invocations. Which verb a feature uses tells you where to debug it:

```mermaid
flowchart LR
    app["Frontend<br/>composables / src/ai/"]

    app -- "supabase.from()<br/>plain CRUD, RLS-guarded" --> tables[("Postgres tables<br/>RLS policies")]
    app -- "supabase.rpc()<br/>security-sensitive or derived reads:<br/>player projections, disguise,<br/>quest graph, credit ledger" --> rpcs["SECURITY DEFINER functions<br/>(authorize internally via auth.uid())"]
    app -- "functions.invoke()<br/>anything with a secret or a provider:<br/>AI, Stripe, R2, email, Meshy" --> edge["Edge Functions<br/>supabase/functions/*"]
    rpcs --> tables
    edge --> tables
    edge --> ext["Third parties<br/>(see integrations.md)"]
```

- A bug in plain CRUD → check RLS policies and the composable.
- A bug in an RPC → the function body in `supabase/migrations/` (authorization
  rules in CLAUDE.md § SECURITY DEFINER).
- A bug involving AI/billing/storage/email → the edge function, then the
  provider ([integrations.md](integrations.md)).

## Realtime sync (live multi-user)

One campaign-wide channel, reference-counted, mounted once per layout
(`DefaultLayout` / `PlayerLayout`) via `useCampaignLiveSync`:

```mermaid
flowchart LR
    pg[("Postgres<br/>~30 SYNC_TABLES,<br/>filter campaign_id=eq.X")] --> rt["Supabase Realtime"]
    rt --> chan["src/lib/realtimeChannel.ts<br/>subscribe status · gap recovery ·<br/>wake listeners · teardown<br/>(heal policy: realtimeHeal.ts)"]
    chan --> dispatch["src/lib/campaignLiveSync/<br/>3 dispatchers: world · player · systems"]
    dispatch --> cache["realtimeCache.ts<br/>patch TanStack caches in place;<br/>joins/redacted rows → invalidate;<br/>RECONCILE_KEYS after event gaps"]
    cache --> uiL["UI re-renders"]

    rt -.-> enc["useEncounterLive<br/>(encounter_state, singleton + refcount)"]
    rt -.-> pres["useCampaignPresence"]
    rt -.-> msg["useCampaignMessages / broadcast"]
    rt -.-> snd["useSoundboardBroadcast /<br/>usePlayerAudioStream"]
```

Rules the reducers obey: an event may **patch** an already-loaded cache but
never **create** one; anything the reducer can't reproduce exactly (joins,
redacted player projections) falls back to targeted invalidation.

**Symptom → cause:** "player doesn't see DM's change until reload" is either
the table missing from `SYNC_TABLES` (`campaignLiveSync`), a reducer patching
the wrong cache key, or channel death that healing didn't recover — check
`realtimeChannel.ts` status handling before suspecting the DB.

## Service worker & update lifecycle

Three cooperating modules (all wired in `src/main.ts`); the failure mode this
design guards is *stale chunks after deploy*:

```mermaid
sequenceDiagram
    participant B as Build (vite closeBundle)
    participant SW as sw.js (scripts/sw-template.js)
    participant A as swAutoUpdate.ts
    participant R as staleChunkRecovery.ts

    B->>SW: precache manifest + cache name (content hash)
    Note over SW: install = ATOMIC app shell:<br/>every JS/CSS must cache with valid<br/>Content-Type or old worker survives
    A->>SW: registration.update() every 5 min + on foreground
    A->>A: new build found → reload NOW unless busy<br/>(typing, mutation in flight, audio playing)<br/>else defer, retry 60s / surface "Reload to update"
    Note over R: page running old code, old cache already GC'd,<br/>dynamic import fails
    R->>R: one hard navigation to intended path<br/>(sessionStorage guard — a broken deploy<br/>degrades to visible failure, not a reload loop)
```

One trap in that last step: Vite wraps every route `import()` in
`__vitePreload`, whose error path is `baseModule().catch(handlePreloadError)`,
and `handlePreloadError` re-throws **only** if nothing called `preventDefault`
on the `vite:preloadError` event — which `staleChunkRecovery` does. So the
import resolves to `undefined` and vue-router throws `Couldn't resolve
component "default" at "<path>"` instead of the engine's "failed to fetch
dynamically imported module". Classify with `isStaleChunkError`, never
`isChunkLoadError`, anywhere downstream of a route load; matching only the
engine text is what let DUNGEON-GRIMOIRE-3 through the Sentry filter.

Fetch policy: same-origin GET only; navigations race network vs 2.5 s timeout
→ cached `index.html`; assets cache-first. **Supabase and provider calls are
never cached** (cross-origin passes through), so the SW can be ruled out of
any data-staleness bug — it can only serve stale *code*.

## Where a new module goes

Codified in CLAUDE.md § Module Placement (decision table + the misfiling
post-mortems). Short version: 5e math → `src/rules/`; one-feature logic →
`src/lib/<feature>/`; multi-module subsystem → `src/lib/<name>/`; static
tables → `src/data/`; a lone utility with 3+ feature consumers → `src/lib/`
root. Tests are colocated, never `__tests__/`.
