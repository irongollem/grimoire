# Bugs

> **This is a pointer file.** The resolved-bug history is a curated **log**, split by
> subsystem under [`docs/log/fixes/`](docs/log/fixes/) — full index in
> [`docs/log/index.md`](docs/log/index.md). Open bugs live in GitHub issues on
> `irongollem/grimoire`, **not here**.
>
> **When you fix a bug:** append a one-line `- [x]` entry (root cause + fix) to the
> top of the matching [`docs/log/fixes/<subsystem>.md`](docs/log/fixes/) file, then
> close the GitHub issue if one exists.

## Fix log by subsystem  ·  287 resolved

| Subsystem | Fixes | | Subsystem | Fixes |
| --- | ---: | --- | --- | ---: |
| [Campaign](docs/log/fixes/campaign.md) | 11 | | [Atlas & Locations](docs/log/fixes/atlas.md) | 15 |
| [Collaboration](docs/log/fixes/collaboration.md) | 7 | | [Cartographer & VTT](docs/log/fixes/cartographer.md) | 1 |
| [Player Portal](docs/log/fixes/players.md) | 8 | | [Chat & Dice](docs/log/fixes/chat.md) | 10 |
| [Rules Reliquary](docs/log/fixes/rules.md) | 1 | | [Images & Art](docs/log/fixes/images.md) | 10 |
| [Content & Import](docs/log/fixes/content.md) | 7 | | [Publishing & Export](docs/log/fixes/publishing.md) | 23 |
| [Monsters & Bestiary](docs/log/fixes/monsters.md) | 12 | | [UI & Layout](docs/log/fixes/ui.md) | 12 |
| [NPCs & Companions](docs/log/fixes/npcs.md) | 15 | | [Database & Security](docs/log/fixes/database.md) | 12 |
| [Items & Workshop](docs/log/fixes/items.md) | 26 | | [AI Generation](docs/log/fixes/ai.md) | 10 |
| [Spells](docs/log/fixes/spells.md) | 5 | | [Billing](docs/log/fixes/billing.md) | 5 |
| [Factions](docs/log/fixes/factions.md) | 3 | | [Infrastructure](docs/log/fixes/infra.md) | 11 |
| [Encounters & Combat](docs/log/fixes/encounters.md) | 25 | | [Soundboard](docs/log/fixes/soundboard.md) | 19 |
| [Quests](docs/log/fixes/quests.md) | 13 | | [Miscellaneous](docs/log/fixes/misc.md) | 1 |
| [Party & Characters](docs/log/fixes/party.md) | 25 | | | |

## Latest fixes

- NPC relevance rankings were browser-local, so clearing site data or switching devices erased a player's stars (#582) — [NPCs & Companions](docs/log/fixes/npcs.md)
- Schema consolidation audit (#580): 9 unindexed FK/RLS columns, 20 per-row `auth.uid()` policies, 25 tables paying for a `REPLICA IDENTITY FULL` that RLS made useless, and account deletion failing on 16 FKs — [Database & Security](docs/log/fixes/database.md)
- Three realtime handlers had never worked — they read non-primary-key fields off `payload.old`, which RLS strips, so a removed player was never ejected — [Database & Security](docs/log/fixes/database.md)
- The Scriptorium document list shipped every document's full Tiptap body to draw its cards — [Database & Security](docs/log/fixes/database.md)
- Campaign species/class blocklists were enforced only in the DM's Add Hero form — every player-facing picker ignored them (#566) — [Party & Characters](docs/log/fixes/party.md)
- Egress/performance audit: 1 MB of Simulacrum 3D code and 590 kB of PDF code were statically preloaded on every page — 4.9 MB → 3.3 MB initial JS — [Infrastructure](docs/log/fixes/infra.md)
- Ten always-mounted generator panels plus the chat widget fetched their full data sets on every DM page load — [Infrastructure](docs/log/fixes/infra.md)
- FocalImage ran smartcrop at mount, downloading every image on the page and defeating its own loading="lazy" — [Images & Art](docs/log/fixes/images.md)
- LocationCard pulled a 400 px variant for a 56 px avatar, and LocationList rendered every card at once — [Images & Art](docs/log/fixes/images.md)
- Players kept reaching for refresh because realtime payloads triggered HTTP refetches and player channels could not heal gaps (#579) — [Collaboration](docs/log/fixes/collaboration.md)
- Every player-portal locations read had been failing since July 26 — third stale-projection inci… — [Player Portal](docs/log/fixes/players.md)
