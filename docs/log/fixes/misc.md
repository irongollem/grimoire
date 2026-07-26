# Fixes — Miscellaneous

Resolved bugs in the **Miscellaneous** area, newest first. Part of the Grimoire fix log — see the [log index](../index.md).

- [x] Session expiry mid-session caused buttons to silently fail — when a player stayed on one page long enough for the Supabase refresh token to expire, `onAuthStateChange` emitted `SIGNED_OUT` and set `user` to null, but the router guard only runs on navigation so no redirect happened and subsequent button clicks failed silently with 401s; fixed by watching `auth.isAuthenticated` in `App.vue` and pushing to `/login?redirect=...` immediately when it drops on a protected route
