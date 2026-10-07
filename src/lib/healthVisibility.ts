import type { Campaign } from "@/types/campaign.types";
import type { HealthVisibility } from "@/types/encounter.types";

/**
 * How much health a player may see, read off the active campaign row.
 *
 * The app shell mounts before that row has arrived (#999), so for a moment
 * there is no row to read. The old fallback was "strategic", which is the one
 * setting that shows numeric hit points: a table that chose "unknown" would
 * have flashed them to its players. With no row the answer fails closed to the
 * most restrictive setting, and the row's own value replaces it as soon as it
 * lands.
 */
export function healthVisibilityOf(
  campaign: Pick<Campaign, "health_visibility"> | null,
): HealthVisibility {
  return campaign ? campaign.health_visibility : "unknown";
}
