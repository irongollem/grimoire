# Campaign Notes & Calendar

## Working on this feature? Start here

Read these five files first — they cover the entire data and component surface:

1. `src/types/notes.types.ts` — `Note`, `NoteCategory`, `NoteInsert`, `NoteUpdate`
2. `src/types/calendar.types.ts` — `CalendarEvent`, `CalendarEventType`, `HarptosDate`, `CalendarAdapter`, `CalendarEventInsert`, `CalendarEventUpdate`, `LinkedEntityType`
3. `src/composables/useNotes.ts` — all note CRUD composables
4. `src/composables/useCalendarEvents.ts` — all calendar event CRUD composables plus entity-pin helpers
5. `src/components/notes/NoteEditor.vue` — the main editor; contains session calendar sync logic and all special integrations

---

## Notes Feature

### Routes

| Route         | Name          | Component                            | Access                  |
| ------------- | ------------- | ------------------------------------ | ----------------------- |
| `/notes`      | `notes`       | `src/views/notes/NotesView.vue`      | DM (requiresAuth)       |
| `/notes/new`  | `note-new`    | `src/views/notes/NoteDetailView.vue` | DM                      |
| `/notes/:id`  | `note-detail` | `src/views/notes/NoteDetailView.vue` | DM                      |
| `/play/notes` | `play-notes`  | `src/views/play/PlayerNotesView.vue` | Player (requiresPlayer) |

### Database Table: `notes`

Key columns:

| Column                         | Type                      | Notes                                 |
| ------------------------------ | ------------------------- | ------------------------------------- |
| `id`                           | uuid PK                   |                                       |
| `user_id`                      | uuid FK → auth.users      | DM owner                              |
| `campaign_id`                  | uuid FK → campaigns       | nullable; scoped to active campaign   |
| `title`                        | text                      | required, default 'Untitled Note'     |
| `content`                      | text                      | Tiptap JSON string (not HTML)         |
| `category`                     | text                      | see `NoteCategory`                    |
| `tags`                         | text[]                    | free-form, GIN-indexed                |
| `session_num`                  | integer                   | session category only                 |
| `is_pinned`                    | boolean                   | floats to top of list                 |
| `player_visible_to`            | uuid[]                    | party_member IDs; empty = DM-only     |
| `session_start_year/month/day` | integer                   | in-game start date (session category) |
| `session_end_year/month/day`   | integer                   | in-game end date (optional)           |
| `session_real_date`            | text                      | real-world "YYYY-MM-DD"               |
| `linked_calendar_event_id`     | uuid FK → calendar_events | auto-managed; null on event delete    |

**RLS (current):** `auth.uid() = user_id` gives DM full access. Players select where their `party_member_id` is in `player_visible_to`:

```sql
create policy "notes_select" on notes for select using (
  auth.uid() = user_id
  or (
    campaign_id is not null
    and campaign_id in (select campaign_id from campaign_members where user_id = auth.uid())
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = auth.uid()
        and cm.campaign_id = notes.campaign_id
        and cm.party_member_id = any(notes.player_visible_to)
    )
  )
);
```

### TypeScript Types — `src/types/notes.types.ts`

```ts
type NoteCategory = "general" | "session" | "lore" | "location" | "quest" | "faction";
interface Note { id, user_id, campaign_id, title, content, category, tags, session_num, is_pinned,
                  player_visible_to, session_start_year/month/day, session_end_year/month/day,
                  session_real_date, linked_calendar_event_id, created_at, updated_at }
type NoteInsert = Omit<Note, "id" | "user_id" | "created_at" | "updated_at">
type NoteUpdate = Partial<NoteInsert>
```

### Composables — `src/composables/useNotes.ts`

TanStack Query key: `"notes"`.

| Export                     | Returns                  | Description                                              |
| -------------------------- | ------------------------ | -------------------------------------------------------- |
| `useNotes()`               | `UseQueryResult<Note[]>` | All notes for active campaign, ordered `updated_at DESC` |
| `useNote(id: Ref<string>)` | `UseQueryResult<Note>`   | Single note by ID                                        |
| `useCreateNote()`          | `UseMutationResult`      | `mutationFn: (note: Omit<NoteInsert, "campaign_id">)`    |
| `useUpdateNote()`          | `UseMutationResult`      | `mutationFn: ({ id, update })`                           |
| `useDeleteNote()`          | `UseMutationResult`      | `mutationFn: (id: string)`                               |

All mutations call `queryClient.invalidateQueries({ queryKey: ["notes"] })` on success.

### View Components

**`src/views/notes/NotesView.vue`**

- Uses `useQuota("notes")` — shows `PaywallModal` (from `src/components/common/PaywallModal.vue`) when `canCreate` is false
- Renders `NotesList` inside `ListPageLayout`

**`src/views/notes/NoteDetailView.vue`**

- `isNew`: `route.name === "note-new"`
- `isEditing`: `route.query.edit === "true"`
- Renders `NoteEditor` when new or editing, `NoteSheet` when viewing
- Uses `useNote(id)` for data fetch

### UI Components

**`src/components/notes/NotesList.vue`**

- Consumes `useNotes()` and `useQuota("notes")`
- Client-side filtering: free-text search (title + tags), category pill buttons
- Sort: pinned-first, then `updated_at DESC`
- Category colour map: `general=#6b7280`, `session=#2563eb`, `lore=#7c3aed`, `location=#059669`, `quest=#d97706`, `faction=#dc2626`
- Content preview via `extractTiptapText(note.content)` from `src/lib/utils.ts`
- Filter state is stored in local `ref`s (not `useUiStore`) — this is the one exception to the filter-in-store rule because it is a very simple two-field filter

**`src/components/notes/NoteEditor.vue`**

All note creation and editing happens here. Key integrations:

1. **`RichTextEditor`** (`src/components/common/RichTextEditor.vue`) — full editor with all extensions; uses `allow-calendar-events` prop and `@insert-calendar-event` event to enable the calendar toolbar button

2. **`InlineCalendarEventModal`** (`src/components/calendar/InlineCalendarEventModal.vue`) — triggered by the calendar toolbar button; on `@event-created` calls `rteRef.value?.insertCalendarEventRef(...)` to embed a `CalendarEventRef` chip in the note body

3. **`PlayerVisibilityToggle`** (`src/components/common/PlayerVisibilityToggle.vue`) — controls `player_visible_to: string[]` (party member IDs). When a note is newly shared on save, `sendCampaignAnnouncement` from `src/composables/useCampaignBroadcast.ts` broadcasts a message to players

4. **Session date sync — `syncSessionCalendarEvent(noteId)`** — called after every save when `category === "session"`:
   - If start date is present: creates or updates a `session`-type calendar event (colour `#C9920A`) linked to the note via `linked_note_id`; patches note's `linked_calendar_event_id`
   - If start date removed: deletes the linked calendar event and clears `linked_calendar_event_id`
   - Insert order avoids circular FK: insert note first (no linked event) → insert event with `linked_note_id` → patch note
5. **Session date pre-fill** — `watch(category)` fires on mount; when creating a new session note it reads `useNotes()` data, finds the highest `session_num`, and pre-fills start date from that note's end date (or start date as fallback)

6. **`TagInput`** (`src/components/common/TagInput.vue`) for the `tags` field

7. **VueDatePicker** (`@vuepic/vue-datepicker`) for `session_real_date` — stored as "YYYY-MM-DD" string; two-way computed converts to/from `Date`

8. **Chronicler AI image generation** (DM-only, shown when `campaign.activeCampaign.image_provider === "openai"`):
   - `ChroniclerGenerateDialog` (`src/components/notes/ChroniclerGenerateDialog.vue`) — AI scene illustration using `useChroniclerImages` composable (`src/composables/useChroniclerImages.ts`)
   - `ChroniclerLibraryPicker` (`src/components/notes/ChroniclerLibraryPicker.vue`) — browse and insert previously generated images
   - Both call `rteRef.value?.insertImageAtCursor(url)` on the editor ref

9. **Image cleanup** — on update, calls `cleanupRemovedRichTextImages(oldContent, newContent)` from `src/composables/useImageUpload.ts`; on delete, calls `removeRichTextImages(content)`

**`src/components/notes/NoteSheet.vue`**

- Read-only view; shows metadata badges + `RichTextViewer` content
- "Edit" button pushes `?edit=true` to query params; "Delete" uses `useDeleteNote()` + `removeRichTextImages`

**Post-mutation navigation:**

- Create → `router.replace("/notes/:id")` (lands on view mode)
- Save → `router.push("/notes")`
- Delete → `router.push("/notes")`

### Player-Facing Notes View — `src/views/play/PlayerNotesView.vue`

- Uses `useNotes()` — Supabase RLS filters automatically; only notes with the player's `party_member_id` in `player_visible_to` are returned
- Read-only accordion list: pinned-first sort, expand to `RichTextViewer`
- No create/edit/delete capability for players

---

## Player Adventure Journal

Separate from DM notes — entirely player-owned.

### Route

`/play/journal` (embedded tab in player portal, `requiresPlayer`)
View: `src/views/play/PlayerJournalView.vue`

### Database Table: `player_journal_entries`

Key columns: `id`, `user_id`, `campaign_id`, `title`, `content` (Tiptap JSON), `category`, `tags`, `is_private` (bool, default true), `ref_type`, `ref_id`, `ref_label`, `created_at`, `updated_at`.

### TypeScript Types — `src/composables/usePlayerJournal.ts`

Types are defined inline in the composable file (not a separate `.types.ts`):

```ts
type JournalCategory =
  | "adventure"
  | "clue"
  | "discovery"
  | "session"
  | "character"
  | "rumor";
type JournalRefType =
  | "quest"
  | "npc"
  | "location"
  | "item"
  | "monster"
  | "encounter";
interface PlayerJournalEntry {
  id;
  user_id;
  campaign_id;
  title;
  content;
  category;
  tags;
  is_private;
  ref_type;
  ref_id;
  ref_label;
  created_at;
  updated_at;
}
```

### Composables — `src/composables/usePlayerJournal.ts`

TanStack Query key: `"player_journal"`.

| Export                      | Returns                                | Description                                        |
| --------------------------- | -------------------------------------- | -------------------------------------------------- |
| `useMyJournalEntries()`     | `UseQueryResult<PlayerJournalEntry[]>` | Current user's own entries, `created_at DESC`      |
| `useSharedJournalEntries()` | `UseQueryResult<PlayerJournalEntry[]>` | Other players' non-private entries                 |
| `useCreateJournalEntry()`   | `UseMutationResult`                    | `mutationFn: (entry: Omit<Insert, "campaign_id">)` |
| `useUpdateJournalEntry()`   | `UseMutationResult`                    | `mutationFn: ({ id, update })`                     |
| `useDeleteJournalEntry()`   | `UseMutationResult`                    | `mutationFn: (id: string)`                         |

`JOURNAL_CATEGORIES` and `JOURNAL_CATEGORY_LIST` are exported constants for colour/label display. `is_private = true` entries are filtered by RLS; players cannot see other players' private entries.

---

## Calendar Feature

### Route

| Route       | Name       | Component                             | Access            |
| ----------- | ---------- | ------------------------------------- | ----------------- |
| `/calendar` | `calendar` | `src/views/calendar/CalendarView.vue` | DM (requiresAuth) |

No player-facing calendar route exists in the player portal.

### Database Table: `calendar_events`

Key columns:

| Column                | Type                 | Notes                   |
| --------------------- | -------------------- | ----------------------- |
| `id`                  | uuid PK              |                         |
| `user_id`             | uuid FK → auth.users |                         |
| `campaign_id`         | uuid FK → campaigns  |                         |
| `title`               | text                 | required                |
| `description`         | text                 | Tiptap JSON (optional)  |
| `event_type`          | text                 | see `CalendarEventType` |
| `harptos_year`        | integer              | required                |
| `harptos_month`       | integer              | null for festival days  |
| `harptos_day`         | integer              | null for festival days  |
| `festival_day`        | text                 | null for regular days   |
| `is_multi_day`        | boolean              |                         |
| `end_year/month/day`  | integer              | multi-day end date      |
| `color`               | text                 | hex string              |
| `linked_quest_id`     | uuid FK → quests     | on delete cascade       |
| `linked_encounter_id` | uuid FK → encounters | on delete cascade       |
| `linked_location_id`  | uuid FK → locations  | on delete cascade       |
| `linked_note_id`      | uuid FK → notes      | on delete set null      |

**RLS:** Standard four-policy pattern (`auth.uid() = user_id`). No player read access — the calendar is DM-only.

### TypeScript Types — `src/types/calendar.types.ts`

```ts
type CalendarEventType =
  | "campaign"
  | "world"
  | "session"
  | "festival"
  | "deadline"
  | "player_death"
  | "boss_fight"
  | "discovery"
  | "npc_death"
  | "travel"
  | "quest"
  | "encounter"
  | "location";
type LinkedEntityType = "quest" | "encounter" | "location";
interface CalendarEvent {
  id;
  user_id;
  campaign_id;
  title;
  description;
  event_type;
  harptos_year;
  harptos_month;
  harptos_day;
  festival_day;
  is_multi_day;
  end_year;
  end_month;
  end_day;
  color;
  linked_quest_id;
  linked_encounter_id;
  linked_location_id;
  linked_note_id;
  travel_party_member_ids;
  created_at;
  updated_at;
}
interface HarptosDate {
  year;
  month;
  day;
  festival_day;
}
type CalendarEventInsert = Omit<
  CalendarEvent,
  "id" | "user_id" | "created_at" | "updated_at" | "linked_note_id"
> & { linked_note_id?: string | null };
type CalendarEventUpdate = Partial<CalendarEventInsert>;
```

Helper functions (also in `calendar.types.ts`):

- `linkedEntityType(event): LinkedEntityType | null` — returns which FK is set
- `linkedEntityId(event): string | null` — returns the ID of the linked entity

### Composables — `src/composables/useCalendarEvents.ts`

TanStack Query key: `"calendar-events"`.

| Export                                                                                     | Description                                                                      |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `useCalendarEvents(year: MaybeRef<number>)`                                                | Events for a single year in the active campaign                                  |
| `useCalendarEventsRange(startYear, endYear: MaybeRef<number>)`                             | Events across a year range (used by timeline)                                    |
| `useEntityCalendarEvents(entityType: MaybeRef<LinkedEntityType>, entityId: MaybeRef<string | null>)`                                                                          | Events pinned to a specific quest/encounter/location               |
| `useCreateCalendarEvent()`                                                                 | `mutationFn: (event: CalendarEventInsert)` — injects `campaign_id` automatically |
| `useUpdateCalendarEvent()`                                                                 | `mutationFn: ({ id, update: CalendarEventUpdate })`                              |
| `useDeleteCalendarEvent()`                                                                 | `mutationFn: (id: string)`                                                       |
| `useCalendarEventById(id: MaybeRef<string                                                  | null>)`                                                                          | Single event by UUID; `staleTime: 5min`; returns `null` if deleted |
| `useLinkedNoteCalendarEvent(noteId: MaybeRef<string                                        | null>)`                                                                          | Event linked to a specific note via `linked_note_id`               |

### Pinia Store — `src/stores/calendar.ts`

`useCalendarStore()` — persisted to `localStorage` under key `grimoire_calendar_position`.

Key state and actions:

| Property/Method                      | Type                        | Description                                                       |
| ------------------------------------ | --------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| `activeCalendarId`                   | `ref<string>`               | Active adapter ID (e.g. `"faerun"`)                               |
| `view`                               | `ref<CalendarView>`         | `"month"` or `"timeline"`                                         |
| `currentYear`                        | `ref<number>`               | Currently displayed year                                          |
| `currentMonth`                       | `ref<number>`               | Currently displayed month (1-indexed)                             |
| `adapter`                            | `computed<CalendarAdapter>` | Active `CalendarAdapter` from registry                            |
| `timelineZoom`                       | `ref<TimelineZoom>`         | Number of years shown in timeline                                 |
| `highlightedEventId`                 | `ref<string                 | null>`                                                            | For CalendarEventRef chip navigation |
| `prevMonth()` / `nextMonth()`        | fn                          | Navigate one month                                                |
| `goToYear(year)`                     | fn                          | Jump to year                                                      |
| `goToMonth(year, month)`             | fn                          | Jump to specific month                                            |
| `setView(v: CalendarView)`           | fn                          | Switch month/timeline view                                        |
| `setCalendar(id)`                    | fn                          | Switch calendar adapter                                           |
| `loadFromCampaign(calendarId, year)` | fn                          | Called by campaign store on campaign switch                       |
| `setHighlightedEvent(id)`            | fn                          | Highlights an event after navigation from a CalendarEventRef chip |

Exported type: `CalendarView = "month" | "timeline"`.

### Calendar Adapter Pattern

All calendar adapters live in `src/settings/index.ts` (not directly in `src/calendars/`).

`src/calendars/index.ts` just re-exports from settings:

```ts
export {
  CALENDAR_REGISTRY,
  getCalendarAdapter,
  listCalendarAdapters,
} from "@/settings/index";
```

`src/settings/index.ts` builds `CALENDAR_REGISTRY` from all registered `DndSettingDef` objects plus the standalone `gregorianAdapter` from `src/calendars/gregorian.ts`.

Currently registered setting IDs: `faerun`, `eberron`, `greyhawk`, `dragonlance`, `ravenloft`, `planescape`, `spelljammer`, `darksun`, `mystara`, `gregorian`.

**To add a new calendar:** Create `src/settings/<name>.ts` exporting a `DndSettingDef`, then add it to the map in `src/settings/index.ts`. The adapter is automatically included in `CALENDAR_REGISTRY`.

`CalendarAdapter` interface (from `src/types/calendar.types.ts`):

```ts
interface CalendarAdapter {
  id: string; // registry key
  name: string; // display name
  epochName: string; // e.g. "DR"
  defaultYear: number;
  months: CalendarMonth[]; // { num, name, alias?, days }
  intercalaryDays: IntercalaryDay[]; // { name, afterMonth, description, isLeapOnly? }
  weekSize: number; // 10 for tenday (Harptos), 7 for Gregorian
  dayLabels?: string[]; // column headers (Gregorian only)
  weekRowNames?: string[]; // row labels (e.g. "First Tenday")
  weekdayOffset?: (year, monthNum) => number; // Gregorian offset
  isLeapYear: (year) => boolean;
  formatDate: (year, month, day, festivalDay) => string;
}
```

### View Components

**`src/views/calendar/CalendarView.vue`**

- Uses `useCalendarStore()` for view state
- Toggles between `CalendarGrid` (month view) and `CalendarTimeline` (chronicle view)
- Manages `EventModal` state: `modalOpen`, `editingEvent: CalendarEvent | null`, `initialDay: number | null`
- "Setting Events" button shows when `calendar.activeCalendarId in SETTING_BUNDLES` (from `src/data/bundles/index.ts`)
- Renders `SettingBundleModal` for batch event import

**`src/components/calendar/CalendarGrid.vue`**

- Reads events via `useCalendarEvents(yearRef)` where `yearRef = toRef(calendar, "currentYear")`
- Grid columns: `grid-cols-7` for 7-day adapters; `grid-cols-5 md:grid-cols-10` for 10-day (Harptos)
- Emits: `"edit-event": [event: CalendarEvent]`, `"create-event": [day: number]`
- Linked-entity events use `linkedEntityType()` / `linkedEntityId()` helpers to build `RouterLink` targets (`/quests/:id`, `/encounters/:id`, `/locations/:id`)

**`src/components/calendar/CalendarTimeline.vue`**

- Uses `useCalendarEventsRange(startYear, endYear)` for the visible window
- Zoom presets drive `startYear`/`endYear` range
- Session events rendered in a dedicated strip; regular events use lane collision-avoidance
- Emits: `"edit-event": [event: CalendarEvent]`

**`src/components/calendar/EventModal.vue`**

- Full CRUD modal for calendar events (create + edit + delete)
- Props: `modelValue: boolean`, `editEvent?: CalendarEvent | null`, `initialDay?: number | null`
- Uses `useCreateCalendarEvent`, `useUpdateCalendarEvent`, `useDeleteCalendarEvent`
- Travel events: uses `EntityCombobox` with `useAllLocations()` for destination; party member checkboxes via `useParty()`; on submit, calls `useUpdatePartyMember` for each selected traveler to update `current_location_id`
- `description` field uses `RichTextEditor`
- 8 preset colours; auto-assigns colour by event type

**`src/components/calendar/InlineCalendarEventModal.vue`**

- Lightweight create-only modal; no edit or travel fields
- Opened from within `NoteEditor` via the calendar toolbar button
- Emits `"event-created": [event: CalendarEvent]` back to the editor
- Editor calls `rteRef.value?.insertCalendarEventRef({ eventId, label, year, month })`

**`src/components/calendar/EntityCalendarSection.vue`**

- Reusable component embedded in quest, encounter, and location detail views
- Props: `entityType: LinkedEntityType`, `entityId: string | null`, `entityName: string`, `compact?: boolean`
- Two display modes: full card (default) and compact inline row (`compact` prop)
- Uses `useEntityCalendarEvents(entityTypeRef, entityIdRef)` to fetch existing pins
- "Pin date" form creates a new event with the correct `linked_*_id` set
- Links route back to calendar via `/calendar?year=X&month=Y`
- Entity type → event type/colour defaults:
  - `quest` → `{ color: "#C9920A", eventType: "quest" }`
  - `encounter` → `{ color: "#7C3AED", eventType: "encounter" }`
  - `location` → `{ color: "#2E7D32", eventType: "location" }`

**`src/components/calendar/SettingBundleModal.vue`**

- Imports pre-authored events from `src/data/bundles/` (currently: `faerun.ts`, `eberron.ts`, `greyhawk.ts`, `dragonlance.ts`)
- Batch-inserts events with a live progress counter

### CalendarEventRef Tiptap Extension

The inline calendar event reference chip is a custom Tiptap node:

- Extension definition: `src/lib/tiptap/CalendarEventRef.ts`
- Vue node view renderer: `src/components/tiptap/CalendarEventRefChip.vue`
- Interface: `CalendarEventRefAttrs { eventId: string, label: string, year: number | null, month: number | null }`
- Inserted via `editor.commands.insertCalendarEventRef(attrs)` or `rteRef.value?.insertCalendarEventRef(attrs)`
- In **viewer mode**: fetches event data via `useCalendarEventById(eventId)`. On click, calls `calendarStore.goToMonth(year, month)` then `calendarStore.setHighlightedEvent(id)` and navigates to `/calendar`
- In **editor mode**: renders as static chip (non-navigable)
- Shows `[event removed]` state with strikethrough when event no longer exists

`RichTextEditor` exposes the calendar event toolbar button only when `allow-calendar-events` prop is set (currently only `NoteEditor` passes it).

---

## Visibility & Access Summary

| Surface                         | DM                                             | Player                                                                                                                  |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Notes list (`/notes`)           | Full CRUD                                      | No access                                                                                                               |
| Note detail (`/notes/:id`)      | Read + Edit + Delete                           | No access                                                                                                               |
| Player notes (`/play/notes`)    | N/A                                            | Read-only; filtered by RLS to `player_visible_to`                                                                       |
| Player journal                  | N/A                                            | Full CRUD on own entries; read shared entries from others                                                               |
| Calendar (`/calendar`)          | Full CRUD                                      | No access                                                                                                               |
| Entity calendar pins            | DM creates/deletes via `EntityCalendarSection` | No access                                                                                                               |
| CalendarEventRef chips in notes | DM inserts via editor                          | Chips visible in shared notes; click navigates DM to calendar (players have no `/calendar` route, chip click would 404) |

---

## Known Patterns and Gotchas

1. **Session note → calendar event circular FK**: Insert note first (no linked event), then insert event with `linked_note_id`, then patch `note.linked_calendar_event_id`. Never try to set both FKs in a single transaction. The `syncSessionCalendarEvent` function in `NoteEditor` handles this correctly.

2. **`player_visible_to` is the sole source of truth**: There is no longer a `shared_with_players` boolean. An empty array means DM-only. Populate with party member UUIDs (not user IDs). The RLS policy enforces this via `cm.party_member_id = any(notes.player_visible_to)`.

3. **Calendar events do not have player-facing RLS**: The `calendar_events` table RLS only allows `auth.uid() = user_id`. Players cannot read calendar events even indirectly. The `CalendarEventRefChip` in viewer mode queries `useCalendarEventById` — this works for DMs but will return null for players (chips show as `[event removed]` state).

4. **CalendarStore position is persisted to localStorage**: `POSITION_KEY = "grimoire_calendar_position"`. Changing the active calendar via `setCalendar()` also resets `currentYear` to `adapter.defaultYear`. The campaign store calls `loadFromCampaign(calendarId, year)` when the active campaign changes.

5. **`content` field is Tiptap JSON string**: Use `RichTextViewer` to display, `RichTextEditor` to edit. Never use `<textarea>`. For content previews, use `extractTiptapText(content)` from `src/lib/utils.ts`.

6. **Filter state in NotesList**: The text search and category filter are in local `ref`s inside `NotesList.vue` (not `useUiStore`). This is the current state — if the filter set grows more complex, migrate to `useUiStore`.

7. **Notes quota**: `useQuota("notes")` checks the `check_quota` RPC. On quota exceeded, show `PaywallModal` with `resource="notes"`. Both `NotesView` and `NoteEditor` do this independently.

8. **Travel events update party member locations**: Submitting an `EventModal` with `event_type === "travel"` calls `useUpdatePartyMember` for every checked traveler, setting `current_location_id` to the selected location.

9. **Setting bundles vs. calendar adapters**: Setting bundles (`src/data/bundles/`) contain pre-authored event data for import. Calendar adapters (`src/settings/`) define the calendar structure (months, festivals, etc.). They are separate concerns — a setting can have a bundle without a calendar adapter and vice versa (though in practice they're paired).

10. **`allow-calendar-events` prop on RichTextEditor**: This prop controls whether the calendar event toolbar button is rendered. Currently only `NoteEditor` passes it. If you add the inline event button to another editor, pass this prop.
