/**
 * Per-campaign content gating — the DM's answer to "what may be picked at my
 * table". Two independent rules, both enforced here so every picker agrees:
 *
 * 1. **Blocklist** — `campaigns.disabled_species_ids` / `campaigns.disabled_class_names`
 *    hold what the DM switched off in Campaign Settings (SpeciesTab / ClassesTab).
 *    Species ids are text: a custom species uuid or an `library_species` slug.
 * 2. **Exclusivity** — a row with a non-null `campaign_id` belongs to that one
 *    campaign and must never surface in another.
 *
 * Custom species remain blockable, custom *classes* are not (ClassesTab only
 * offers the SRD list) — but both are still campaign-scoped.
 *
 * These gate **pickers only**. Resolving an already-chosen species or class
 * always runs against the unfiltered list, so a character keeps rendering (and
 * levelling) after the DM disables what they picked.
 */

export interface CampaignSpeciesGate {
  /** Active campaign; null when none is loaded — then only exclusivity applies. */
  campaignId: string | null;
  /** `campaigns.disabled_species_ids`; undefined when no campaign is loaded. */
  disabledIds: readonly string[] | undefined;
}

/** Species a member of `gate.campaignId` may pick. Passing `undefined` (query
 *  not settled yet) yields an empty list rather than an unfiltered one. */
export function allowedSpecies<T extends { id: string; campaign_id: string | null }>(
  species: readonly T[] | undefined,
  gate: CampaignSpeciesGate,
): T[] {
  const disabled = new Set(gate.disabledIds ?? []);
  return (species ?? []).filter(
    (s) => !disabled.has(s.id) && (s.campaign_id === null || s.campaign_id === gate.campaignId),
  );
}

/** SRD classes the DM left enabled. `disabledNames` is undefined when no
 *  campaign is loaded — nothing is blocked then. */
export function allowedSystemClasses<T extends { class_name: string }>(
  classes: readonly T[] | undefined,
  disabledNames: readonly string[] | undefined,
): T[] {
  const disabled = new Set(disabledNames ?? []);
  return (classes ?? []).filter((c) => !disabled.has(c.class_name));
}

/** Campaign-scoped homebrew (custom classes, custom subclasses — anything the
 *  editor lets a DM mark "Campaign-scoped") visible in `campaignId`: universal
 *  rows plus that campaign's own. No blocklist applies — ClassesTab only toggles
 *  SRD classes, custom content is always available in its own campaign. */
export function allowedCampaignScoped<T extends { campaign_id?: string | null }>(
  rows: readonly T[] | undefined,
  campaignId: string | null,
): T[] {
  // A MISSING campaign_id counts as global, exactly like an explicit null —
  // hence the optional field in the constraint above.
  //
  // Not defensive programming for its own sake: schema and client deploy in two
  // steps, and the frontend usually wins the race (Vercel deploys on push while
  // `supabase db push` waits on three CI jobs). In that window `select *`
  // returns rows that predate the column, so campaign_id is `undefined` — and a
  // strict `=== null` test matches neither branch, which would empty the DM's
  // entire homebrew list rather than show all of it. That is the silent
  // disappearance this scoping exists to prevent, aimed at every DM at once.
  return (rows ?? []).filter(
    (r) => r.campaign_id === null || r.campaign_id === undefined || r.campaign_id === campaignId,
  );
}
