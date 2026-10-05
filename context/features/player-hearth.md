# Hearth: the player's home (#977)

Hearth is the player portal's landing page: route `play` at `/play`, the first
tab in the player nav. It answers what a player needs at a glance, on a phone
first, before and during a game. The character sheet it replaced at `/play`
now lives at `/play/character` (route `play-character`).

The design is the canvas "Hearth: the player dashboard (#977)" on Claude
Design (https://claude.ai/artifact/ByR8Y1aG6Fxf9YadVEFD4o): phone boards for
between sessions, at the table (Lamplight) and first visit, the same two
states on a landscape tablet, the nav bar and the glyph. Open the board before
changing a section's composition.

## Decisions (maintainer, 5 Oct 2026)

- **Name and glyph.** "Hearth", because "Home" is the cross-campaign
  Adventurer's Rest. `IconNavHearth` (`src/lib/icons.ts`) is an interim
  hand-drawn campfire; the maintainer's glyph sheet replaces it through
  `art-src/nav-campaign` (`add-glyph.mjs`), like every other nav glyph.
- **One page, three states, never toggled.** `PlayerHearthView.vue` picks
  first visit (no member), at the table (`usePlayerSessionState().isRunning`,
  the DM's Start session, pushed live through the `campaign_session_state`
  doorbell) or between sessions. The player has no switch.
- **A fixed composition.** Not the DM dashboard's widget grid (#760). A player
  surface on `dashboard_layouts` is a later upgrade, not a missing feature.
- **Tablets are landscape first.** From `lg` (64rem) the sections form three
  columns. The columns are grouped so that their DOM order is also the phone's
  reading order (between: [date, character] [next session, new for you]
  [quests, notes]; at the table: [vitals, spellcasting] [checks] [waiting, right
  now, session notes]). Do not reorder with CSS `order`: focus and screen-reader
  order would stop matching the screen.
- **Checks and saves only.** The Checks section rolls the six abilities, their
  saves and the eighteen skills. Attacks stay on the encounter page and spells
  on the Spellbook. There is ONE roll implementation, shared with the sheet:
  `useCharacterRolls` (Wild Shape scores via `useWildshapeForm`, conditions,
  Exhaustion, roll modes, the toast), `SkillRollList` (immersive whispered
  rolls, the young-player exception) and `AbilityScoreTable`, whose six-across
  layout answers its container's width so it stays three by two in the column.
  Do not copy any of it into a Hearth component.
- **Loot stays in chat.** Players love the drop race. "Waiting for you" only
  points at an open drop, chest or offer from this session (`openTableItems`,
  `src/lib/hearth/waitingItems.ts`) and opens the chat at it
  (`ui.openChatAt`). Never claim from Hearth.
- **RSVP is yes or no.** `session_availability.available` is a boolean; there
  is no "maybe", so Hearth offers "I'm in" / "Can't make it".

## What each section reads

| Section | Source |
| --- | --- |
| In the realm | campaign `today*`, `useCalendarStore().adapter`, `usePlayerCalendarEventsRange`, `weekContainingToday` / `upcomingEvents` (`src/lib/hearth/calendarWeek.ts`, mirrors `CalendarGrid`'s row rule) |
| Character | `useParty()` member (preview-aware, as the sheet resolves it), `characterSummary` (`src/lib/partyMemberDisplay.ts`), `acFor`, `memberInitiativeModifier` (`src/rules/initiative.ts`), `passiveScore` (`src/rules/skillCheck.ts`) |
| Next session | `useSessionProposals`, `useAllSessionAvailability`, `useUpsertAvailability`, `pickNextSession` and friends (`src/lib/calendar/nextSession.ts`, shared with the DM's Next session widget) |
| New for you | `usePlayerUnread().items`: the same lists and the same `isNew` checks as the Journal tab's dot, so the list and the dot cannot disagree |
| Your quests / Right now | `currentBeatsByQuest` (`src/lib/hearth/currentBeats.ts`) over `usePlayerVisibleQuests` + `usePlayerQuestBeats`: the beats a live thread cursor stands on (`is_current`) |
| Your notes | `useMyRecentNotes` (`src/composables/notes/`): the player's own `entity_notes` (scoped by `user_id` and `campaign_id` in the query) merged with `useMyJournalEntries`; names through player-safe projections only, "???" when unknown |
| Live band | session start time, a confirmed proposal dated today for the title, and `combatTurnLine` (`src/lib/hearth/turnLine.ts`) over the shared `liveState` |
| Vitals | `PlayerHpControls` and `PlayerConditions`, the sheet's own controls |
| Spellcasting | `member.concentration` + `useConcentration`, `PlayerSpellSlotStrip` + `useSpellSlotWrite` |
| Checks | `useCharacterRolls` (`src/composables/party/`) + `SkillRollList` + `AbilityScoreTable layout="sheet"`: the character sheet's own paths; pure scores and saves in `src/rules/characterChecks.ts` |
| Waiting for you | unread handouts + `openTableItems(messages, me, startedAt)` |
| Session notes | one `player_journal_entries` row per session (category `session`), found again by `findSessionNote` (`src/lib/hearth/sessionNote.ts`), saved by `useAutosave` |

## Traps

- **Never subscribe to the encounter again.** `usePlayerEncounterLive`'s
  realtime channel is module-level and `PlayerLayout` keeps it open. A second
  caller's unmount closes it for everyone; the live band reads the exported
  `liveState` instead.
- **`:global()` in a scoped style.** Vue compiles `:global(x) .y` to the bare
  `x`. The live band's torn oxblood fill once landed on `:root` that way and
  painted every torn card oxblood. Prefix with a plain `:root[...]` selector.
- **Saved nav orders are ids.** `usePlayerNavPrefs` stores item ids under
  `grimoire_nav_order_v2`; the pre-#977 path list is converted once (old
  `/play` meant Character) and removed.
- **"Your notes" refresh.** Every `entity_notes` mutation in
  `useEntityNotes.ts` also invalidates `["my-recent-entity-notes"]`;
  `entity_notes` is not on the campaign channel.
