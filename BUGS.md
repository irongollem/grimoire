# Bugs

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
