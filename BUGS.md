# Bugs

## Done

- [x] Saving an existing location wipes it from the list — `buildPayload()` included `campaign_id: null`, overwriting the row's campaign_id on every update; locations query filters by campaign_id so the row became invisible. Fixed by removing `campaign_id` from the update payload.

- [x] hitting print on cardforge when the chat is open instead sends the chat overlay to the printview
- [x] in tokenforge when clicking download, the downloaded image is only the top left half of the token
- [x] SRD item import creating duplicates on re-run (Supabase 1000-row cap causing dedup check to miss items beyond row 1000)
- [x] Item / monster / spell lists cutting off at ~"P" alphabetically (same 1000-row Supabase default limit, fixed with paginated range queries)
- [x] Print sheets in The Mint showing wrong content (coin sheet showed token sheet on first print after switching — `printMode` ref was updated but `window.print()` fired before Vue flushed the DOM; fixed with `await nextTick()`)
- [x] I cant set my name, it remains set as "unnamed player" and theres no menu or setting to actually name myself
- [x] In player view, rolling shows a popup of my value nicely but doesnt add it to the chat, or at least not directly and I had to refresh. I feel the chat is very finnecky and the live data thing doesnt work that well
- [x] as a playerview, the bottom of the chat (with the actual input elements) is either not rendered, or rendered offscreen below the visible area (100vh instead of 100% perhaps?)
- [x] Quests start and end times don't respect our custom calendar settings — removed the broken Gregorian date inputs; use the calendar pin instead
- [x] The players see everything I link to a quest while I asked for a "shown" indicator for each piece of information so we can release encounters/locations/items etc. piecemeal
- [x] I can only link 1 encounter (and probably same for the other links) to a quest — already supported via quest_refs table (multiple per type)
- [x] money as quest reward is now only a string — added PP/GP/EP/SP/CP currency fields with Drop to Chat + Add to Purse claim flow
- [x] Saving data often fails silently, and chat pushes land in a different window than the one that triggered them — root cause: `navigator.locks` contention across multiple open tabs. Every mutation called `supabase.auth.getUser()` which acquires the lock and makes a network round-trip; when another tab held the lock (e.g. during token refresh) this blocked for up to 5s, causing saves to appear to do nothing. Fixed by replacing all `getUser()` calls with `getSession()` (reads cached token from localStorage, no lock, no network). Also fixed: `campaign_messages` lacked `REPLICA IDENTITY FULL`, so Supabase Realtime couldn't evaluate RLS on WAL events and silently dropped them; added realtime reconnect + visibilitychange re-fetch as belt-and-suspenders.
- [x] players can rename themselves (so i see email or id) — PlayerSettingsView + display_name backfilled from auth.users.email on join/login
- [x] in the settings to assign a character to a player I only see ids so I have no idea which character or player is which — same fix: display_name now populated from email at DB level
- [x] whispers not arriving, only after refresh — realtime WebSocket reconnect on visibilitychange + networkMode:'always'
- [x] all chat only appearing after refresh at players — same realtime fix
- [x] live encounters arent live, they only update the players on a refresh — same realtime fix + usePlayerEncounterLive re-fetch on visibility
- [x] saving in general often seems to hang before even going to a network call. after a refresh it always works, no errors are logged — TanStack Query networkMode:'always' prevents save queuing when browser briefly reports offline on tab focus
- [x] The remote database's migration history does not match local files in supabase/migrations directory, MCP migrations arent stored locally it seems — all MCP migrations now backed by files in supabase/migrations/

- [x] Players cant claim unclaimed party members themselves — "My Character" section added to PlayerSettingsView; shows unclaimed party members (those not claimed by another user), player claims one which sets party_member_id on their campaign_members row
- [x] Location map pins go over the sticky PageHeader when scrolling — PageHeader sticky z-index raised from z-10 to z-20
- [x] Location map pin hover popup unreachable (gap between dot and popup drops hover state) — replaced separate popup with inline pill design; dot expands into pill containing token + name + action buttons, all inside one element with no gap
- [x] Location map image stretches to fill editor width even for small maps — inner container uses w-fit so it hugs image natural size; max-w-full prevents overflow
- [x] Pin color doesn't update when a child location's type is changed — getChildType() does live lookup in children prop, falling back to stored type
- [ ] Players cant build characters themselves
- [x] players that claimed a character still show their name instead of the char name when chatting etc. — useCampaignMessages now uses linked party member's character name as sender_name when available
- [x] the math aint mathing, str 14 gives +3 not +2, dex 17 gives +5 not +3, etc — formula verified correct (Math.floor((score-10)/2)) everywhere; saving throws and skills intentionally add proficiency bonus on top of the raw modifier, which matches the reported values. The ability score block shows only the raw modifier; saving throws and skills show mod+proficiency by design.
- [x] in the whisper I only see "player" so I have no idea who's who — display_name is now populated from email at DB level; whisper dropdown shows display_name
- [x] claiming of items not always working — two root causes fixed: (1) `currency_drop` type was missing from DB check constraint so currency drop messages failed silently; (2) `claimItemDrop`/`claimCurrencyDrop` swallowed DB errors, so `addInventoryItem` ran even on failed claims. Now both throw on error and inventory is only added after a successful claim.
- [x] refreshing a live encounter resets it — watch in EncounterRunView now includes liveStateLoaded in deps; initStore() is gated until the DB fetch completes so hydrateFromLive always wins over a fresh reset on page refresh
- [x] in encounters the custom name on a monster gets reset/removed as soon as you click somewhere else — form watch now keyed on encounter id, not full encounter object; no longer resets on TanStack refetch
- [x] (css)themes dont propagate to the players as intended — added campaigns_member_select RLS so players can read their campaign row; PlayerLayout now loads campaign via useCampaignById and calls switchToCampaign (applies theme + calendar); also sets activeCampaignId from membership for first-time players who have no localStorage entry
- [x] quest kanban board doesnt allow dragging cards around — implemented HTML5 drag-and-drop; dragging a card to another column calls useUpdateQuest to update status; active column highlighted during drag; dragged card fades; click still navigates to quest
- [x] DM should be able to delete ALL messages in the chat, not just their own; and delete all at once — DM delete button shown on all messages; trash icon in header clears entire chat; DB RLS updated to allow DM deletes
- [x] public notes on a quest or so done by party members to share with each other are not seen by me — added "Party Notes" section to QuestEditor (DM view) using useSharedQuestNotes; shows all non-private player notes for that quest
- [x] currency drops in chat dont have a claim button so they cant be claimed like items — "Add to Purse" button was already present; coins added to linked party member purse on claim
- [x] when adding an npc to an encounter, it defaults to ally even though ally/neutral/enemy is a field set on the NPC prior — addNpcToCombatants now maps npc.relationship to faction_id
- [x] saving an NPC sometimes does nothing, nothing on the network tab, no error, just hangs — resolved by networkMode:'always' (TanStack Query) + try-catch in NpcDetail.save() so errors surface
- [x] NPC locations are string fields, even though we have actual locations, by linking that proper we can also view all NPC's associated with a location when viewing that location, and also filter NPC's by location in the NPC list
- [x] when saving succeeds on an NPC, sometimes it goes back to list, but sometimes it doesnt. — added try-catch in NpcDetail.save(); errors now notify instead of swallowing the router.push
- [x] adding creatures to the quest only shows custom creatures, none of the SRD ones — by design per user: SRD creatures are managed through encounters, not linked directly to quests
- [x] when an encounter is part of a quest, that quest isn't shown on the encounter — added "Part of Quest" section to EncounterDetail right column; reverse-lookup via quest_refs (useQuestsForEncounter composable)
- [x] when an encounter is finished, it should be marked as such so we can filter against it — added is_finished column; "Mark Done/Reopen" button in encounter detail; list defaults to hiding finished with a toggle
- [x] deleting an encounter doesn't make you go back to the list — router.push("/encounters") was already there but could be skipped if mutateAsync threw; wrapped in try/catch so navigation always fires
- [x] link encounters and locations so that adding an encounter, also adds the location to the quest and looking at either shows the other — location_id FK added to encounters; encounter detail has location picker; LocationEditor shows NPCs and encounters at that location
- [x] Monster alignment is a stringfield so should be a dropdown with an enum — replaced text input with select using the same ALIGNMENTS list as NPC detail
- [x] by default quest things should be hidden until shown instead of shown unless hidden — added quest_refs.is_player_visible column (default false) + player SELECT policy requiring both the quest and ref to be visible; DM eye-toggle already existed and now persists to DB
- [x] adding items to quests work, but adding them to encounters is probably better — added item_ids uuid[] column to encounters; "Loot" section in EncounterDetail lets DM link/unlink vault items; item_ids saved with encounter
- [x] creating a new monster keeps the create window open. Clicking the create button twice or more, creates two or more entities with the same data — after create, navigate to /monsters list (same as update) instead of router.replace to detail page; the detail page reload during loading caused props.monster=null flash, re-enabling the create form
- [x] A dm cant delete an SRD monster from their campaign or hide them, making them a nuisance in the encounter builder where they have the exact same name as the custom monsters — excluded_monster_ids uuid[] added to campaigns; hide button per monster in encounter builder search results; hidden monsters filtered from filteredMonsters
- [x] de chat moet niet hover zijn van 100vh - eventuele balken in scrollen van binnen — PlayerLayout uses h-dvh + min-h-0; chat aside uses min-h-0 instead of h-full sticky
- [x] you enabled calendar picker on the calendar itself, but choosing a calendar type is quite inpactful and should only be available on the campaign settingsblock where it was before

- [x] infinite spinner / no network requests after idle — `onAuthStateChange` callback called `loadMembership()` (→ `supabase.from()` → `getSession()`) while supabase-js still held the exclusive `navigator.locks` lock for the auth state notification. Fix: make the callback synchronous, defer `loadMembership` via `setTimeout(fn, 0)` so it runs after the lock is released.
- [x] entity combobox (reward items, locations, NPCs, etc.) dropdown not appearing when typing — dropdown was `position: absolute` inside a card container with `overflow: hidden` + `border-radius`, which clips absolutely-positioned descendants in modern browsers. Fix: teleport dropdown to `<body>` with `position: fixed`, recalculate coordinates from `getBoundingClientRect()` on open and on scroll (capture phase); also flips upward when near the bottom of the viewport.
- [x] saving a quest on edit doesnt return me to the quest list

- [x] similar to our issue with the notes on companions, the (party) notes on NPC's dont persist as there is no save button and closing the modal doesn't seem to save the data — openNpc now fetches both party_notes and personal notes fresh from DB on open (same fix as companions); notes auto-save on modal close
- [x] NPC list card referenced old free-text affiliation field (dropped column) — list and player card now show race only (class field removed)

- [x] deleting an encounter works (204) but then doesnt move back to the list and starts retrying resulting in a 406 — fixed: navigate first before mutateAsync; fetchEncounter now uses maybeSingle() (no 406 on 0 rows); useDeleteEncounter onSuccess calls removeQueries for the specific encounter before invalidating the list

- [x] deleting a spell or monster doesn't return to list, and orphaned images left in storage — navigate first (before mutateAsync) to avoid TanStack refetch-404 race; image URLs deleted from asset-images bucket on entity delete

- [x] Notes page fires a 400 Bad Request (invalid UUID) when navigating to /notes/new — useNote was not reactive (passed id.value instead of id ref) and had no `enabled` guard; fixed by accepting Ref<string> and adding `enabled: () => !!id.value`
- [x] Clicking customize effectively creates 2 copies. 1 directly, but it also pushes you into a non-saved copy to actually edit, and when you hit create (not save) then that gets created as well — useMonster was called with a non-reactive snapshot; after router.replace to the clone's URL, id changed but the query still watched "" so resolvedMonster stayed null and MonsterDetail rendered as "New Monster". Fixed: useMonster now accepts `Ref<string>` with a computed queryKey so it reactively re-fetches when the route changes.
- [x] NPC statblock is missing Saving throws — added `saving_throws` and `proficiency_bonus` to NPC StatBlock type and editor; also added `proficiency_bonus` to Monster stat block type and editor
- [x] dropping a landscape image in the box for items, crops part of the item off — added `image_focal_point` jsonb column to items and spells; switched ImageUpload to `show-focal-point` mode (same pattern as NPCs/monsters) so users can drag to set the crop focal point
- [x] Abilities and actions on an NPC or monster should be rich-text blocks that grow if the text doesn't fit (now you must scroll) — TraitSection switched from fixed `<textarea rows="2">` to `RichTextEditor`; Tiptap handles auto-height; `parseContent` handles legacy plain strings gracefully

- [x] encounter view doesnt respect the focus point when cropping — detail panel sidebar was using plain `<img>` tags; replaced with `FocalImage` using `selectedCombatant.portrait_focal_point` for both monster and player panels
- [x] clicking the avatar in encounter should trigger the same sidebar as clicking the name — avatar cell had `@click.stop` swallowing all clicks; changed to `@click.stop="toggleDetail(...)"` so it opens the sidebar while still blocking double-fire from the row handler
- [x] the way actions on monsters are currently described doesnt allow for click-and-roll play — attack bonus auto-parsed from "X to hit" in description; damage dice auto-parsed via parseExpression() from parenthetical "(XdY+Z)" format; ⚔/🎲 buttons appear per action; results shown in the roll banner and posted to campaign chat. Player prepared/known spells also shown in detail panel with 🎲 roll button and DC badge.
- [x] Chat showed "You" instead of monster/character name for rolls and item drops — `ChatPanelContent` replaced `user_id === myUserId ? "You" : sender_name` with always showing `sender_name` for roll and drop messages; `getSenderName()` in `useCampaignMessages` now checks DM preview mode and returns the previewed character's name so all message types correctly impersonate the active character
- [x] DM rolling from encounter sidebar showed DM display name in chat instead of monster name — `postRollToChat` already passed `selectedCombatant.name` but the chat was overriding it with "You"; fixed by the `sender_name` display fix above
- [x] NPC inventory drops showed DM name instead of NPC name — `sendItemDrop` accepts optional `senderName`; `NpcInventorySection` passes `npcName` prop through; `NpcDetail` passes `npc.name` down
- [x] DM preview mode rolls used DM display name instead of previewed character's name — `getSenderName()` now checks `ui.dmPreviewMode` first and resolves `ui.dmPreviewPartyMemberId` from party members
- [x] Immersive roll flavor messages not appearing without refresh — direct `supabase.insert()` bypassed `_optimisticPush`; fixed by routing through `sendFlavorMessage` composable method
- [x] Immersive roll flavor messages showed skill label inline without color — added `FlavorMetadata` type with `skill_label`; system messages now render with colored `font-cinzel` skill label prefix; `sendFlavorMessage` accepts optional `skillLabel` param
- [x] Bestiary sharing: clicking a specific player when no discovery existed yet created a whole-party discovery instead — `useToggleMonsterDiscovery` now accepts optional `visibleTo` param; `toggleMember` passes `[memberId]` on first create
- [x] Bestiary sharing: toggling a player when `visible_to=null` (whole party) did nothing visually — `useUpdateDiscoveryVisibility` now uses optimistic updates (`onMutate` + rollback on error) so the popover responds instantly
- [x] Bestiary DM preview showed all discovered monsters regardless of which player was selected — `PlayerBestiaryView` now filters discoveries client-side when in DM preview mode
- [x] Bestiary lightbox and card thumbnails ignored focal point — `:focal-point` prop now passed from `entry.monster?.portrait_focal_point` / `selected.monster?.portrait_focal_point`
- [x] Player portal bottom nav bar overlays chat input and chat open-tab button — content wrapper now reserves `pb-16` so both the scroll area and the side panel chat end above the nav; mobile slide-up chat lifted to `bottom-16`; chat tab button moved to `bottom-20`
- [x] Player atlas hid shared locations when their parent wasn't shared — `flatTree` now treats any location whose parent is absent from the shared set as a depth-0 root, so sharing a child without its parent still makes it visible
- [x] Player crafting recipe description rendered as raw Tiptap JSON — `renderDescription()` now parses and converts to HTML via `generateHTML(StarterKit)`, same pattern as PlayerNotesView
- [x] NPC sharing "Whole Party" button showed stale visibility state after clicking — `popover` now stores only `npcId`; `popoverNpc` is a computed derived from live query cache so it updates automatically after `updateNpc` invalidates
- [x] `pinned_forms` trigger errored with "record new has no field updated_at" — migration `20260330080000` adds the missing `updated_at` column
- [x] Player bestiary notes 400 Bad Request on SRD monsters — `entity_notes.entity_id` was `uuid`, blocking slug IDs like `srd_goat`; migration `20260330090000` widens column to `text`

- [x] artwork and statsblock for companions doesnt show when clicked in the encounter — companions had no `party_member_id` so `selectedMember` was null and the player panel was skipped; added `companion_id` to `RunCombatant`, stored on build, added dedicated companion detail panel in runner showing portrait, type, AC/HP/speed, ability scores, and trait sections with roll buttons
- [x] atlas: location image is square but if you add a portrait image, the top and bottom get clipped — sigil upload in `LocationEditor` used `aspect="square"`; changed to `aspect="portrait"` so portrait images fill the box naturally with `object-cover`

## Regressing bugs

only manually check these off after rigorous testing of the relevant flows, to avoid marking as done when the underlying issue is still present
