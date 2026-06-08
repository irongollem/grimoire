import { useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

/**
 * All AI image-generation kinds, the single source of truth for the Gallery.
 * (The DB `kind` column is free text — no CHECK constraint — so new kinds only
 * need to be added here.)
 */
export const IMAGE_GEN_KINDS = [
  "chronicler",
  "group_portrait",
  "npc_portrait",
  "party_member",
  "species",
  "monster",
  "item",
  "spell",
  "faction",
  "location",
  "map",
  "trap",
  "puzzle",
  "pantheon",
  "loot",
] as const;

export type ImageGenKind = (typeof IMAGE_GEN_KINDS)[number];

export interface KindMeta {
  /** Gallery tab label. */
  label: string;
  /** Entity table this kind's art belongs to (for the back-link target), or null. */
  table: string | null;
  /** Image column on that table, or null. */
  column: string | null;
  /** Detail-route base for click-through navigation, or null (lightbox only). */
  route: string | null;
}

export const KIND_META: Record<ImageGenKind, KindMeta> = {
  chronicler:     { label: "Chronicle", table: null,            column: null,          route: null },
  group_portrait: { label: "Party",     table: null,            column: null,          route: null },
  npc_portrait:   { label: "NPCs",      table: "npcs",          column: "portrait_url", route: "/npcs" },
  party_member:   { label: "Heroes",    table: "party_members", column: "portrait_url", route: null },
  species:        { label: "Species",   table: "species",       column: "image_url",    route: null },
  monster:        { label: "Monsters",  table: "monsters",      column: "image_url",    route: "/monsters" },
  item:           { label: "Items",     table: "items",         column: "image_url",    route: "/vault" },
  spell:          { label: "Spells",    table: "spells",        column: "image_url",    route: "/spells" },
  faction:        { label: "Factions",  table: "factions",      column: "emblem_url",   route: "/factions" },
  location:       { label: "Locations", table: "locations",     column: "image_url",    route: "/locations" },
  map:            { label: "Maps",      table: "locations",     column: "map_url",      route: "/locations" },
  trap:           { label: "Traps",     table: "traps",         column: "image_url",    route: null },
  puzzle:         { label: "Puzzles",   table: "puzzle_rooms",  column: "image_url",    route: null },
  pantheon:       { label: "Pantheons", table: "pantheons",     column: "emblem_url",   route: null },
  loot:           { label: "Loot",      table: null,            column: null,          route: null },
};

export function galleryQueryKey(campaignId: string | null) {
  return ["gallery-images", campaignId];
}

export interface LogImageGenerationParams {
  kind: ImageGenKind;
  imageUrl: string;
  prompt?: string;
  size?: string;
  model?: string | null;
  provider?: string | null;
  /** Source entity id for the back-link. Table/column default from KIND_META. */
  targetId?: string | null;
  targetTable?: string | null;
  targetColumn?: string | null;
}

/**
 * Records a finished AI image generation in `image_generation_jobs` (status
 * 'ready') so it appears in the account-wide Gallery. Called client-side after
 * the image has been uploaded + written onto its entity — the edge functions
 * return base64 and never see the final URL, so this is the only place that
 * knows both the URL and the source entity.
 *
 * Fire-and-forget: never throws, never blocks the caller.
 */
export function useImageGenerationLog() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  async function logImageGeneration(params: LogImageGenerationParams): Promise<void> {
    try {
      const user = getCurrentUser();
      const campaignId = activeCampaignId.value;
      if (!user || !campaignId || !params.imageUrl) return;

      const meta = KIND_META[params.kind];
      const { error } = await supabase.from("image_generation_jobs").insert({
        user_id: user.id,
        campaign_id: campaignId,
        kind: params.kind,
        status: "ready",
        image_url: params.imageUrl,
        prompt: (params.prompt ?? "").slice(0, 500),
        size: params.size ?? "1024x1024",
        model: params.model ?? null,
        provider: params.provider ?? null,
        target_table: params.targetTable ?? meta?.table ?? null,
        target_id: params.targetId ?? null,
        target_column: params.targetColumn ?? meta?.column ?? null,
        completed_at: new Date().toISOString(),
      });
      if (error) {
        console.error("logImageGeneration failed:", error);
        return;
      }
      void qc.invalidateQueries({ queryKey: galleryQueryKey(campaignId) });
    } catch (e) {
      console.error("logImageGeneration error:", e);
    }
  }

  return { logImageGeneration };
}
