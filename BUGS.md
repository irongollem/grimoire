# Bugs

> **This is a pointer file.** The resolved-bug history is a curated **log**, split by
> subsystem under [`docs/log/fixes/`](docs/log/fixes/) — full index in
> [`docs/log/index.md`](docs/log/index.md). Open bugs live in GitHub issues on
> `irongollem/grimoire`, **not here**.
>
> **When you fix a bug:** append a one-line `- [x]` entry (root cause + fix) to the
> top of the matching [`docs/log/fixes/<subsystem>.md`](docs/log/fixes/) file, then
> close the GitHub issue if one exists.

## Fix log by subsystem  ·  282 resolved

| Subsystem | Fixes | | Subsystem | Fixes |
| --- | ---: | --- | --- | ---: |
| [Campaign](docs/log/fixes/campaign.md) | 11 | | [Atlas & Locations](docs/log/fixes/atlas.md) | 15 |
| [Collaboration](docs/log/fixes/collaboration.md) | 7 | | [Cartographer & VTT](docs/log/fixes/cartographer.md) | 1 |
| [Player Portal](docs/log/fixes/players.md) | 8 | | [Chat & Dice](docs/log/fixes/chat.md) | 10 |
| [Rules Reliquary](docs/log/fixes/rules.md) | 1 | | [Images & Art](docs/log/fixes/images.md) | 10 |
| [Content & Import](docs/log/fixes/content.md) | 7 | | [Publishing & Export](docs/log/fixes/publishing.md) | 23 |
| [Monsters & Bestiary](docs/log/fixes/monsters.md) | 12 | | [UI & Layout](docs/log/fixes/ui.md) | 12 |
| [NPCs & Companions](docs/log/fixes/npcs.md) | 14 | | [Database & Security](docs/log/fixes/database.md) | 9 |
| [Items & Workshop](docs/log/fixes/items.md) | 26 | | [AI Generation](docs/log/fixes/ai.md) | 10 |
| [Spells](docs/log/fixes/spells.md) | 5 | | [Billing](docs/log/fixes/billing.md) | 5 |
| [Factions](docs/log/fixes/factions.md) | 3 | | [Infrastructure](docs/log/fixes/infra.md) | 11 |
| [Encounters & Combat](docs/log/fixes/encounters.md) | 25 | | [Soundboard](docs/log/fixes/soundboard.md) | 19 |
| [Quests](docs/log/fixes/quests.md) | 13 | | [Miscellaneous](docs/log/fixes/misc.md) | 1 |
| [Party & Characters](docs/log/fixes/party.md) | 24 | | | |

## Latest fixes

- Egress/performance audit: 1 MB of Simulacrum 3D code and 590 kB of PDF code were statically preloaded on every page — 4.9 MB → 3.3 MB initial JS — [Infrastructure](docs/log/fixes/infra.md)
- Ten always-mounted generator panels plus the chat widget fetched their full data sets on every DM page load — [Infrastructure](docs/log/fixes/infra.md)
- FocalImage ran smartcrop at mount, downloading every image on the page and defeating its own loading="lazy" — [Images & Art](docs/log/fixes/images.md)
- LocationCard pulled a 400 px variant for a 56 px avatar, and LocationList rendered every card at once — [Images & Art](docs/log/fixes/images.md)
- Players kept reaching for refresh because realtime payloads triggered HTTP refetches and player channels could not heal gaps (#579) — [Collaboration](docs/log/fixes/collaboration.md)
- Every player-portal locations read had been failing since July 26 — third stale-projection inci… — [Player Portal](docs/log/fixes/players.md)
- The provider-registry test crashed CI at import — it pulled the real supabase client into an en… — [Soundboard](docs/log/fixes/soundboard.md)
- Dragging a card lit every page tab, and the moved/deleted card lingered until the DB replied — … — [Soundboard](docs/log/fixes/soundboard.md)
- A "looping" bed died on its second pass — the gapless pair only ever swapped once (#572) — the … — [Soundboard](docs/log/fixes/soundboard.md)
- Designer round-2 review: two ground-rule breaks and a find/replace that leaked into copy (#572)… — [Soundboard](docs/log/fixes/soundboard.md)
