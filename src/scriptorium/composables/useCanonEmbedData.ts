/*
 * The DM's side of a linked canon entry (#1226 story 8): reads the entries a book links,
 * with the passages of its lore, the clues of its secrets and the steps of its forces,
 * and formats each with `canonEmbedHtml`. Every read is by the ids the book holds,
 * under the `canon` query root, so the doorbell's canon rings refresh a book that
 * follows the campaign. A player never reaches this: the players' resolvers read
 * `get_player_canon` (usePlayerEntityEmbed.ts) and the Open Book's snapshot.
 */
import { computed, type ComputedRef, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCalendarStore } from "@/stores/calendar";
import { canonEmbedHtml, type CanonEmbedInput } from "@/scriptorium/lib/canonEmbedHtml";
import { premiseLabel } from "@/scriptorium/lib/canonBook";
import type { EntityRef } from "@/scriptorium/lib/entityEmbeds";
import type { CanonClue, CanonEntry, CanonForceStep, CanonLorePassage } from "@/types/canon.types";

async function readIn<T>(
  table: string,
  column: string,
  ids: readonly string[],
  select = "*",
): Promise<T[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from(table).select(select).in(column, [...ids]);
  if (error) throw error;
  return data as T[];
}

function names(rows: { id: string; name?: string; title?: string }[]): Map<string, string> {
  return new Map(rows.map((r) => [r.id, r.name ?? r.title ?? ""]));
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

export function useCanonEmbedData(refs: Ref<EntityRef[]> | ComputedRef<EntityRef[]>) {
  const calendar = useCalendarStore();
  const ids = computed(() => sorted(refs.value.filter((r) => r.type === "canon").map((r) => r.id)));
  const on = (extra = true) => ids.value.length > 0 && extra;

  const entries = useQuery({
    queryKey: computed(() => [CANON_KEY, "embed", "entries", ids.value] as const),
    queryFn: ({ queryKey: [, , , wanted] }) => readIn<CanonEntry>("canon_entries", "id", wanted),
    enabled: () => on(),
  });
  const rows = computed(() => entries.data.value ?? []);
  const idsOf = (part: CanonEntry["part"]) => rows.value.filter((e) => e.part === part).map((e) => e.id);

  const passages = useQuery({
    queryKey: computed(() => [CANON_KEY, "embed", "passages", sorted(idsOf("lore"))] as const),
    queryFn: ({ queryKey: [, , , wanted] }) => readIn<CanonLorePassage>("canon_lore_passages", "entry_id", wanted),
    enabled: () => on(idsOf("lore").length > 0),
  });
  const clues = useQuery({
    queryKey: computed(() => [CANON_KEY, "embed", "clues", sorted(idsOf("secret"))] as const),
    queryFn: ({ queryKey: [, , , wanted] }) => readIn<CanonClue>("canon_clues", "secret_id", wanted),
    enabled: () => on(idsOf("secret").length > 0),
  });
  const steps = useQuery({
    queryKey: computed(() => [CANON_KEY, "embed", "steps", sorted(idsOf("force"))] as const),
    queryFn: ({ queryKey: [, , , wanted] }) => readIn<CanonForceStep>("canon_force_steps", "force_id", wanted),
    enabled: () => on(idsOf("force").length > 0),
  });

  // Where each clue lies, named: a place, a person or a beat.
  const clueRows = computed(() => clues.data.value ?? []);
  const whereIds = (pick: (c: CanonClue) => string | null) =>
    sorted(clueRows.value.flatMap((c) => (pick(c) ? [pick(c) as string] : [])));
  const places = useQuery({
    queryKey: computed(() => ["scriptorium-canon-where", "locations", whereIds((c) => c.location_id)] as const),
    queryFn: ({ queryKey: [, , wanted] }) => readIn<{ id: string; name: string }>("locations", "id", wanted, "id, name"),
    enabled: () => whereIds((c) => c.location_id).length > 0,
  });
  const people = useQuery({
    queryKey: computed(() => ["scriptorium-canon-where", "npcs", whereIds((c) => c.npc_id)] as const),
    queryFn: ({ queryKey: [, , wanted] }) => readIn<{ id: string; name: string }>("npcs", "id", wanted, "id, name"),
    enabled: () => whereIds((c) => c.npc_id).length > 0,
  });
  const beats = useQuery({
    queryKey: computed(() => ["scriptorium-canon-where", "beats", whereIds((c) => c.quest_beat_id)] as const),
    queryFn: ({ queryKey: [, , wanted] }) => readIn<{ id: string; title: string }>("quest_beats", "id", wanted, "id, title"),
    enabled: () => whereIds((c) => c.quest_beat_id).length > 0,
  });

  function clueWhere(clue: CanonClue): string | null {
    if (clue.location_id) return names(places.data.value ?? []).get(clue.location_id) ?? null;
    if (clue.npc_id) return names(people.data.value ?? []).get(clue.npc_id) ?? null;
    if (clue.quest_beat_id) return names(beats.data.value ?? []).get(clue.quest_beat_id) ?? null;
    return null;
  }

  function inputFor(entry: CanonEntry): CanonEmbedInput | undefined {
    switch (entry.part) {
      case "premise":
        return { kind: "premise", label: premiseLabel(entry.premise_kind), title: entry.title, body: entry.body };
      case "truth":
        return { kind: "truth", title: entry.title };
      case "question":
        return { kind: "question", title: entry.title };
      case "lore": {
        // Never lore without its passages: wait for them rather than print a stub.
        if (!passages.data.value) return undefined;
        const date =
          entry.world_year === null
            ? null
            : calendar.adapter.formatDate(entry.world_year, entry.world_month, entry.world_day, null);
        return {
          kind: "lore",
          title: entry.title,
          loreKind: entry.lore_kind,
          date,
          body: entry.body,
          passages: passages.data.value
            .filter((p) => p.entry_id === entry.id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((p) => ({ title: p.title, body: p.body })),
        };
      }
      case "force": {
        if (!steps.data.value) return undefined;
        return {
          kind: "force",
          title: entry.title,
          wants: entry.wants,
          steps: steps.data.value
            .filter((s) => s.force_id === entry.id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((s) => s.title),
        };
      }
      case "secret": {
        if (!clues.data.value) return undefined;
        return {
          kind: "secret",
          title: entry.title,
          clues: clues.data.value
            .filter((c) => c.secret_id === entry.id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((c) => ({ title: c.title, where: clueWhere(c) })),
        };
      }
      case "chronicle":
        // The chronicle is the record of play, not canon a book draws on.
        return undefined;
    }
  }

  /** id -> the entry's formatted body, absent while it loads or when it is gone. */
  const lookup = computed(() => {
    const out = new Map<string, string>();
    for (const entry of rows.value) {
      const input = inputFor(entry);
      if (input) out.set(entry.id, canonEmbedHtml(input));
    }
    return out;
  });

  const isLoading = computed(
    () =>
      entries.isLoading.value ||
      passages.isLoading.value ||
      clues.isLoading.value ||
      steps.isLoading.value ||
      places.isLoading.value ||
      people.isLoading.value ||
      beats.isLoading.value,
  );

  return { lookup, isLoading };
}
