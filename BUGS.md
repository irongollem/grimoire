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

- [x] deleting an encounter works (204) but then doesnt move back to the list and starts retrying resulting in a 406 — fixed: navigate first before mutateAsync; fetchEncounter now uses maybeSingle() (no 406 on 0 rows); useDeleteEncounter onSuccess calls removeQueries for the specific encounter before invalidating the list

- [ ]deleting a spell doesnt return me to the list, causing the same error issues as above here. Please put in your memory that this is a pattern that you need to always tackle when adding a delete inside an item

## Regressing bugs

only manually check these off after rigorous testing of the relevant flows, to avoid marking as done when the underlying issue is still present
