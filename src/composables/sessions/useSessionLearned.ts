import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useParty } from "@/composables/party/useParty";
import { useCampaignStore } from "@/stores/campaign";
import {
  SESSION_LEARNED_KEY,
  shapeLearned,
  type CombatRow,
  type CreatureRow,
  type LearnedEntry,
  type LearnedRaw,
  type QuestStepRow,
  type RevealRow,
} from "@/lib/sessions/learned";


/** A PostgREST embed arrives as an object, or a one-item array in some shapes. */
function embeddedName(value: unknown, column: string): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (typeof row !== "object" || row === null) return null;
  const name = (row as Record<string, unknown>)[column];
  return typeof name === "string" && name.trim() ? name : null;
}

interface RevealDbRow {
  party_member_id: string;
  revealed_at: string;
  approximate: boolean;
  session_id: string | null;
  [column: string]: unknown;
}

interface RevealQuery {
  table: "npc_reveals" | "location_reveals" | "handout_reveals";
  entityColumn: string;
  embed: string;
  nameColumn: string;
  fallback: string;
}

const REVEAL_QUERIES: Record<"person" | "place" | "handout", RevealQuery> = {
  person: { table: "npc_reveals", entityColumn: "npc_id", embed: "npcs(name)", nameColumn: "npcs", fallback: "Someone" },
  place: { table: "location_reveals", entityColumn: "location_id", embed: "locations(name)", nameColumn: "locations", fallback: "A place" },
  handout: { table: "handout_reveals", entityColumn: "document_id", embed: "scriptorium_documents(title)", nameColumn: "scriptorium_documents", fallback: "A handout" },
};

async function fetchReveals(
  campaignId: string,
  sessionId: string | null,
  spec: RevealQuery,
): Promise<RevealRow[]> {
  const data = await fetchAllRows<RevealDbRow>((from, to) => {
    const base = supabase
      .from(spec.table)
      .select(`${spec.entityColumn}, party_member_id, revealed_at, approximate, session_id, ${spec.embed}`)
      .eq("campaign_id", campaignId);
    return (sessionId === null ? base.is("session_id", null) : base.eq("session_id", sessionId))
      .order(spec.entityColumn)
      .order("party_member_id")
      .range(from, to) as unknown as PromiseLike<{ data: RevealDbRow[] | null; error: PostgrestError | null }>;
  });
  return data.map((r) => ({
    entityId: String(r[spec.entityColumn]),
    name: embeddedName(r[spec.nameColumn], spec.table === "handout_reveals" ? "title" : "name") ?? spec.fallback,
    partyMemberId: r.party_member_id,
    revealedAt: r.revealed_at,
    approximate: r.approximate,
    sessionId: r.session_id,
  }));
}

interface CreatureDbRow {
  id: string;
  monster_id: string | null;
  library_monster_id: string | null;
  visible_to: string[] | null;
  discovered_at: string;
  session_id: string | null;
  monsters: unknown;
}

async function fetchCreatures(campaignId: string, sessionId: string | null): Promise<CreatureRow[]> {
  const rows = await fetchAllRows<CreatureDbRow>((from, to) => {
    const base = supabase
      .from("discovered_monsters")
      .select("id, monster_id, library_monster_id, visible_to, discovered_at, session_id, monsters(name)")
      .eq("campaign_id", campaignId);
    return (sessionId === null ? base.is("session_id", null) : base.eq("session_id", sessionId))
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: CreatureDbRow[] | null; error: PostgrestError | null }>;
  });

  const libraryIds = rows.flatMap((r) => (r.library_monster_id ? [r.library_monster_id] : []));
  const libraryNames = new Map<string, string>();
  if (libraryIds.length > 0) {
    const { data: lib, error: libError } = await supabase.from("library_monsters").select("id, name").in("id", libraryIds);
    if (libError) throw libError;
    for (const m of lib as unknown as { id: string; name: string }[]) libraryNames.set(m.id, m.name);
  }

  return rows.flatMap((r) => {
    const entityId = r.monster_id ?? r.library_monster_id;
    if (!entityId) return [];
    const name = r.monster_id ? embeddedName(r.monsters, "name") : libraryNames.get(entityId) ?? null;
    return [{
      id: r.id,
      entityId,
      name: name ?? "A creature",
      visibleTo: r.visible_to,
      discoveredAt: r.discovered_at,
      sessionId: r.session_id,
    }];
  });
}

interface QuestDbRow {
  id: string;
  to_quest_id: string;
  to_quest_title: string | null;
  to_beat_title: string | null;
  transition_kind: string;
  created_at: string;
  seq: number;
  session_id: string | null;
}

async function fetchQuestSteps(campaignId: string, sessionId: string | null): Promise<QuestStepRow[]> {
  const data = await fetchAllRows<QuestDbRow>((from, to) => {
    const base = supabase
      .from("quest_beat_transitions")
      .select("id, to_quest_id, to_quest_title, to_beat_title, transition_kind, created_at, seq, session_id")
      .eq("campaign_id", campaignId);
    return (sessionId === null ? base.is("session_id", null) : base.eq("session_id", sessionId))
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: QuestDbRow[] | null; error: PostgrestError | null }>;
  });
  return data.map((r) => ({
    id: r.id,
    questId: r.to_quest_id,
    questTitle: r.to_quest_title?.trim() || "A quest",
    beatTitle: r.to_beat_title,
    transitionKind: r.transition_kind,
    createdAt: r.created_at,
    seq: r.seq,
    sessionId: r.session_id,
  }));
}

interface CombatDbRow {
  id: string;
  encounter_id: string;
  started_at: string | null;
  updated_at: string;
  session_id: string | null;
  encounters: unknown;
}

/** Combat is filed by the runner when it goes live, and is not moved from here. */
async function fetchCombat(campaignId: string, sessionId: string): Promise<CombatRow[]> {
  const { data, error } = await supabase
    .from("encounter_state")
    .select("id, encounter_id, started_at, updated_at, session_id, encounters(name)")
    .eq("campaign_id", campaignId)
    .eq("session_id", sessionId);
  if (error) throw error;
  return (data as unknown as CombatDbRow[]).map((r) => ({
    id: r.id,
    encounterId: r.encounter_id,
    name: embeddedName(r.encounters, "name") ?? "A fight",
    whenIso: r.started_at ?? r.updated_at,
    sessionId: r.session_id,
  }));
}

async function fetchLearned(campaignId: string, sessionId: string | null): Promise<LearnedRaw> {
  const [person, place, handout, creatures, quests, combat] = await Promise.all([
    fetchReveals(campaignId, sessionId, REVEAL_QUERIES.person),
    fetchReveals(campaignId, sessionId, REVEAL_QUERIES.place),
    fetchReveals(campaignId, sessionId, REVEAL_QUERIES.handout),
    fetchCreatures(campaignId, sessionId),
    fetchQuestSteps(campaignId, sessionId),
    sessionId === null ? Promise.resolve([]) : fetchCombat(campaignId, sessionId),
  ]);
  return { person, place, handout, creatures, quests, combat };
}

/**
 * What the party learned, for one session (`sessionId`) or for none
 * (`null`: the unsorted list). The query key starts with `session-learned`,
 * which the campaign channel invalidates when a reveal-writing table changes.
 */
function useLearned(sessionId: MaybeRefOrGetter<string | null>) {
  const campaign = useCampaignStore();
  const { data: party } = useParty();
  const query = useQuery({
    queryKey: computed(() => [SESSION_LEARNED_KEY, campaign.activeCampaignId, toValue(sessionId) ?? "unsorted"] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (cid === null) throw new Error("Learned moments fetched without a campaign");
      return fetchLearned(cid, toValue(sessionId));
    },
    enabled: () => !!campaign.activeCampaignId,
  });
  const entries = computed<LearnedEntry[]>(() =>
    query.data.value ? shapeLearned(query.data.value, party.value ?? []) : [],
  );
  return { entries, isLoading: query.isLoading, error: query.error };
}

export function useSessionLearned(sessionId: MaybeRefOrGetter<string>) {
  return useLearned(() => toValue(sessionId));
}

export function useUnsortedLearned() {
  return useLearned(() => null);
}

export interface MoveLearnedInput {
  entries: readonly LearnedEntry[];
  /** The session to file them under; null takes them out of any session. */
  sessionId: string | null;
}

/** Updates `session_id` on every row behind the entries, the one column a DM may change. */
export function useMoveLearned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entries, sessionId }: MoveLearnedInput): Promise<void> => {
      const refs = entries.flatMap((e) => e.recordRefs);
      const results = await Promise.all(
        refs.map((ref) => supabase.from(ref.table).update({ session_id: sessionId }).match({ ...ref.match })),
      );
      for (const { error } of results) {
        if (error) throw error;
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [SESSION_LEARNED_KEY] });
      // The same reveal rows back the log's people counts and the unsorted count.
      void queryClient.invalidateQueries({ queryKey: ["npc-reveals"] });
    },
  });
}

export type FileSharedInput =
  | {
      table: "npc_reveals" | "location_reveals" | "handout_reveals";
      entityColumn: "npc_id" | "location_id" | "document_id";
      entityId: string;
      memberIds: readonly string[];
      sessionId: string;
    }
  | { table: "discovered_monsters"; id: string; sessionId: string };

/**
 * Files what a DM has just shared under a session: the share itself has
 * resolved, so its reveal rows exist (they are written in the same transaction
 * by trigger) and only need their session set. A reveal already in this
 * session is left as it is.
 */
export function useFileShared() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FileSharedInput): Promise<void> => {
      if (input.table === "discovered_monsters") {
        const { error } = await supabase
          .from("discovered_monsters")
          .update({ session_id: input.sessionId })
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from(input.table)
        .update({ session_id: input.sessionId })
        .eq(input.entityColumn, input.entityId)
        .in("party_member_id", [...input.memberIds])
        .or(`session_id.is.null,session_id.neq.${input.sessionId}`);
      if (error) throw error;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [SESSION_LEARNED_KEY] });
      // The same reveal rows back the log's people counts and the unsorted count.
      void queryClient.invalidateQueries({ queryKey: ["npc-reveals"] });
    },
  });
}
