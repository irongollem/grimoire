import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { useIsRuleEnabled } from "@/composables/rules/useOptionalRules";
import { parseInvention } from "@/lib/crafting/invention";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { CraftingDiscipline, CraftingInvention } from "@/types/crafting.types";

export const INVENTION_COST_KEY = "recipe_invention";
export const INVENTION_WISH_LIMIT = 1000;
export const INVENTION_NOTE_LIMIT = 500;

/** Inventing needs the campaign's optional rule and its AI switch, both on. */
export function useInventionAvailable() {
  const ruleOn = useIsRuleEnabled("crafting_ai_invention");
  const campaign = useCampaignStore();
  return computed(() => ruleOn.value && campaign.isAiEnabled);
}

/** The refusals a player can cause, in words; anything else keeps its own message. */
export function inventionErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
  if (code === "42501") return "Only this character's own player can send it.";
  if (code === "CX003") return "This draft has already been sent.";
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/** What the edge function answers to a materials request: a draft, or the reason there is none. */
export type InventAnswer = { kind: "invention"; invention: CraftingInvention } | { kind: "nothing"; reason: string };

interface InventBody {
  action: "materials" | "idea" | "revise";
  [key: string]: unknown;
}

async function callInvent(body: InventBody): Promise<InventAnswer> {
  const { data, error } = await supabase.functions.invoke("invent-recipe", { body });
  if (error) throw new Error(await edgeErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  if (data?.result === "nothing") {
    return { kind: "nothing", reason: typeof data.reason === "string" ? data.reason : "" };
  }
  return { kind: "invention", invention: parseInvention(data?.invention) };
}

/** The caller's own inventions for one character (and craft), newest change first. */
export function useMyInventions(partyMemberId: () => string | null, discipline: () => CraftingDiscipline | null) {
  const auth = useAuthStore();
  return useQuery({
    queryKey: computed(() => ["crafting-inventions", "mine", partyMemberId(), discipline()] as const),
    enabled: () => partyMemberId() !== null && !!auth.user,
    queryFn: async (): Promise<CraftingInvention[]> => {
      const memberId = partyMemberId();
      if (!memberId || !auth.user) return [];
      let q = supabase
        .from("crafting_inventions")
        .select("*")
        .eq("user_id", auth.user.id)
        .eq("party_member_id", memberId);
      const d = discipline();
      if (d) q = q.eq("discipline", d);
      const { data, error } = await q.order("updated_at", { ascending: false });
      if (error) throw error;
      if (!data) return [];
      return data.map(parseInvention);
    },
  });
}

/**
 * The player's inventor actions (#1103). Each one invalidates the notebook on success; while any
 * runs, a second press does nothing, so a draft is never paid for or sent twice.
 */
export function useCraftInventions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["crafting-inventions"] });

  const materials = useMutation({
    mutationFn: (v: { memberId: string; discipline: CraftingDiscipline; rowIds: string[] }) =>
      callInvent({ action: "materials", party_member_id: v.memberId, discipline: v.discipline, row_ids: v.rowIds }),
    onSuccess: refresh,
  });
  const idea = useMutation({
    mutationFn: (v: { memberId: string; discipline: CraftingDiscipline; wish: string; rowIds: string[] }) =>
      callInvent({
        action: "idea",
        party_member_id: v.memberId,
        discipline: v.discipline,
        wish: v.wish,
        ...(v.rowIds.length > 0 ? { row_ids: v.rowIds } : {}),
      }),
    onSuccess: refresh,
  });
  const reviseM = useMutation({
    mutationFn: (v: { id: string; note: string }) => callInvent({ action: "revise", invention_id: v.id, note: v.note }),
    onSuccess: refresh,
  });
  const submitM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("submit_crafting_invention", { p_invention_id: id });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const discardM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crafting_inventions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const all = [materials, idea, reviseM, submitM, discardM];
  const busy = computed(() => all.some((m) => m.isPending.value));

  /** Runs a mutation unless one is already in flight; resolves with its result, or null when it did nothing or failed. */
  async function guarded<V, R>(m: { mutateAsync: (v: V) => Promise<R> }, vars: V): Promise<R | null> {
    if (busy.value) return null;
    try {
      return await m.mutateAsync(vars);
    } catch {
      // The failure is the mutation's own state (`*Error`), shown by the caller.
      return null;
    }
  }

  const errorOf = (m: { error: { value: unknown } }) => (m.error.value ? inventionErrorMessage(m.error.value) : null);

  return {
    busy,
    inventFromMaterials: (memberId: string, discipline: CraftingDiscipline, rowIds: string[]) =>
      guarded(materials, { memberId, discipline, rowIds }),
    inventFromIdea: (memberId: string, discipline: CraftingDiscipline, wish: string, rowIds: string[] = []) =>
      guarded(idea, { memberId, discipline, wish, rowIds }),
    revise: (id: string, note: string) => guarded(reviseM, { id, note }),
    submit: (id: string) => guarded(submitM, id),
    discard: (id: string) => guarded(discardM, id),
    materialsPending: computed(() => materials.isPending.value),
    ideaPending: computed(() => idea.isPending.value),
    revisePending: computed(() => reviseM.isPending.value),
    submitPending: computed(() => submitM.isPending.value),
    discardPending: computed(() => discardM.isPending.value),
    materialsError: computed(() => errorOf(materials)),
    ideaError: computed(() => errorOf(idea)),
    reviseError: computed(() => errorOf(reviseM)),
    submitError: computed(() => errorOf(submitM)),
    discardError: computed(() => errorOf(discardM)),
    resetMaterials: () => materials.reset(),
    resetIdea: () => idea.reset(),
    resetRevise: () => reviseM.reset(),
    resetSubmit: () => submitM.reset(),
  };
}
