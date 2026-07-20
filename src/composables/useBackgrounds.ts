import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Background, BackgroundInsert, BackgroundUpdate } from "@/types/background.types";
import { removeStorageImages } from "@/composables/useImageUpload";
import { useRuleset } from "@/composables/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

const QUERY_KEY = "backgrounds";
const OPEN5E_DOCS_KEY = "open5e-background-documents";

async function fetchBackgrounds(ruleset: RulesetKey): Promise<Background[]> {
  const { data, error } = await supabase
    .from("backgrounds")
    .select("*")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("name", { ascending: true });
  if (error) throw error;
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
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, ruleset.value]),
    queryFn: () => fetchBackgrounds(ruleset.value),
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
    queryKey: [QUERY_KEY, id] as unknown as readonly unknown[],
    queryFn: () => fetchBackground(id.value),
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
      const { fetchOpen5eDocuments } = await import("@/lib/open5eBackgroundImport");
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
      const { fetchBackgrounds: fetchFromOpen5e } = await import("@/lib/open5eBackgroundImport");
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
