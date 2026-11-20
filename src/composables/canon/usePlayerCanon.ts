import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import type { KnowledgeMark, LoreKind } from "@/types/canon.types";

/** One row of `get_player_canon`: an entry the player's audience reaches, secret blocks already withheld. */
export interface PlayerCanonEntry {
  id: string;
  part: string;
  premise_kind: string | null;
  knowledge: KnowledgeMark | null;
  title: string;
  /** Tiptap JSON string. */
  body: string | null;
  sort_order: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  lore_kind: LoreKind | null;
  world_year: number | null;
  world_month: number | null;
  world_day: number | null;
}

/** One row of `get_player_lore_passages`: a passage this player has been told. */
export interface PlayerLorePassage {
  id: string;
  entry_id: string;
  sort_order: number;
  title: string;
  body: string | null;
  told_at: string | null;
}

export interface PlayerLore {
  entry: PlayerCanonEntry;
  /** Only the passages this player has been told, in order. The read never says how many exist. */
  passages: PlayerLorePassage[];
  /** When the entry last grew for this player: its newest passage, else the entry itself. */
  latestAt: string;
}

export interface PlayerWorld {
  /** Truths only this player's character, or a faction it belongs to, knows. */
  onlyMine: PlayerCanonEntry[];
  /** Truths known to all. */
  known: PlayerCanonEntry[];
  lore: PlayerLore[];
}

/**
 * A passage is New when it was told after the player last opened its entry. A player who has never opened the entry
 * has no last visit to be newer than (the entry's own dot says it is new), so nothing inside it is marked.
 */
export function isPassageNew(toldAt: string | null, lastVisit: Date | null): boolean {
  return lastVisit !== null && toldAt !== null && new Date(toldAt) > lastVisit;
}

function dateKey(e: PlayerCanonEntry): [number, number, number] {
  return [e.world_year ?? Number.POSITIVE_INFINITY, e.world_month ?? 0, e.world_day ?? 0];
}

/**
 * The player's read of the canon, sorted into what "The World" tab shows. Lore runs in the order of its date in the
 * world (undated last, then the DM's order); passages keep their order under their entry.
 */
export function groupPlayerWorld(entries: readonly PlayerCanonEntry[], passages: readonly PlayerLorePassage[]): PlayerWorld {
  const truths = entries.filter((e) => e.part === "truth");
  const byEntry = new Map<string, PlayerLorePassage[]>();
  for (const p of [...passages].sort((a, b) => a.sort_order - b.sort_order)) {
    const list = byEntry.get(p.entry_id) ?? [];
    list.push(p);
    byEntry.set(p.entry_id, list);
  }
  const lore = entries
    .filter((e) => e.part === "lore")
    .map((entry): PlayerLore => {
      const told = byEntry.get(entry.id) ?? [];
      const times = told.flatMap((p) => (p.told_at === null ? [] : [p.told_at])).sort();
      return { entry, passages: told, latestAt: times.at(-1) ?? entry.created_at };
    })
    .sort((a, b) => {
      const [ay, am, ad] = dateKey(a.entry);
      const [by, bm, bd] = dateKey(b.entry);
      return ay - by || am - bm || ad - bd || a.entry.sort_order - b.entry.sort_order;
    });
  return {
    onlyMine: truths.filter((e) => e.knowledge === "some"),
    known: truths.filter((e) => e.knowledge === "all"),
    lore,
  };
}

/**
 * What the signed-in player reads of the campaign's canon: truths and lore, each already limited by the database to
 * what this player's audience reaches (a DM previewing a member reads exactly that member's). Both reads sit under
 * the `canon` root, so the doorbell's `canon_entries` and `canon_lore_passages` rings refresh them.
 */
export function usePlayerCanon() {
  const campaign = useCampaignStore();
  const appUi = useAppUiStore();
  const previewMemberId = computed(() => (appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : null));
  const enabled = computed(() => !!campaign.activeCampaignId);

  const entries = useQuery({
    queryKey: computed(() => [CANON_KEY, "player", campaign.activeCampaignId, previewMemberId.value] as const),
    queryFn: async ({ queryKey: [, , cid, memberId] }): Promise<PlayerCanonEntry[]> => {
      if (!cid) throw new Error("usePlayerCanon fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_canon", { p_campaign_id: cid, p_preview_member_id: memberId });
      if (error) throw error;
      return data as PlayerCanonEntry[];
    },
    enabled,
  });

  const passages = useQuery({
    queryKey: computed(() => [CANON_KEY, "player-passages", campaign.activeCampaignId, previewMemberId.value] as const),
    queryFn: async ({ queryKey: [, , cid, memberId] }): Promise<PlayerLorePassage[]> => {
      if (!cid) throw new Error("usePlayerCanon fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_lore_passages", { p_campaign_id: cid, p_preview_member_id: memberId });
      if (error) throw error;
      return data as PlayerLorePassage[];
    },
    enabled,
  });

  const world = computed<PlayerWorld | undefined>(() =>
    entries.data.value && passages.data.value ? groupPlayerWorld(entries.data.value, passages.data.value) : undefined,
  );
  return {
    world,
    isLoading: computed(() => entries.isLoading.value || passages.isLoading.value),
    error: computed(() => entries.error.value ?? passages.error.value),
  };
}
