# Bugs

- [x] hitting print on cardforge when the chat is open instead sends the chat overlay to the printview
- [x] in tokenforge when clicking download, the downloaded image is only the top left half of the token
- [x] SRD item import creating duplicates on re-run (Supabase 1000-row cap causing dedup check to miss items beyond row 1000)
- [x] Item / monster / spell lists cutting off at ~"P" alphabetically (same 1000-row Supabase default limit, fixed with paginated range queries)
- [x] Print sheets in The Mint showing wrong content (coin sheet showed token sheet on first print after switching — `printMode` ref was updated but `window.print()` fired before Vue flushed the DOM; fixed with `await nextTick()`)
- [ ] I cant set my name, it remains set as "unnamed player" and theres no menu or setting to actually name myself
