# Demo Campaign

A ready-made campaign any DM can load into their own account, explore with real content in it, and reset or remove (epic #912). The published demo is **Sugarwell**, a cut-down side-location from *Late in the Kind Country*. It doubles as a teaser for the full campaign.

DM-only. Players see a demo only if the DM invites them to it, like any campaign.

## Decisions (25 Sep 2026)

- **A copy into the user's own account.** It is not a shared read-only campaign. Most of Grimoire is editing, and running a session writes state, so read-only would demo a crippled app.
- **Registered users only.** There is no anonymous or guest mode, and none is planned.
- **Quota-free.** Every copied row carries `demo_source` and the quota functions skip it, the campaign row included, so the demo never uses a Free DM's one campaign slot. Rows the user adds inside the demo count as normal.
- **One template, in production, authored in Grimoire.** It is never a seed file in this public repo. The template is the master set: edit it like any campaign, then publish.
- **Publishing is not offering.** Publishing (`20260925002215`) is a separate step from offering (`20260925054923`). A published template is offered to new users only once an admin switches it on in **Admin → Content**. Until then admins still see it and can load it, which is how you review a work-in-progress demo in the real app, and everyone else sees nothing. Moving the template to a different campaign switches the offer off again.

## Files

| Layer | Path |
| --- | --- |
| Migrations | `supabase/migrations/20260925002215_demo_campaign.sql`, `20260925054923_demo_campaign_offered_toggle.sql` |
| Tests | `supabase/tests/demo_campaign.test.sql` (structure + behaviour) |
| Composable | `src/composables/campaign/useDemoCampaign.ts`: `useDemoStatus`, `useLoadDemoCampaign`, `useResetDemoCampaign`, `usePublishDemoVersion`, `isDemoOutdated` |
| Offer | `src/components/campaign/DemoCampaignOffer.vue` (`layout`: `full` / `compact` / `menu`), mounted in `DmCampaignGate.vue`, `WelcomeView.vue`, `NewCampaignModal.vue` and `CampaignSwitcher.vue` |
| Offer switch | `src/components/admin/DemoCampaignAdminPanel.vue`, first panel in Admin → Content |
| Living with it | `DemoCampaignPanel.vue` (in `DetailsTab`): reset, the newer-version notice, and admin publish. `DangerZoneTab.vue` has demo-specific delete copy; `CampaignSwitcher.vue` shows the Demo/Template markers |
| Teaser | `src/components/dashboard/DemoTeaserBanner.vue` + `demoTeaser.ts`. Hidden until `VITE_FULL_CAMPAIGN_URL` is set |
| Quota picker | `DefaultLayout.vue` and `DowngradeCampaignPickerModal.vue` leave demo campaigns out of the Free-plan campaign count |
| Manual | `src/manual/getting-started-demo-campaign.md` |

## Schema

- `campaigns.demo_template` (one row at most, by partial unique index), `campaigns.demo_version` (the template's published stamp), `campaigns.demo_offered` (on the template: shown to new users) and `campaigns.demo_source` (on a copy: the version it came from; at most one copy per user).
- `demo_source` on the 13 other quota tables a demo populates.
- Guard triggers (`guard_demo_source`, `guard_campaign_demo_columns`) normalise client writes to these columns: an insert gets null, and an update keeps the old value. So a duplicated demo row is the user's own and counts, and no client can mark its campaign as the template.
- `private.demo_campaign_tables` classifies every campaign-scoped table: tier 1 (has `campaign_id`) or tier 2 (reached through `parent_column`). Each row is copied or excluded, and every exclusion carries a reason.

## RPCs

| Function | Who | What |
| --- | --- | --- |
| `load_demo_campaign(p_replace)` | any DM | Copies the published template into the caller's account. `true` = reset: the old copy is purged in the same transaction. |
| `get_demo_status()` | any DM | `{ published, version, offered, template_name, demo_campaign_id, loaded_version }`. For a non-admin, `published` means published and offered, and `template_name` is always null. It never returns the template's id. |
| `publish_demo_version(p_campaign_id)` | admin, own campaign | Dry-runs the copy (always rolled back), then marks the campaign as the template and stamps a new version. It does not offer it. |
| `set_demo_offered(p_offered)` | admin | Switches the published template's offer to new users on or off. |
| `delete_campaign_with_homebrew` | owner | Now purges a demo whole, whatever disposition it is given. |

## How the copy works

It is catalogue-driven, because production has 82 campaign-scoped tables and a hand-kept list would go out of date the day someone adds one.

1. **Collect.** Tier-1 rows with `campaign_id = template`, then tier-2 rows through their parent.
2. **Validate.** Refuse if any row names another account (a player's character, for instance), or points at rows outside the template or at the author's other content.
3. **Rewrite ids.** `private.remap_demo_ids` rewrites every id through an old→new map in each row's JSON text. That also reaches ids inside jsonb, arrays and text references such as `quest_beat_attachments.ref_id` and rich-text links. The author's own id is rewritten only where it stands alone as a value. Inside a string it is a storage path, so the copy keeps pointing at the author's uploaded files.
4. **Insert.** None of the 346 foreign keys is deferrable, so rows go in by passes, a table at a time, and row by row for self-referencing tables. The three real cycles are broken by `defer_columns` (`quests.entry_beat_id`, `locations.npc_owner_id`, `notes.linked_calendar_event_id`), which go in null and are restored at the end.
5. **Side effects.** Two insert triggers that would duplicate template rows stand down while `grimoire.copying_campaign` is on: the quest's auto "Main" thread, and the attachment-to-`quest_refs` mirror.
6. **What a copy leaves behind.**
   - The campaign row drops the author's BYOK keys, Spotify client and iCal token, and gets a fresh token of its own.
   - It resets `ai_enabled` and the provider choice. AI Act consent belongs to the owner, so the new owner is asked.
   - AI provenance on the content itself is copied verbatim.
   - Embeddings are copied, so the demo is searchable by the AI tools from the start.

## Authoring the template — rules that bite

- **No other accounts in it.** Party members must be pre-mades with no `owner_user_id`, and there must be no invites or players. Publish refuses otherwise, naming the reason.
- **Self-contained.** Nothing may reference NPCs, items or monsters from another campaign, or campaign-less "general" rows. Scope everything to the template campaign.
- **Current rules apply.** Legacy rows that today's guards would reject cannot be re-inserted: a room inside a `wilderness` place fails `guard_location_room_parent`. Publish reports the guard's message; fix the row.
- **Upload art and audio normally.** It stays in the author's storage folder and every copy points at it: public on the CDN, and undeletable by users, because storage RLS only lets a user remove objects under their own id. **So never delete a template image or sound that copies may still use.** Republishing does not clean old files up either.
- **Publish after editing.** Once the demo is offered, new loads copy the template as it is *now*, so half-finished edits reach new users immediately. For a large rework, switch the offer off in Admin → Content first. Publish bumps the version and lets existing copies offer a reset.

## What the gates cannot see here

pgTAP runs without `pg_safeupdate`, and PostgREST loads it, so an `UPDATE`/`DELETE` without a `WHERE` passes every test and fails for every real user (`UPDATE requires a WHERE clause`). One shipped that way and was caught only by loading the demo through the app. When you touch these functions, exercise `load_demo_campaign`, `publish_demo_version` and the delete over REST, not just in SQL.
