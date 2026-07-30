import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useEnabledSources } from "@/composables/useEnabledSources";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import type { Monster, MonsterInsert, MonsterUpdate } from "@/types/monster.types";
import { useToast } from "@/composables/useToast";
import { deleteByPublicUrl } from "@/lib/storage";
import { isUuid } from "@/lib/contentIdentity";
import { useRuleset } from "@/composables/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";


const QUERY_KEY = "monsters";
const SOURCES_KEY = "monster-sources";
const OPEN5E_DOCS_KEY = "open5e-monster-documents";

async function fetchMonsters(): Promise<Monster[]> {
  const all: Monster[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("monsters")
      .select("*")
      .order("name", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data as Monster[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchMonster(id: string): Promise<Monster> {
  const { data, error } = await supabase.from("monsters").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Monster;
}

async function createMonster(monster: MonsterInsert): Promise<Monster> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("monsters")
    .insert({ ...monster, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Monster;
}

async function updateMonster(id: string, update: MonsterUpdate): Promise<Monster> {
  const { data, error } = await supabase
    .from("monsters")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Monster;
}

async function deleteMonster(monster: Monster): Promise<void> {
  const { error } = await supabase.from("monsters").delete().eq("id", monster.id);
  if (error) throw error;
  await deleteByPublicUrl(monster.image_url);
}

const SRD_QUERY_KEY = "srd-monsters";

async function fetchSrdMonsters(enabledSlugs: string[], ruleset: RulesetKey): Promise<Monster[]> {
  if (enabledSlugs.length === 0) return [];
  const { data, error } = await supabase
    .from("srd_monsters")
    .select("*")
    .in("source", enabledSlugs)
    .eq("ruleset", ruleset)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, user_id: "" })) as Monster[];
}

export function useMonsters() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchMonsters, staleTime: Infinity });
}

/** Returns SRD monsters filtered by the campaign's enabled sources + the user's
 *  custom monsters, sorted by name.
 *
 *  Dedupe rule: if a user-owned monster has the same name as an SRD row,
 *  the user row wins — preserving any edits or custom art. */
export function useAllMonsters() {
  const customQuery  = useMonsters();
  const enabledQuery = useEnabledSources();
  const { ruleset } = useRuleset();

  const enabledSlugs = computed(() =>
    enabledQuery.data.value?.map((e) => e.source_slug) ?? null,
  );

  const srdQuery = useQuery({
    queryKey: computed(() => [SRD_QUERY_KEY, enabledSlugs.value, ruleset.value]),
    queryFn: () => fetchSrdMonsters(enabledSlugs.value!, ruleset.value),
    enabled: () => enabledSlugs.value !== null,
    staleTime: Infinity,
  });

  const data = computed<Monster[]>(() => {
    // Open5e imports in the monsters table are legacy — those now come from srd_monsters.
    // Only surface truly custom-created monsters from the user's table.
    const custom  = (customQuery.data.value ?? []).filter((m) =>
      !m.open5e_import && (!m.ruleset || m.ruleset === ruleset.value),
    );
    const srd     = srdQuery.data.value ?? [];
    return [...srd, ...custom]
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  const isLoading = computed(
    () => customQuery.isLoading.value || enabledQuery.isLoading.value || srdQuery.isLoading.value,
  );
  return { data, isLoading };
}

/** Custom monsters this player may see in a campaign, via the SECURITY DEFINER
 *  `get_player_visible_monsters` projection: rows are gated on the player's
 *  `discovered_monsters.visible_to`, `stat_block` is nulled unless the discovery
 *  revealed stats, and DM `notes`/`description` are stripped. This is the ONLY
 *  player read path for custom monsters — the base table's player SELECT branch
 *  was dropped (20260711000011) so it can't be mined via devtools. */
async function fetchPlayerVisibleMonsters(campaignId: string): Promise<Monster[]> {
  const { data, error } = await supabase.rpc("get_player_visible_monsters", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
  return (data ?? []) as Monster[];
}

/** Player-facing sibling of {@link useAllMonsters}: SRD reference monsters (public)
 *  plus this player's visible CUSTOM monsters from the projection. In DM preview
 *  mode the DM owns the rows and needs the full list (including undiscovered
 *  beasts for the "share all eligible" affordance), so it reads the base table
 *  directly instead — mirroring the visibility handling the player views already
 *  do client-side. */
export function usePlayerVisibleMonsters() {
  const ui = useUiStore();
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const enabledQuery = useEnabledSources();
  const { ruleset } = useRuleset();

  const enabledSlugs = computed(() =>
    enabledQuery.data.value?.map((e) => e.source_slug) ?? null,
  );

  const srdQuery = useQuery({
    queryKey: computed(() => [SRD_QUERY_KEY, enabledSlugs.value, ruleset.value]),
    queryFn: () => fetchSrdMonsters(enabledSlugs.value!, ruleset.value),
    enabled: () => enabledSlugs.value !== null,
    staleTime: Infinity,
  });

  // Real player → gated projection. Keyed on campaign so it refetches per game.
  const projectionQuery = useQuery({
    queryKey: computed(() => [QUERY_KEY, "player-visible", campaignId.value]),
    queryFn: () => fetchPlayerVisibleMonsters(campaignId.value!),
    enabled: () => !!campaignId.value && !ui.dmPreviewMode,
    staleTime: Infinity,
  });

  // DM preview → full owned list (shares the `[QUERY_KEY]` cache with useMonsters).
  const baseQuery = useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchMonsters,
    enabled: () => ui.dmPreviewMode,
    staleTime: Infinity,
  });

  const data = computed<Monster[]>(() => {
    // Open5e imports are legacy in the monsters table — those surface via
    // srd_monsters instead, so drop them from the custom side (same rule as
    // useAllMonsters).
    const custom = ((ui.dmPreviewMode ? baseQuery.data.value : projectionQuery.data.value) ?? [])
      .filter((m) => !m.open5e_import && (!m.ruleset || m.ruleset === ruleset.value));
    const srd = srdQuery.data.value ?? [];
    return [...srd, ...custom]
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  const isLoading = computed(
    () =>
      enabledQuery.isLoading.value ||
      srdQuery.isLoading.value ||
      (ui.dmPreviewMode ? baseQuery.isLoading.value : projectionQuery.isLoading.value),
  );
  return { data, isLoading };
}

/** Looks up a single monster from the shared srd_monsters table by its slug ID. */
export function useSrdMonster(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [SRD_QUERY_KEY, id.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("srd_monsters")
        .select("*")
        .eq("id", id.value)
        .single();
      if (error) throw error;
      return { ...data, user_id: "" } as Monster;
    },
    enabled: () => !!id.value,
    staleTime: Infinity,
  });
}

/** Resolve an opaque monster ID against explicit shared/custom stores. */
export function useResolvedMonster(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => ["resolved-monster", id.value]),
    queryFn: async () => {
      const { data: shared, error: sharedError } = await supabase
        .from("srd_monsters").select("*").eq("id", id.value).maybeSingle();
      if (sharedError) throw sharedError;
      if (shared) return { monster: { ...shared, user_id: "", is_srd: true } as Monster, isShared: true };
      if (!isUuid(id.value)) throw new Error("Monster not found");
      return { monster: await fetchMonster(id.value), isShared: false };
    },
    enabled: () => !!id.value,
  });
}

export function useMonster(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchMonster(id.value),
    enabled: () => !!id.value,
  });
}

export function useCreateMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMonster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: MonsterUpdate }) =>
      updateMonster(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteMonster() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: deleteMonster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}


/** Clone an SRD monster into the user's own collection. Returns the new Monster. */
export function useCloneSrdMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (srdMonster: Monster): Promise<Monster> => {
      const { name, monster_type, size, alignment, habitat, source, tags, stat_block, notes, image_url } = srdMonster;
      return createMonster({ name, monster_type, size, alignment, habitat, source: `${source ?? "SRD 5.1"} (customized)`, tags, stat_block, notes, image_url });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

// ── Open5e runtime import ────────────────────────────────────────────────────

/** Distinct source slugs across the user's imported monsters — feeds the Source filter dropdown. */
export function useMonsterSources() {
  return useQuery({
    queryKey: [SOURCES_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monsters")
        .select("source, source_title")
        .eq("open5e_import", true);
      if (error) throw error;
      const seen = new Map<string, { slug: string; title: string }>();
      for (const row of (data ?? []) as Array<{ source: string | null; source_title: string | null }>) {
        if (row.source && !seen.has(row.source)) {
          seen.set(row.source, { slug: row.source, title: row.source_title ?? row.source });
        }
      }
      return Array.from(seen.values()).sort((a, b) => a.title.localeCompare(b.title));
    },
    staleTime: Infinity,
  });
}

/** Open5e documents (SRD, Tome of Beasts, Creature Codex, …). Shared endpoint
 *  with spells but keyed separately so each section's enabled state is local. */
export function useOpen5eMonsterDocuments(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: [OPEN5E_DOCS_KEY],
    queryFn: async () => {
      const { fetchOpen5eDocuments } = await import("@/lib/open5eMonsterImport");
      return fetchOpen5eDocuments();
    },
    staleTime: Infinity,
    enabled,
  });
}

