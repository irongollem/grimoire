# Bugs

> **This is a pointer file.** The resolved-bug history is a curated **log**, split by
> subsystem under [`docs/log/fixes/`](docs/log/fixes/) — full index in
> [`docs/log/index.md`](docs/log/index.md). Open bugs live in GitHub issues on
> `irongollem/grimoire`, **not here**.
>
> **When you fix a bug:** append a one-line `- [x]` entry (root cause + fix) to the
> top of the matching [`docs/log/fixes/<subsystem>.md`](docs/log/fixes/) file, then
> close the GitHub issue if one exists.

## Fix log by subsystem  ·  298 resolved

| Subsystem | Fixes | | Subsystem | Fixes |
| --- | ---: | --- | --- | ---: |
| [Campaign](docs/log/fixes/campaign.md) | 12 | | [Atlas & Locations](docs/log/fixes/atlas.md) | 15 |
| [Collaboration](docs/log/fixes/collaboration.md) | 7 | | [Cartographer & VTT](docs/log/fixes/cartographer.md) | 1 |
| [Player Portal](docs/log/fixes/players.md) | 8 | | [Chat & Dice](docs/log/fixes/chat.md) | 10 |
| [Rules Reliquary](docs/log/fixes/rules.md) | 1 | | [Images & Art](docs/log/fixes/images.md) | 10 |
| [Content & Import](docs/log/fixes/content.md) | 9 | | [Publishing & Export](docs/log/fixes/publishing.md) | 23 |
| [Monsters & Bestiary](docs/log/fixes/monsters.md) | 12 | | [UI & Layout](docs/log/fixes/ui.md) | 12 |
| [NPCs & Companions](docs/log/fixes/npcs.md) | 15 | | [Database & Security](docs/log/fixes/database.md) | 17 |
| [Items & Workshop](docs/log/fixes/items.md) | 26 | | [AI Generation](docs/log/fixes/ai.md) | 10 |
| [Spells](docs/log/fixes/spells.md) | 6 | | [Billing](docs/log/fixes/billing.md) | 5 |
| [Factions](docs/log/fixes/factions.md) | 3 | | [Infrastructure](docs/log/fixes/infra.md) | 13 |
| [Encounters & Combat](docs/log/fixes/encounters.md) | 25 | | [Soundboard](docs/log/fixes/soundboard.md) | 19 |
| [Quests](docs/log/fixes/quests.md) | 13 | | [Miscellaneous](docs/log/fixes/misc.md) | 1 |
| [Party & Characters](docs/log/fixes/party.md) | 25 | | | |

## Latest fixes

- `20260730000010` could never apply to a fresh database — it dropped columns before the policies that d… — [Database & Security](docs/log/fixes/database.md)
- `db:pull` regenerated a seed that could not be loaded — its exclusion list missed migration-owned tabl… — [Database & Security](docs/log/fixes/database.md)
- CI could never run the test suite — `.env.local` was a hidden prerequisite; Vitest now carries its o… — [Infrastructure](docs/log/fixes/infra.md)
- `npm run seed-srd-monsters` would have broken on #584's migration — it still filtered on the dropped `is_canonical` column — [Content & Import](docs/log/fixes/content.md)
- Deleting a campaign with campaign-scoped homebrew failed with a raw FK violation; the DM now chooses promote-vs-delete (#585) — [Campaign](docs/log/fixes/campaign.md)
- Canonical SRD art was owned by an account — `srd_spell_art` cascaded, so deleting it would have wiped all 96 canonical rows (#584) — [Database & Security](docs/log/fixes/database.md)
- 11 player notes were invisible since companion/party-member notes moved to `entity_notes` and never migrated (#587) — [Database & Security](docs/log/fixes/database.md)
- `party_inventory_dm_all` permitted nothing its own member siblings didn't — provably redundant, dropped (#586) — [Database & Security](docs/log/fixes/database.md)
- Three views rendered a spell attack/save-DC override nothing could ever set (#589) — [Spells](docs/log/fixes/spells.md)
- Deleted two pre-canonical SRD importers with no UI entry point (#589) — [Content & Import](docs/log/fixes/content.md)
- Drag-to-reorder issued one UPDATE per row, and the same fan-out was copy-pasted into five composables (#588) — [Infrastructure](docs/log/fixes/infra.md)
