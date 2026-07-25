# Bugs

> **This is a pointer file.** The resolved-bug history is a curated **log**, split by
> subsystem under [`docs/log/fixes/`](docs/log/fixes/) — full index in
> [`docs/log/index.md`](docs/log/index.md). Open bugs live in GitHub issues on
> `irongollem/grimoire`, **not here**.
>
> **When you fix a bug:** append a one-line `- [x]` entry (root cause + fix) to the
> top of the matching [`docs/log/fixes/<subsystem>.md`](docs/log/fixes/) file, then
> close the GitHub issue if one exists.

## Fix log by subsystem  ·  249 resolved

| Subsystem | Fixes | | Subsystem | Fixes |
| --- | ---: | --- | --- | ---: |
| [Campaign](docs/log/fixes/campaign.md) | 11 | | [Party & Characters](docs/log/fixes/party.md) | 23 |
| [Collaboration](docs/log/fixes/collaboration.md) | 5 | | [Atlas & Locations](docs/log/fixes/atlas.md) | 15 |
| [Player Portal](docs/log/fixes/players.md) | 7 | | [Cartographer & VTT](docs/log/fixes/cartographer.md) | 1 |
| [Rules Reliquary](docs/log/fixes/rules.md) | 1 | | [Chat & Dice](docs/log/fixes/chat.md) | 10 |
| [Content & Import](docs/log/fixes/content.md) | 4 | | [Images & Art](docs/log/fixes/images.md) | 8 |
| [Monsters & Bestiary](docs/log/fixes/monsters.md) | 12 | | [Publishing & Export](docs/log/fixes/publishing.md) | 23 |
| [NPCs & Companions](docs/log/fixes/npcs.md) | 14 | | [UI & Layout](docs/log/fixes/ui.md) | 13 |
| [Items & Workshop](docs/log/fixes/items.md) | 26 | | [Database & Security](docs/log/fixes/database.md) | 9 |
| [Spells](docs/log/fixes/spells.md) | 5 | | [AI Generation](docs/log/fixes/ai.md) | 9 |
| [Factions](docs/log/fixes/factions.md) | 3 | | [Billing](docs/log/fixes/billing.md) | 5 |
| [Encounters & Combat](docs/log/fixes/encounters.md) | 22 | | [Infrastructure](docs/log/fixes/infra.md) | 8 |
| [Quests](docs/log/fixes/quests.md) | 13 | | [Miscellaneous](docs/log/fixes/misc.md) | 2 |

## Latest fixes

- Live campaign state could get permanently stranded on stale data after a realtime gap — a playe… — [Campaign](docs/log/fixes/campaign.md)
- A character sheet's "Choices" card showed a bogus "Noncantrip Spell Turn" row whose value was a… — [Player Portal](docs/log/fixes/players.md)
- Loot dropped into campaign chat lost its "grabbed by X" indicator after a player claimed part o… — [Items & Workshop](docs/log/fixes/items.md)
- Roster NPCs in an encounter no longer got marked dead when they fell, nor revealed to players w… — [Monsters & Bestiary](docs/log/fixes/monsters.md)
- A player firing a ranged weapon from their own character sheet never depleted their ammunition … — [Encounters & Combat](docs/log/fixes/encounters.md)
- A PC's temporary HP was invisible during an encounter and got silently wiped — and Wild Shape d… — [Encounters & Combat](docs/log/fixes/encounters.md)
- Clicking a monster's ability score or saving throw on `/monsters/:id` did nothing — the hover t… — [Monsters & Bestiary](docs/log/fixes/monsters.md)
- The encounter runner's "Roll Initiative" ignored physical-dice mode and clobbered initiatives t… — [Encounters & Combat](docs/log/fixes/encounters.md)
- Wild Shape showed "no eligible forms" for every druid below level 8 — third distinct piece of #… — [Monsters & Bestiary](docs/log/fixes/monsters.md)
- Player Bestiary showed every discovered creature as "Unknown creature" — two independent bugs s… — [Player Portal](docs/log/fixes/players.md)
