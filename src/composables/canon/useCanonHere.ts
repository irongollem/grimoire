import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import type { ClueKind } from "@/composables/canon/useCanonClues";
import { CANON_PARTS, KNOWLEDGE_MARKS, type CanonPart, type KnowledgeMark } from "@/types/canon.types";

/** A clue lying here, with the title of the secret it points at. */
export type CanonHereClue = {
  id: string;
  title: string;
  secret_id: string;
  secret_title: string;
  found_at: string | null;
  found_session_id: string | null;
};

/** An untold passage that comes out here (never an entry's first), with the title of the entry it belongs to. */
export type CanonHerePassage = { id: string; title: string; entry_id: string; entry_title: string };

/** On a person: a lore entry told about them, with how many of its passages are told. */
export type CanonHereLore = { id: string; title: string; told: number; total: number };
/** On a person: a canon entry tied to them, with what the NPC sheet needs to offer "Tell the party" on a truth. */
export type CanonHereEntry = { id: string; title: string; part: CanonPart; knowledge: KnowledgeMark | null; revealed_at: string | null };
/**
 * On a person, `knows` is the entries tied to them as a knower (`known_to`) and `about` the entries (truths, secrets,
 * forces, anything but lore, which has its own list) tied `about` them.
 */
export type CanonHere = { clues: CanonHereClue[]; passages: CanonHerePassage[]; lore: CanonHereLore[]; knows: CanonHereEntry[]; about: CanonHereEntry[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

function isClue(v: unknown): v is CanonHereClue {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.secret_id === "string" &&
    typeof v.secret_title === "string" &&
    isStringOrNull(v.found_at) &&
    isStringOrNull(v.found_session_id)
  );
}

function isPassage(v: unknown): v is CanonHerePassage {
  return isRecord(v) && typeof v.id === "string" && typeof v.title === "string" && typeof v.entry_id === "string" && typeof v.entry_title === "string";
}

function isLore(v: unknown): v is CanonHereLore {
  return isRecord(v) && typeof v.id === "string" && typeof v.title === "string" && typeof v.told === "number" && typeof v.total === "number";
}

function isEntry(v: unknown): v is CanonHereEntry {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    (CANON_PARTS as readonly unknown[]).includes(v.part) &&
    (v.knowledge === null || (KNOWLEDGE_MARKS as readonly unknown[]).includes(v.knowledge)) &&
    isStringOrNull(v.revealed_at)
  );
}

/** Narrows `get_canon_here`'s jsonb; a shape the client does not know is an error, never an empty block. */
export function parseCanonHere(data: unknown): CanonHere {
  if (!isRecord(data) || !Array.isArray(data.clues) || !Array.isArray(data.passages)) throw new Error("get_canon_here returned an unexpected shape");
  const lore = data.lore === undefined ? [] : data.lore;
  if (!Array.isArray(lore)) throw new Error("get_canon_here returned an unexpected shape");
  if (!data.clues.every(isClue) || !data.passages.every(isPassage) || !lore.every(isLore)) throw new Error("get_canon_here returned an unexpected row");
  const knows = data.knows === undefined ? [] : data.knows;
  const about = data.about === undefined ? [] : data.about;
  if (!Array.isArray(knows) || !Array.isArray(about)) throw new Error("get_canon_here returned an unexpected shape");
  if (!knows.every(isEntry) || !about.every(isEntry)) throw new Error("get_canon_here returned an unexpected row");
  return { clues: data.clues, passages: data.passages, lore, knows, about };
}

export async function fetchCanonHere(kind: ClueKind, id: string): Promise<CanonHere> {
  const { data, error } = await supabase.rpc("get_canon_here", { p_kind: kind, p_id: id });
  if (error) throw error;
  return parseCanonHere(data);
}

/** The read behind `useCanonHere`, shared with the route prefetch so both use one key and one fetcher. */
export function canonHereQuery(kind: ClueKind, id: string) {
  return {
    queryKey: [CANON_KEY, "here", kind, id] as const,
    queryFn: () => fetchCanonHere(kind, id),
  };
}

/**
 * What the canon placed at one place, person or beat, in one read (#1226): the clues lying there and the passages that
 * come out there and are not yet told. Under the `canon` root, so the doorbell's canon rings refresh it.
 */
export function useCanonHere(kind: MaybeRefOrGetter<ClueKind>, id: MaybeRefOrGetter<string>) {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => canonHereQuery(toValue(kind), toValue(id)).queryKey),
    queryFn: ({ queryKey: [, , k, i] }) => fetchCanonHere(k, i),
    enabled: () => !!campaign.activeCampaignId,
  });
}
