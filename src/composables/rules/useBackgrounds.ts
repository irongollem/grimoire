import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Background, BackgroundInsert, BackgroundUpdate } from "@/types/background.types";
import { removeStorageImages } from "@/composables/useImageUpload";
import { useContentScope, useRuleset } from "@/composables/rules/useRuleset";
import { useUserEnabledSources } from "@/composables/library/useEnabledSources";
import { LEGACY_DOCUMENT_KEY_ALIASES } from "@/lib/library/open5eApi";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { RulesetKey } from "@/types/ruleset.types";

const QUERY_KEY = "backgrounds";
const OPEN5E_DOCS_KEY = "open5e-background-documents";

/**
 * Which Open5e documents a table-less player's backgrounds are seeded from: the
 * SRD of the character's edition, plus every book the player enabled. Backgrounds
 * have no shared library table, so they are copied into the player's own table
 * from Open5e on read, and the books they enabled are the only thing that widens
 * the set. Slugs are our own keys; Open5e knows a few of them by another name.
 * `grimoire-bundled` is our own content and is never asked of Open5e.
 */
export function backgroundSeedDocuments(ruleset: RulesetKey, userSlugs: readonly string[]): string[] {
  const baseline = ruleset === "2024" ? "srd-2024" : "srd-2014";
  const keys = [baseline, ...userSlugs]
    .filter((slug) => slug !== "grimoire-bundled")
    .map((slug) => LEGACY_DOCUMENT_KEY_ALIASES[slug] ?? slug);
  return [...new Set(keys)];
}

async function fetchBackgrounds(
  ruleset: RulesetKey,
  seedDocuments: string[] | null = null,
): Promise<Background[]> {
  let { data, error } = await supabase
    .from("backgrounds")
    .select("*")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("name", { ascending: true });
  if (error) throw error;

  if (seedDocuments) {
    const user = getCurrentUser();
    if (!user) return (data ?? []) as Background[];
    const { fetchBackgrounds: fetchFromOpen5e } = await import(
      "@/lib/library/open5eBackgroundImport"
    );
    const seeded = await fetchFromOpen5e(seedDocuments);
    const existingIdentities = new Set(
      (data ?? []).map((row) => `${row.source_document_key}::${row.source_record_key}`),
    );
    const missing = seeded
      .filter((row) => !existingIdentities.has(`${row.source_document_key}::${row.source_record_key}`))
      .map((row) => ({ ...row, user_id: user.id }));
    if (missing.length > 0) {
      const { error: insertError } = await supabase.from("backgrounds").insert(missing);
      // A concurrent mount may have inserted the same baseline first.
      if (insertError && insertError.code !== "23505") throw insertError;
      ({ data, error } = await supabase
        .from("backgrounds")
        .select("*")
        .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
        .order("name", { ascending: true }));
      if (error) throw error;
    }
  }
  return (data ?? []) as Background[];
}

async function fetchBackground(id: string): Promise<Background> {
  const { data, error } = await supabase.from("backgrounds").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Background;
}

async function createBackground(bg: BackgroundInsert): Promise<Background> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("backgrounds")
    .insert({ ...bg, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Background;
}

async function updateBackground(id: string, update: BackgroundUpdate): Promise<Background> {
  const { data, error } = await supabase
    .from("backgrounds")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Background;
}

async function deleteBackground(bg: Background): Promise<void> {
  const { error } = await supabase.from("backgrounds").delete().eq("id", bg.id);
  if (error) throw error;
  await removeStorageImages("asset-images", bg.image_url);
}

export function useBackgrounds() {
  const { ruleset } = useRuleset();
  const { standalone } = useContentScope();
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const userSources = useUserEnabledSources();
  // Standalone reads seed from the player's books, so they wait for those rows
  // (signed out there are none to wait for, and nothing is seeded anyway).
  const userSlugs = computed<string[] | null>(() => {
    if (!standalone.value) return [];
    if (!auth.user) return [];
    return userSources.data.value ? userSources.data.value.map((e) => e.source_slug) : null;
  });
  return useQuery({
    queryKey: computed(
      () => [QUERY_KEY, ruleset.value, campaign.activeCampaignId, standalone.value, userSlugs.value] as const,
    ),
    queryFn: ({ queryKey: [, rs, , isStandalone, slugs] }) =>
      fetchBackgrounds(rs, isStandalone && slugs ? backgroundSeedDocuments(rs, slugs) : null),
    enabled: () => userSlugs.value !== null,
    staleTime: Infinity,
  });
}

/** Returns a Map<background_id, background_name> for fast inline lookups. */
export function useBackgroundNameMap() {
  const { data } = useBackgrounds();
  return computed(() => {
    const m = new Map<string, string>();
    for (const bg of data.value ?? []) m.set(bg.id, bg.name);
    return m;
  });
}

export function useBackground(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value] as const),
    queryFn: ({ queryKey: [, bgId] }) => fetchBackground(bgId),
    enabled: () => !!id.value,
  });
}

export function useCreateBackground() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBackground,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateBackground() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: BackgroundUpdate }) =>
      updateBackground(id, update),
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteBackground() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBackground,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

// ── Open5e runtime import ─────────────────────────────────────────────────────

/** Open5e documents — lazy query, fires only when the source picker opens. */
export function useOpen5eBackgroundDocuments(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: [OPEN5E_DOCS_KEY],
    queryFn: async () => {
      const { fetchOpen5eDocuments } = await import("@/lib/library/open5eBackgroundImport");
      return fetchOpen5eDocuments();
    },
    staleTime: Infinity,
    enabled,
  });
}

export type BackgroundImportResult = { inserted: number; updated: number };

/**
 * Pulls backgrounds from the selected Open5e documents and upserts them into
 * the `backgrounds` table as `open5e_import: true`. Mirrors the Spells /
 * Monsters sync shape: insert by provider identity, update existing rows in
 * place when source / description / features change, never touch
 * user-uploaded art.
 */
export function useImportBackgrounds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceSlugs: string[]): Promise<BackgroundImportResult> => {
      const { fetchBackgrounds: fetchFromOpen5e } = await import("@/lib/library/open5eBackgroundImport");
      const backgrounds = await fetchFromOpen5e(sourceSlugs.length > 0 ? sourceSlugs : undefined);
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");

      type ExistingRow = {
        id: string;
        source_document_key: string;
        source_record_key: string;
      };
      const { data: existingData, error: existingError } = await supabase
        .from("backgrounds")
        .select("id, source_document_key, source_record_key")
        .eq("user_id", user.id)
        .eq("open5e_import", true)
        .not("source_document_key", "is", null)
        .not("source_record_key", "is", null);
      if (existingError) throw existingError;
      const existing = (existingData ?? []) as ExistingRow[];
      const existingMap = new Map(existing.map((row) => [
        `${row.source_document_key}::${row.source_record_key}`,
        row.id,
      ]));
      const identity = (background: BackgroundInsert) =>
        `${background.source_document_key}::${background.source_record_key}`;

      const toInsert = backgrounds.filter((background) => !existingMap.has(identity(background)));
      const INSERT_BATCH = 100;
      for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
        const batch = toInsert
          .slice(i, i + INSERT_BATCH)
          .map((b) => ({ ...b, user_id: user.id }));
        const { error } = await supabase.from("backgrounds").insert(batch);
        if (error) throw error;
      }

      const toUpdate = backgrounds.filter((background) => existingMap.has(identity(background)));

      const UPDATE_CONCURRENCY = 25;
      for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
        await Promise.all(
          toUpdate.slice(i, i + UPDATE_CONCURRENCY).map(async (b) => {
            const { error } = await supabase
              .from("backgrounds")
              .update(b)
              .eq("id", existingMap.get(identity(b))!);
            if (error) throw error;
          }),
        );
      }

      return { inserted: toInsert.length, updated: toUpdate.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
