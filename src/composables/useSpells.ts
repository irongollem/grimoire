import { computed, ref, isRef } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Spell, SpellInsert, SpellUpdate } from "@/types/spell.types";
import { removeStorageImages } from "@/composables/useImageUpload";
import { useLibraryArtDefaults } from "@/composables/useLibraryArtDefaults";
import { useEnabledSources } from "@/composables/useEnabledSources";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { isUuid } from "@/lib/library/contentIdentity";
import { useRuleset } from "@/composables/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

const LIBRARY_QUERY_KEY = "library-spells";

const QUERY_KEY = "spells";
export const SPELLS_PAGE_SIZE = 50;

export interface SpellFilters {
  search: string;
  level: string;
  school: string;
  class: string;
  source: string;
}

async function fetchSpellsPage(
  filters: SpellFilters,
  page: number,
): Promise<{ spells: Spell[]; total: number }> {
  let query = supabase
    .from("spells")
    .select("*", { count: "exact" })
    .order("level", { ascending: true })
    .order("name", { ascending: true });

  const name = filters.search.trim();
  if (name) query = query.ilike("name", `%${name}%`);
  if (filters.level !== "") query = query.eq("level", parseInt(filters.level));
  if (filters.school) query = query.eq("school", filters.school);
  if (filters.class) query = query.contains("classes", [filters.class]);
  if (filters.source) query = query.eq("source", filters.source);

  const from = page * SPELLS_PAGE_SIZE;
  query = query.range(from, from + SPELLS_PAGE_SIZE - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { spells: data as Spell[], total: count ?? 0 };
}

export interface SpellSource {
  slug: string;
  title: string | null;
}

async function fetchDistinctSources(): Promise<SpellSource[]> {
  const all: { source: string; source_title: string | null }[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("spells")
      .select("source, source_title")
      .not("source", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data as { source: string; source_title: string | null }[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  // Deduplicate by slug, preferring a non-null title
  const map = new Map<string, string | null>();
  for (const r of all) {
    if (!map.has(r.source) || r.source_title) map.set(r.source, r.source_title);
  }
  return [...map.entries()]
    .map(([slug, title]) => ({ slug, title }))
    .sort((a, b) => (a.title ?? a.slug).localeCompare(b.title ?? b.slug));
}

async function fetchSpells(): Promise<Spell[]> {
  const all: Spell[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("spells")
      .select("*")
      .order("level", { ascending: true })
      .order("name", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data as Spell[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchSpell(id: string): Promise<Spell> {
  const { data, error } = await supabase.from("spells").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Spell;
}

async function createSpell(spell: SpellInsert): Promise<Spell> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("spells")
    .insert({ ...spell, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Spell;
}

async function updateSpell(id: string, update: SpellUpdate): Promise<Spell> {
  const { data, error } = await supabase
    .from("spells")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Spell;
}

async function deleteSpell(spell: Spell): Promise<void> {
  const { error } = await supabase.from("spells").delete().eq("id", spell.id);
  if (error) throw error;
  await removeStorageImages("asset-images", spell.image_url);
}

export function useSpellsPage(filters: Ref<SpellFilters>, page: Ref<number>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "page", filters.value, page.value]),
    queryFn: () => fetchSpellsPage(filters.value, page.value),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

const SOURCES_KEY = "spell-sources";

export function useSpellSources() {
  return useQuery({ queryKey: [SOURCES_KEY], queryFn: fetchDistinctSources, staleTime: Infinity });
}

const OPEN5E_DOCS_KEY = "open5e-documents";

export function useOpen5eDocuments(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: [OPEN5E_DOCS_KEY],
    queryFn: async () => {
      const { fetchOpen5eDocuments } = await import("@/lib/library/open5eSpellImport");
      return fetchOpen5eDocuments();
    },
    staleTime: Infinity,
    enabled,
  });
}

export function useSpells() {
  const spellsQuery = useQuery({ queryKey: [QUERY_KEY], queryFn: fetchSpells, staleTime: Infinity });
  const artDefaults = useLibraryArtDefaults();

  const data = computed(() => {
    const spells = spellsQuery.data.value;
    const defaults = artDefaults.data.value;
    if (!spells || !defaults) return spells;
    return spells.map((spell) => {
      if (spell.image_url || !spell.open5e_import) return spell;
      const d = defaults[`spell:${spell.name.toLowerCase()}`];
      if (!d?.image_url) return spell;
      return { ...spell, image_url: d.image_url, image_focal_point: d.image_focal_point };
    });
  });

  return { ...spellsQuery, data };
}

async function fetchLibrarySpells(enabledSlugs: string[], ruleset: RulesetKey): Promise<Spell[]> {
  if (enabledSlugs.length === 0) return [];
  const { data, error } = await supabase
    .from("library_spells")
    .select("*")
    .in("source", enabledSlugs)
    .eq("ruleset", ruleset)
    .order("level", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, user_id: "" })) as Spell[];
}

/** Returns SRD spells filtered by the campaign's enabled sources + the user's
 *  custom spells, sorted by level then name.
 *
 *  Dedupe rule: if a user-created spell has the same name as an SRD row,
 *  the user row wins — preserving any edits or custom art. */
export function useAllSpells() {
  const customQuery  = useSpells();
  const enabledQuery = useEnabledSources();
  const campaign     = useCampaignStore();
  const { ruleset }  = useRuleset();

  const enabledSlugs = computed(() =>
    enabledQuery.data.value?.map((e) => e.source_slug) ?? null,
  );

  const libraryQuery = useQuery({
    queryKey: computed(() => [LIBRARY_QUERY_KEY, enabledSlugs.value, ruleset.value]),
    queryFn: () => fetchLibrarySpells(enabledSlugs.value!, ruleset.value),
    enabled: () => enabledSlugs.value !== null,
    staleTime: Infinity,
  });

  const data = computed<Spell[]>(() => {
    // Open5e imports in the spells table are legacy — those now come from library_spells.
    // Only surface truly custom-created spells from the user's table. Campaign-only
    // spells (campaign_id set) are hidden outside their owning campaign.
    const activeCampaignId = campaign.activeCampaignId;
    const custom = (customQuery.data.value ?? []).filter(
      (s) => !s.open5e_import
        && (!s.ruleset || s.ruleset === ruleset.value)
        && (!s.campaign_id || s.campaign_id === activeCampaignId),
    );
    const srd    = libraryQuery.data.value ?? [];
    return [...srd, ...custom]
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  });

  const isLoading = computed(
    () => customQuery.isLoading.value || enabledQuery.isLoading.value || libraryQuery.isLoading.value,
  );

  return { data, isLoading };
}

export function useSpell(id: string | Ref<string>) {
  const idRef = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: () => fetchSpell(idRef.value),
    enabled: computed(() => !!idRef.value),
  });
}

export function useLibrarySpell(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [LIBRARY_QUERY_KEY, id.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("library_spells")
        .select("*")
        .eq("id", id.value)
        .single();
      if (error) throw error;
      return { ...data, user_id: "" } as Spell;
    },
    enabled: () => !!id.value,
    staleTime: Infinity,
  });
}

/** Resolve an opaque spell ID against explicit shared/custom stores. */
export function useResolvedSpell(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => ["resolved-spell", id.value]),
    queryFn: async () => {
      const { data: shared, error: sharedError } = await supabase
        .from("library_spells").select("*").eq("id", id.value).maybeSingle();
      if (sharedError) throw sharedError;
      if (shared) return { spell: { ...shared, user_id: "" } as Spell, isShared: true };
      if (!isUuid(id.value)) throw new Error("Spell not found");
      return { spell: await fetchSpell(id.value), isShared: false };
    },
    enabled: () => !!id.value,
  });
}

export function useCreateSpell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSpell,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateSpell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: SpellUpdate }) => updateSpell(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteSpell() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: deleteSpell,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

