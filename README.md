<p align="center">
  <img src="public/logo.webp" alt="Dungeon Grimoire" width="200" />
</p>

<h1 align="center">Dungeon Grimoire</h1>

<p align="center">
  Full-stack D&amp;D 5e campaign management for Dungeon Masters and their players.
  <br />
  <a href="https://dungeongrimoire.com"><strong>dungeongrimoire.com →</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-42b883?logo=vue.js&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white" alt="Tailwind v4" />
  <img src="https://img.shields.io/badge/license-Source%20Available-orange" alt="Source Available" />
</p>

---

## What is Dungeon Grimoire?

Dungeon Grimoire is a unified campaign management platform for D&D 5e. The DM gets a rich authoring and live-play toolkit; players get a separate, role-appropriate portal with real-time data sync. It covers the entire campaign lifecycle — from world-building through live combat — in a single app.

This repository is **public for transparency**. See [Licensing](#licensing) for usage terms.

---

## Features

### For Dungeon Masters

| Area | What's included |
| --- | --- |
| **Campaign hub** | Dashboard, session notes (rich text, AI image gen), pinned quests, party presence |
| **World-building** | Hierarchical Atlas (17 location types), kanban Quest Log, Factions with directional relations |
| **NPCs** | Full character sheets, force-directed Relationship Web, AI NPC Generator, stat block with bestiary import |
| **Party & Characters** | Initiative + HP tracker, full D&D 5e character sheet (Wild Shape, level-up wizard), Hall of Heroes |
| **Combat** | Bestiary with 12 SRD presets + Open5e sync, Encounter Builder (factions, boss mechanics, pre-scripted events), live Encounter Runner |
| **Items & Spells** | Item Vault with dual-image ID system, Spellbook with Spell Level Advisor, Workshop crafting recipes |
| **Dungeon Building** | Features, Traps (CR Advisor), Puzzles with hint reveals, Roll Tables, Loot Tables with claimable drops |
| **Publishing** | Scriptorium document editor (PDF export, PHB themes), Card Forge (MTG + Tarot print sheets), The Mint (VTT tokens + coins), Illuminator (canvas image processing) |
| **DM Screen** | Reliquary — quick reference, SRD compendium, custom Tracker builder for homebrew mechanics |
| **Soundboard** | Ambient scenes + music playlists, Spotify integration |
| **Calendar** | Custom world calendar — define your own months, intercalary days, and year length; month grid + Chronicle timeline view; ships with 9 built-in D&D settings (Faerûn, Eberron, Greyhawk, Dragonlance, Ravenloft, Planescape, Spelljammer, Dark Sun, Mystara) plus a fully custom option |

### For Players

Players join any campaign for free via an invite link and get their own portal:

- **Character sheet** — owned and edited by the player; Wild Shape, spells, crafting all player-controlled
- **Paper doll inventory** — 11 anatomical slots, attunement tracker, carry weight, coin purse
- **Live encounter view** — real-time combat tracker with turn notifications and monster discovery
- **Journal** — private + shared entries with party journal aggregation
- **Reliquary** — read-only house rules, SRD reference, Character Codex
- **Puzzles** — hint reveals pushed by the DM in real time
- **Shapeshifter disguise** — player-controlled; other players see the fake species profile; DM always sees the truth

---

## Tech Stack

| Layer      | Technology                                                            |
| ---------- | --------------------------------------------------------------------- |
| Frontend   | Vue 3 + TypeScript + Vite (Rolldown)                                  |
| Styling    | Tailwind CSS v4 — config in CSS via `@theme`, no `tailwind.config.js` |
| Components | Reka UI (shadcn-vue style, headless)                                  |
| State      | Pinia (UI) + TanStack Query (server/async)                            |
| Router     | Vue Router 5                                                          |
| Backend    | Supabase — PostgreSQL + Auth + Realtime + Storage + Edge Functions    |
| Linting    | oxlint                                                                |

Architecture diagrams (system context, internal layers, third-party
integrations, release pipeline) live in
[`context/architecture/`](context/architecture/index.md).

---

## Pricing

| Plan        | Who             | What                                                                                                                          |
| ----------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Free DM** | Dungeon Masters | 1 campaign, 10 NPCs, 3 custom monsters, 5 encounters, 3 Scriptorium docs, 10 notes, 20 sounds, 1 soundboard page, 3 playlists |
| **Pro DM**  | Dungeon Masters | Unlimited content + 1,500 AI credits/month (monthly allowance, resets each cycle)                                             |
| **Player**  | Anyone          | Always free — join any campaign with an invite link                                                                           |

AI credits are also sold as permanent packs that never expire — purchased credits act as an overage buffer on top of the monthly Pro allowance. Spends draw from the expiring monthly bucket first.

Full pricing at [dungeongrimoire.com/pricing](https://dungeongrimoire.com/pricing).

---

## Development Setup

> ⚠️ **Self-hosting requires a license.** See [Licensing](#licensing) before proceeding.

```bash
# Prerequisites: Node 24+, Docker, and the Supabase CLI

npm install
npm run db:start    # boot local Postgres, Auth, Storage, and Studio
npm run dev         # dev server against local Supabase
npm run build       # production build (vue-tsc + vite build)
npm run lint        # oxlint
npm test            # vitest
```

Hosted development is deliberately explicit. Copy `.env.example` to
`.env.local`, fill in the hosted project values, and run:

```bash
npm run dev:hosted
```

Remote migrations are applied by CI after changes reach `main`; do not push the
working tree's pending migrations manually.

### Local Development (against a local Supabase copy)

Day-to-day development should run against a **local Supabase stack**, not the
production database. The local stack is a full, throwaway copy of the schema
(all migrations replayed) that you can reset freely.

**Prerequisites:** Docker running, the Supabase CLI installed, and the project
linked once (`supabase link --project-ref <ref>`).

```bash
npm run db:start     # boot the local stack (Postgres, Auth, Storage, Studio…)
npm run db:status    # print local URLs + keys (Studio at <http://127.0.0.1:54323>)
npm run dev          # run the app against the local stack (vite --mode localdb)
npm run dev:local    # explicit alias for the same local mode
npm run dev:hosted   # opt in to the hosted credentials from .env.local
npm run db:reset     # wipe + replay all migrations (+ seed.sql if present)
npm run db:stop      # tear the stack down
```

`npm run dev` and `npm run dev:local` use the isolated
`config/env/localdb/.env` file (committed; the CLI's universal local defaults —
safe, not secrets). The separate environment directory prevents Vite from also
loading the gitignored hosted values in `.env.local`. Only
`npm run dev:hosted` opts into the hosted project.

**Seed it with a copy of the remote** (tester accounts + app data — no
production customer data exists pre-launch):

```bash
npm run db:pull      # dumps remote auth+public data → supabase/seed.sql (gitignored)
npm run db:reset     # rebuilds the local DB and loads seed.sql
```

**The dump is anonymized before it lands (#652).** `db:pull` chains
`scripts/anonymize-seed.ts`, which rewrites every email address in `seed.sql` to
`user-<n>@example.invalid`. The reason to pull remote data is its volume and
shape, not its identities — and an address copied onto a laptop is outside every
control that applies to production: no retention period, and out of reach of
account erasure, which cannot follow someone into a local file.

One address is kept so the seeded account is still yours to sign into: your
`git config user.email`. Export `SEED_KEEP_EMAILS` (comma-separated) if the
account you log in with locally is not your git identity. `db:reset` re-checks
the file first and refuses to seed a dump that still holds real addresses —
which is what you want if you ever run `supabase db dump` by hand and bypass the
chained step. To fix one up after the fact:

```bash
npm run db:anonymize          # rewrite in place (idempotent)
npm run db:anonymize -- --check   # just report; exit 1 if any real address survives
```

`db:pull` needs the remote DB password (the CLI prompts, or set
`SUPABASE_DB_PASSWORD`). It **excludes the config/reference tables that migrations
already seed** — the `-x` flags in the script are the list; it has grown past
what is worth restating here, so read it there. Those tables are populated
identically by migrations on both sides, so dumping them too would collide on
primary keys at `db:reset`. If you add a new migration-seeded config table, add
it to the `-x` list. If you already hold a dump taken *before* a table joined
that list, delete its `INSERT INTO "public"."<table>"` statement or re-pull —
otherwise the next `db:reset` fails on the duplicate key.

`plans` is the newest entry and the reason the rule matters: it was reference
data with no migration behind it, so a fresh database had an empty plan
catalogue and the first signup died on
`user_subscriptions_plan_id_fkey`. Seeded by
`20260809151956_seed_plan_catalogue.sql` and excluded from the dump since.
If the `auth` portion of the dump errors, narrow it to `--schema public` and create
tester accounts locally instead (local signup confirmation emails land in Mailpit
at <http://127.0.0.1:54324>).

> **Why the baseline squash omits the `storage` schema:** a full `supabase db
> dump` captures the service-managed `storage` schema, which a local
> `supabase start` cannot replay (the migration role can't create in / own the
> storage schema — that schema is provided by the storage service). The baseline
> keeps only the app's `storage.objects` **RLS policies**; the schema itself
> comes from the service. This keeps local replay green and leaves the remote
> untouched.

---

## Project Structure

```
src/
├── assets/                # Tailwind v4 @theme tokens + global CSS
├── ai/                    # AI generation composables + provider adapters
├── calendars/             # Calendar adapter pattern (registry + adapters)
├── cartographer/          # Tile-pack authoring engine
├── components/            # Feature components (npcs/, monsters/, encounters/, …)
├── composables/           # TanStack Query hooks per feature domain
├── data/                  # Static data tables (no logic)
├── directives/            # Vue directives (tooltip, roll mode, …)
├── layouts/               # DefaultLayout (DM), PlayerLayout, AuthLayout
├── levelup/               # Level-up wizard
├── lib/                   # Cross-cutting infra + feature subsystems
├── manual/                # In-app user manual (markdown)
├── router/                # Routes + auth guard
├── rules/                 # Pure D&D 5e rules computation
├── settings/              # Campaign-setting definitions
├── stores/                # Pinia: auth, campaign, ui, encounterRun, …
├── types/                 # TypeScript types per feature domain
└── views/                 # Page views per feature area
supabase/
├── functions/             # Deno Edge Functions (AI, Stripe, storage, email, MCP)
├── migrations/            # Timestamped SQL migrations
├── tests/                 # pgTAP suites
└── checks/                # Deploy-gating content integrity checks
context/
├── architecture/          # System diagrams + outage triage (start here)
├── features/              # Per-feature agent-readable documentation
└── compliance/            # AI Act register, provenance, retention
```

---

## Licensing

The source code is published for **transparency and community trust** — not as open source.

**You may:** read and study the code.

**You may not** (without written permission): run, deploy, self-host, modify, distribute, or build products based on this codebase.

**Two ways to use Dungeon Grimoire legitimately:**

1. **Use the hosted service** at [dungeongrimoire.com](https://dungeongrimoire.com) under its Terms of Service.
2. **Obtain a license** — contact [jeffrey@crocode.nl](mailto:jeffrey@crocode.nl).

See [LICENSE](LICENSE) for the full terms.

---

## Contributing

Contributions are welcome! Bug fixes, new features, and improvements can all be submitted as pull requests. For larger changes it's worth [opening an issue](https://github.com/irongollem/grimoire/issues) first so we can align before you invest the time.

**By submitting a pull request you agree that your contribution is assigned to Crocode B.V. and may be used, modified, and relicensed by Crocode B.V. under any terms.** You retain the right to be credited as a contributor.

---

<p align="center">
  Built by <a href="https://crocode.nl">Crocode B.V.</a> &nbsp;·&nbsp;
  <a href="https://dungeongrimoire.com">dungeongrimoire.com</a>
</p>
