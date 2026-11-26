import { computed, ref, watch } from "vue";
import { collectMentions, tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCampaignLinks, useConnections } from "@/composables/connections/useConnections";
import { useEntryQuestLinks } from "@/composables/canon/useEntryQuestLinks";
import type { CanonEntry } from "@/types/canon.types";
import type { Connection } from "@/types/connections.types";

/** A block of an entry pane that may fold into the "Add…" row. */
export type FoldKey = "arc" | "notes" | "quests" | "story" | "connections" | "cover";

export const FOLD_LABEL: Record<FoldKey, string> = {
  arc: "An arc",
  notes: "More about it",
  quests: "A quest",
  story: "A cause, an effect or a theme",
  connections: "A connection",
  cover: "What people believe instead",
};

/** True when a body holds words or a mention: an editor opened on an empty document is empty. */
export function bodyHasContent(body: string | null): boolean {
  return tiptapToPlainText(body).trim() !== "" || collectMentions(body).length > 0;
}

/**
 * Which optional blocks of an entry pane hold something, read from data, and which the DM has just chosen to add (#1279
 * item 16). A block shows when it is filled or chosen; a chosen block stays until the DM leaves the entry, so adding the
 * first quest does not make the picker vanish under them. Choosing never writes anything.
 *
 * `hideConnection` is the pane's own `isShownAbove`: a tie another block already draws does not make "Connections" filled.
 * "An arc" is offered only once the campaign has an arc to pick.
 */
export function useEntryFold(
  entry: () => CanonEntry,
  options: { hideConnection?: (c: Connection) => boolean } = {},
) {
  const chosen = ref<ReadonlySet<FoldKey>>(new Set());
  watch(() => entry().id, () => { chosen.value = new Set(); });

  const { data: arcs } = useCanonArcs();
  const questLinks = useEntryQuestLinks(() => entry().id);
  const { data: entriesData } = useCanonEntries();
  const { data: linksData } = useCampaignLinks();
  const connections = useConnections("canon", () => entry().id);

  // Cause, effect and carried themes: the canon-to-canon `led_to` and `carries` ties either way round, and the became pointers.
  const storyFilled = computed(() => {
    const id = entry().id;
    const tied = (linksData.value ?? []).some((l) => l.from_kind === "canon" && l.to_kind === "canon" && (l.type === "led_to" || l.type === "carries") && (l.from_id === id || l.to_id === id));
    return tied || entry().became_entry_id !== null || (entriesData.value ?? []).some((e) => e.became_entry_id === id);
  });
  const connectionsFilled = computed(() => (connections.data.value ?? []).some((c) => !(options.hideConnection?.(c) ?? false)));

  const filled = computed<Record<FoldKey, boolean>>(() => ({
    arc: entry().arc_id !== null,
    notes: bodyHasContent(entry().body),
    quests: questLinks.value.length > 0,
    story: storyFilled.value,
    connections: connectionsFilled.value,
    cover: entry().cover_story !== null,
  }));

  /** Whether the block is drawn. */
  function shown(key: FoldKey): boolean {
    return filled.value[key] || chosen.value.has(key);
  }

  /** What the "Add…" menu offers: the blocks in `keys` that are not drawn. */
  function choices(keys: readonly FoldKey[]): { key: FoldKey; label: string }[] {
    return keys
      .filter((k) => !shown(k) && (k !== "arc" || (arcs.value ?? []).length > 0))
      .map((key) => ({ key, label: FOLD_LABEL[key] }));
  }

  function choose(key: string) {
    chosen.value = new Set([...chosen.value, key as FoldKey]);
  }

  return { shown, choices, choose };
}
