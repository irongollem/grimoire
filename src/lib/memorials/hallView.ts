import type { CharacterMemorial, MemorialKind } from "@/types/memorial.types";

export interface HallCampaignOption {
  id: string;
  name: string;
}

/** The campaigns that have a name on the wall, by name: the wall's campaign chips. */
export function hallCampaignOptions(memorials: readonly CharacterMemorial[]): HallCampaignOption[] {
  const byId = new Map<string, HallCampaignOption>();
  for (const m of memorials) {
    if (!byId.has(m.campaign_id)) byId.set(m.campaign_id, { id: m.campaign_id, name: m.campaign_name });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The campaign filter the wall actually applies. `picked` is the stored choice: null means
 * the viewer never chose, which is All for a player and the campaign they are running (when
 * it has anyone on the wall) for a DM.
 */
export function effectiveHallCampaign(
  picked: string | null,
  scope: "player" | "dm",
  activeCampaignId: string | null,
  options: readonly HallCampaignOption[],
): string {
  if (picked !== null) {
    // A pick for a campaign that has left the wall (the last name restored) falls back to All.
    return picked === "all" || options.some((o) => o.id === picked) ? picked : "all";
  }
  if (scope === "dm" && activeCampaignId !== null && options.some((o) => o.id === activeCampaignId)) {
    return activeCampaignId;
  }
  return "all";
}

export function filterHall(
  memorials: readonly CharacterMemorial[],
  campaign: string,
  kind: MemorialKind | "all",
): CharacterMemorial[] {
  return memorials.filter(
    (m) => (campaign === "all" || m.campaign_id === campaign) && (kind === "all" || m.kind === kind),
  );
}
