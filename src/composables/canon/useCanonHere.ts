import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import type { ClueKind } from "@/composables/canon/useCanonClues";

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

export type CanonHere = { clues: CanonHereClue[]; passages: CanonHerePassage[] };

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

/** Narrows `get_canon_here`'s jsonb; a shape the client does not know is an error, never an empty block. */
export function parseCanonHere(data: unknown): CanonHere {
  if (!isRecord(data) || !Array.isArray(data.clues) || !Array.isArray(data.passages)) throw new Error("get_canon_here returned an unexpected shape");
  if (!data.clues.every(isClue) || !data.passages.every(isPassage)) throw new Error("get_canon_here returned an unexpected row");
  return { clues: data.clues, passages: data.passages };
}

export async function fetchCanonHere(kind: ClueKind, id: string): Promise<CanonHere> {
  const { data, error } = await supabase.rpc("get_canon_here", { p_kind: kind, p_id: id });
  if (error) throw error;
  return parseCanonHere(data);
}

/**
 * What the canon placed at one place, person or beat, in one read (#1226): the clues lying there and the passages that
 * come out there and are not yet told. Under the `canon` root, so the doorbell's canon rings refresh it.
 */
export function useCanonHere(kind: MaybeRefOrGetter<ClueKind>, id: MaybeRefOrGetter<string>) {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "here", toValue(kind), toValue(id)] as const),
    queryFn: ({ queryKey: [, , k, i] }) => fetchCanonHere(k, i),
    enabled: () => !!campaign.activeCampaignId,
  });
}
