// Its own file so the server (encounter-command) can read the shape without loading everything `campaign.types` imports.
/** Where the party stands on one site's grid while exploring it, in the site map's image cells (the cell space a fight's
 *  tokens use, so a fight started there seats everyone where they stood). `campaigns.explore_party`; one site at a time. */
export interface ExploreParty {
  site_id: string;
  /** party_members.id -> top-left corner of the character's square. */
  positions: Record<string, { x: number; y: number }>;
}
